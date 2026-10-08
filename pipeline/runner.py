"""Implementation of the pipeline commands."""
import collections
import concurrent.futures as cf
import json
import os
import random
import re
import time

from PIL import Image, ImageDraw

from . import cache, config, discover, extract, groups, net, verify
from .search import Budget, ledger_total, serpapi

PAID = {'brave_web', 'brave_images', 'serpapi_google_images'}


def _store():
    return cache.search_store()


def _results(run):
    return dict(_store().items(f'result:{run}'))


def _write_json(name, obj):
    os.makedirs(config.RESULTS, exist_ok=True)
    with open(os.path.join(config.RESULTS, name), 'w') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def _export(run, ids=None):
    rows = _results(run)
    if ids is not None:
        rows = {k: v for k, v in rows.items() if k in ids}
    os.makedirs(config.RESULTS, exist_ok=True)
    with open(os.path.join(config.RESULTS, f'{run}.jsonl'), 'w') as f:
        for k in sorted(rows):
            f.write(json.dumps(rows[k], ensure_ascii=False) + '\n')
    return rows


# ---------------------------------------------------------------- batch

def run_groups(run, gs, data, providers, budget, workers=8, redo=False, log=True):
    store = _store()
    done = {} if redo else _results(run)
    todo = [g for g in gs if g['id'] not in done]
    if log:
        print(f'{run}: {len(gs)} groups, {len(gs) - len(todo)} already done, {len(todo)} to process; '
              f'providers={",".join(providers)} budget=${budget.limit:.2f}{" DRY RUN" if budget.dry else ""}', flush=True)
    t0 = time.time()
    n = 0

    def one(g):
        r = discover.process(g, data, budget, providers=providers, offline=budget.dry)
        r['run'] = run
        return r

    with cf.ThreadPoolExecutor(workers) as ex:
        for r in ex.map(one, todo):
            n += 1
            if not budget.dry:
                store.put(f'result:{run}', r['id'], r)
            done[r['id']] = r
            if log and n % 25 == 0:
                ok = sum(1 for x in done.values() if x['accepted'])
                print(f'  {n}/{len(todo)} processed, {ok} groups with photos, ${budget.spent:.3f} spent, {time.time() - t0:.0f}s', flush=True)
    return done


def summarize(rows, budget=None):
    rows = list(rows)
    fail = collections.Counter(re.sub(r':.*', '', r['failure']) for r in rows if r['failure'])
    detail = collections.Counter(r['failure'] for r in rows if r['failure'])
    out = {
        'groups': len(rows),
        'groups_with_photos': sum(1 for r in rows if r['accepted']),
        'photos': sum(len(r['accepted']) for r in rows),
        'photos_attributed_to_a_model': sum(1 for r in rows for a in r['accepted'] if a['talent']),
        'failures': dict(fail.most_common()),
        'failure_details': dict(detail.most_common(15)),
        'found_via': dict(collections.Counter(a['via'] for r in rows for a in r['accepted'][:1]).most_common()),
        # campaign confirmed but the credited model is not named on the page: reported, never applied automatically
        'campaign_level_only_groups': sum(1 for r in rows if not r['accepted'] and r.get('campaign_level')),
        'campaign_level_only_photos': sum(len(r.get('campaign_level') or []) for r in rows if not r['accepted']),
    }
    if budget:
        out.update(paid_requests=budget.requests, cached_responses=budget.cached, spent=round(budget.spent, 3))
    return out


def _select(gs, args_kinds, include_illustrated, ids=None):
    kinds = set(args_kinds.split(','))
    out = [g for g in gs.values() if g['kind'] in kinds and (include_illustrated or not g['has_photo'])]
    if ids:
        want = [x.strip() for x in open(ids) if x.strip()]
        out = [gs[i] for i in want if i in gs]
    return out


def cmd_batch(args):
    data = groups.load()
    gs = groups.build(data)
    sel = _select(gs, args.kinds, args.include_illustrated, args.ids)
    sel.sort(key=lambda g: (-(g['year'] or 0), g['brand']))
    if args.limit:
        sel = sel[:args.limit]
    providers = tuple(p.strip() for p in args.providers.split(',') if p.strip())
    if any(p in PAID for p in providers) and args.budget <= 0 and not args.dry_run:
        print('Paid providers need --budget above zero (or --dry-run).')
        return 2
    budget = Budget(args.budget, dry=args.dry_run, run=args.run)
    if args.dry_run:
        print('DRY RUN: no paid requests, no downloads, nothing saved. Queries that would be sent:')
        n_q = 0
        for g in sel:
            for stage, prov, q in discover.queries(g):
                if prov in providers:
                    from .search import cached
                    hit = cached(prov, q) is not None
                    n_q += 0 if hit else 1
                    if len(sel) <= 60:
                        print(f'  [{prov}] {q}{"  (cached)" if hit else ""}')
        est = sum(config.PRICE[p] for g in sel for _, p, _ in discover.queries(g) if p in providers)
        print(f'{len(sel)} groups; at most {n_q} uncached paid queries; worst-case cost ${est:.2f} '
              f'(stages stop early once a group is illustrated)')
        return 0
    done = run_groups(args.run, sel, data, providers, budget, args.workers, args.redo)
    rows = [done[g['id']] for g in sel if g['id'] in done]
    s = summarize(rows, budget)
    _export(args.run)
    _write_json(f'{args.run}.summary.json', s)
    print(json.dumps(s, indent=1, ensure_ascii=False))
    return 0


# ---------------------------------------------------------------- trial

def trial_selection(gs, n, seed=7):
    # campaigns still missing exact photos after the free pass (cited sources + earlier results), so the
    # trial measures what paid discovery adds
    free = {k for k, r in _results('free-sources').items() if r['accepted']}
    pool = [g for g in gs.values() if g['kind'] in ('campaign', 'ambassador') and not g['has_photo'] and g['year']
            and g['id'] not in free]
    bins = collections.defaultdict(list)
    for g in pool:
        y = g['year']
        b = '1980-1999' if y < 2000 else '2000-2009' if y < 2010 else '2010-2014' if y < 2015 else '2015-2019' if y < 2020 else '2020-2027'
        bins[b].append(g)
    rnd = random.Random(seed)
    for b in bins.values():
        rnd.shuffle(b)
    chosen, brands = [], set()
    order = sorted(bins)
    while len(chosen) < n and any(bins.values()):
        for b in order:
            while bins[b]:
                g = bins[b].pop()
                if g['brand'] not in brands:
                    chosen.append(g)
                    brands.add(g['brand'])
                    break
            if len(chosen) >= n:
                break
    return chosen


def cmd_trial(args):
    data = groups.load()
    gs = groups.build(data)
    # The selection is drawn once and then frozen, so re-runs compare the same 50 campaigns.
    frozen = os.path.join(config.RESULTS, 'trial_selection.json')
    if os.path.exists(frozen) and not args.reselect:
        # the frozen definition is used when a later data correction changed or removed the group
        sel = [gs.get(x['id']) or x['group'] for x in json.load(open(frozen)) if x['id'] in gs or x.get('group')]
    else:
        sel = trial_selection(gs, args.n)
        _write_json('trial_selection.json', [{'id': g['id'], 'label': groups.label(g), 'models': g['models'], 'group': g} for g in sel])
    report = json.load(open(os.path.join(config.RESULTS, 'trial.summary.json'))) \
        if os.path.exists(os.path.join(config.RESULTS, 'trial.summary.json')) else {}
    report.update(selection=len(sel))
    report.setdefault('arms', {})
    if not args.google:
        # Arm A: the improved existing pipeline (cited sources, earlier results, Brave campaign-first then model-first).
        arm_a = ('sources', 'legacy', 'brave_web', 'brave_images')
        # the cap covers the whole trial, across re-runs: subtract what earlier trial runs already paid
        paid = ledger_total('trial-improved')['usd']
        budget_a = Budget(max(0.0, args.budget - paid), dry=args.dry_run, run='trial-improved')
        report['already_paid_before_this_run'] = paid
        done_a = run_groups('trial-improved', sel, data, arm_a, budget_a, redo=args.redo)
        rows_a = [done_a[g['id']] for g in sel]
        report['arms']['improved pipeline'] = summarize(rows_a, budget_a)
        _export('trial-improved', {g['id'] for g in sel})
        report['trial_total_paid'] = ledger_total('trial-improved')
        # what searching these 50 costs, counted once per distinct paid query
        paid_q = {(v['provider'], v['query']) for _, v in cache.search_store().items('ledger')}
        mine = {(st['provider'], st['query']) for r in rows_a for st in r['stages'] if st.get('query')} & paid_q
        report['paid_queries_for_these_50'] = {'requests': len(mine), 'usd': round(sum(config.PRICE[p] for p, _ in mine), 3)}
    else:
        # Arm B: Google Images discovery through SerpApi on the same 50, on the Free plan only, at most
        # --max-searches new searches. Discovery only: every page found is verified exactly like Arm A's.
        todo = [g for g in sel if args.redo or g['id'] not in _results('trial-google')]
        needed = 0 if args.dry_run else min(args.max_searches, sum(
            1 for g in todo for st, prov, q in discover.queries(g)
            if prov == 'serpapi_google_images' and serpapi.cached(prov, q) is None))
        acc = None
        if needed:
            plans = tuple(x.strip().lower() for x in args.plans.split(','))
            ok, acc, why = serpapi.allowance(needed, plans)
            if not ok:
                print('Google arm not run:', why)
                report['arms']['google images (serpapi)'] = {'skipped': why, 'account': acc}
                _write_json('trial.summary.json', report)
                return 1
        plan_key = next((k for k in serpapi.PLAN_PRICE_PER_SEARCH if acc and k in (acc.get('plan_name') or '').lower()), 'free')
        unit = serpapi.PLAN_PRICE_PER_SEARCH[plan_key]
        budget_b = Budget(unit * args.max_searches, dry=args.dry_run, run='trial-google',
                          prices={'serpapi_google_images': unit}, max_requests={'serpapi_google_images': args.max_searches})
        done_b = run_groups('trial-google', sel, data, ('serpapi_google_images',), budget_b, redo=args.redo)
        rows_b = [done_b[g['id']] for g in sel]
        report['arms']['google images (serpapi)'] = {**summarize(rows_b, budget_b), 'plan': f'SerpApi {plan_key}',
                                                     'value_per_search_usd': round(unit, 4),
                                                     'account_before': acc, 'requests_sent': budget_b.attempts,
                                                     'account_after': serpapi.account() if needed else None}
        _export('trial-google', {g['id'] for g in sel})
    _write_json('trial.summary.json', report)
    print(json.dumps(report, indent=1, ensure_ascii=False))
    return 0


def _arm_metrics(rows, rejected):
    """What one arm established on the trial campaigns."""
    out = collections.Counter()
    blocked = collections.Counter()
    examples = collections.defaultdict(list)
    for r in rows:
        acc = [a for a in r['accepted'] if a['file'] not in rejected]
        if acc:
            out['campaigns with a verified gallery'] += 1
            g = r.get('_group') or {}
            named = {t for a in acc for t in a['talent']}
            out['credited models shown in a verified photo'] += len(named & set(r['models']))
            out['photos'] += len(acc)
            out['photos tagged to a named model'] += sum(1 for a in acc if a['talent'])
        elif r.get('campaign_level'):
            out['campaign confirmed, model not named (not applied)'] += 1
        # relevant results that could not be used: the page or the image host does not permit retrieval
        for u, p in r['pages'].items():
            if p.get('relevant') and p['status'] in ('never', 'blocked'):
                why = 'page host never fetched (social/stock/resale)' if p['status'] == 'never' else 'page disallows Claude (robots.txt)'
                blocked[why] += 1
                if len(examples[why]) < 4:
                    examples[why].append(f"{r['label']}: {u[:100]}")
            for k, n in (p.get('image_failures') or {}).items():
                if 'block' in k or 'never' in k:
                    blocked['image host disallows Claude'] += n
                    if len(examples['image host disallows Claude']) < 4:
                        examples['image host disallows Claude'].append(f"{r['label']}: {u[:100]}")
    return dict(out), dict(blocked), dict(examples)


def cmd_compare(args):
    """Brave arm vs Google arm on the frozen trial campaigns; writes results/trial_comparison.json and a contact
    sheet of the campaigns only Google recovered."""
    sel = json.load(open(os.path.join(config.RESULTS, 'trial_selection.json')))
    rejected = {x.strip() for x in open(os.path.join(config.RESULTS, 'review_rejected.txt')) if x.strip()}
    arms = {'brave': _results('trial-improved'), 'google': _results('trial-google')}
    if not arms['google']:
        print('No Google arm results yet (run: python3 -m pipeline trial --google).')
        return 1
    report = {'campaigns': len(sel), 'arms': {}}
    rows = {}
    for name, res in arms.items():
        rs = [res[x['id']] for x in sel if x['id'] in res]
        rows[name] = {r['id']: r for r in rs}
        m, blocked, ex = _arm_metrics(rs, rejected)
        fails = collections.Counter(re.sub(r':.*', '', r['failure']) for r in rs if r['failure'])
        report['arms'][name] = {'metrics': m, 'relevant but not retrievable': blocked, 'examples': ex,
                                'failures': dict(fails.most_common())}
    ok = lambda name, gid: bool([a for a in rows[name].get(gid, {}).get('accepted', []) if a['file'] not in rejected])
    only_g = [x for x in sel if ok('google', x['id']) and not ok('brave', x['id'])]
    only_b = [x for x in sel if ok('brave', x['id']) and not ok('google', x['id'])]
    both = [x for x in sel if ok('brave', x['id']) and ok('google', x['id'])]
    report['google only'] = [x['label'] for x in only_g]
    report['brave only'] = [x['label'] for x in only_b]
    report['both'] = [x['label'] for x in both]
    report['combined: campaigns with a verified gallery'] = len(only_g) + len(only_b) + len(both)
    report['valid dated campaigns (frozen date still supported)'] = sum(1 for x in sel if not x.get('note'))
    summ = json.load(open(os.path.join(config.RESULTS, 'trial.summary.json')))
    report['cost'] = {'brave': summ.get('paid_queries_for_these_50'),
                      'google': {'requests': summ['arms'].get('google images (serpapi)', {}).get('requests_sent'),
                                 'usd': summ['arms'].get('google images (serpapi)', {}).get('spent'),
                                 'plan': summ['arms'].get('google images (serpapi)', {}).get('plan')}}
    _write_json('trial_comparison.json', report)
    # contact sheet: what Google added
    items = [(x['label'], a) for x in only_g for a in rows['google'][x['id']]['accepted'] if a['file'] not in rejected]
    items += [('[google, campaign only] ' + x['label'], a) for x in sel
              if not ok('google', x['id']) and not ok('brave', x['id'])
              for a in rows['google'].get(x['id'], {}).get('campaign_level') or []]
    W, H, C = 220, 300, 6
    os.makedirs(os.path.join(config.CACHE, 'sheets'), exist_ok=True)
    for s0 in range(0, len(items), 30):
        chunk = items[s0:s0 + 30]
        sh = Image.new('RGB', (C * W, max(1, (len(chunk) + C - 1) // C) * H), 'white')
        dr = ImageDraw.Draw(sh)
        for j, (label, a) in enumerate(chunk):
            X, Y = (j % C) * W, (j // C) * H
            im = Image.open(os.path.join(config.ROOT, a['file']))
            im.thumbnail((W - 6, H - 62))
            sh.paste(im, (X + 3, Y + 3))
            dr.rectangle([X, Y + H - 58, X + W, Y + H], fill='black')
            dr.text((X + 3, Y + H - 56), f'{s0 + j} {label}'[:36], fill='yellow')
            dr.text((X + 3, Y + H - 40), (', '.join(a['talent']) or '(models not identified)')[:36], fill='white')
            dr.text((X + 3, Y + H - 24), a['site'][:36], fill='#aaa')
        sh.save(os.path.join(config.CACHE, 'sheets', f'google-new-{s0 // 30:02d}.jpg'), quality=75)
    _write_json('google_new.sheet_index.json', [{'n': i, 'label': l, 'file': a['file'], 'page': a['page'], 'image': a['image']}
                                                for i, (l, a) in enumerate(items)])
    print(json.dumps(report, indent=1, ensure_ascii=False))
    return 0


# ---------------------------------------------------------------- review sheet

def cmd_sheet(args):
    rows = _results(args.run)
    if args.run.startswith('trial') and os.path.exists(os.path.join(config.RESULTS, 'trial_selection.json')):
        keep = {x['id'] for x in json.load(open(os.path.join(config.RESULTS, 'trial_selection.json')))}
        rows = {k: v for k, v in rows.items() if k in keep}
    items = [(r['label'], a) for r in sorted(rows.values(), key=lambda r: r['label']) for a in r['accepted']]
    items += [('[campaign-level] ' + r['label'], a) for r in sorted(rows.values(), key=lambda r: r['label'])
              if not r['accepted'] for a in r.get('campaign_level') or []]
    W, H, C = 220, 300, 6
    os.makedirs(os.path.join(config.CACHE, 'sheets'), exist_ok=True)
    paths = []
    for s0 in range(0, len(items), C * 5):
        chunk = items[s0:s0 + C * 5]
        sh = Image.new('RGB', (C * W, ((len(chunk) + C - 1) // C) * H), 'white')
        dr = ImageDraw.Draw(sh)
        for j, (label, a) in enumerate(chunk):
            X, Y = (j % C) * W, (j // C) * H
            try:
                im = Image.open(os.path.join(config.ROOT, a['file']))
                im.thumbnail((W - 6, H - 62))
                sh.paste(im, (X + 3, Y + 3))
            except Exception:
                pass
            dr.rectangle([X, Y + H - 58, X + W, Y + H], fill='black')
            dr.text((X + 3, Y + H - 56), f'{s0 + j} {label}'[:36], fill='yellow')
            dr.text((X + 3, Y + H - 40), (', '.join(a['talent']) or '(models not identified)')[:36], fill='white')
            dr.text((X + 3, Y + H - 24), a['site'][:36], fill='#aaa')
        p = os.path.join(config.CACHE, 'sheets', f'{args.run}-{s0 // (C * 5):02d}.jpg')
        sh.save(p, quality=72)
        paths.append(p)
    _write_json(f'{args.run}.sheet_index.json', [{'n': i, 'label': l, 'file': a['file'], 'page': a['page']} for i, (l, a) in enumerate(items)])
    print('\n'.join(paths))
    return 0


# ---------------------------------------------------------------- apply

def _evidence_path():
    return os.path.join(config.RESULTS, 'evidence.json')


def cmd_apply(args):
    data = groups.load()
    gs = groups.build(data)
    rejected = set()
    if args.reject:
        rejected = {x.strip() for x in open(args.reject) if x.strip()}
    ev = json.load(open(_evidence_path())) if os.path.exists(_evidence_path()) else {}
    added = credits = 0
    for run in args.run:
        for gid, r in _results(run).items():
            g = gs.get(gid)
            if not g or not r['accepted']:
                continue
            for idx in g['credits']:
                c = data['campaigns'][idx]
                imgs = c.setdefault('images', [])
                have = {i['src'] for i in imgs}
                before = len(imgs)
                for a in r['accepted']:
                    if a['file'] in rejected or a['file'] in have:
                        continue
                    talent = [t for t in a['talent'] if t in c['talent']]
                    if a['talent'] and not talent:
                        continue  # a photo of another model of the same campaign
                    imgs.append({'src': a['file'], 'credit': a['site'], 'from': a['page'], 'talent': talent,
                                 'match': 'exact', 'auto': True})
                    have.add(a['file'])
                    ev[a['file']] = {'group': gid, 'label': r['label'], 'page': a['page'], 'image': a['image'],
                                     'attribution': a['attribution'], 'via': a['via'], 'run': run, 'evidence': a['evidence']}
                if len(imgs) > before:
                    credits += 1
                    added += len(imgs) - before
                if not imgs:
                    c.pop('images')
    print(f'{added} photos added to {credits} credits{" (dry run, nothing written)" if args.dry_run else ""}')
    if not args.dry_run:
        _save_data(data)
        _write_json('evidence.json', ev)
    return 0


def _record_spans(text):
    """Source text of each object in the "campaigns" array, in order (brace matching outside strings)."""
    start = text.index('"campaigns": [') + len('"campaigns": [')
    spans, depth, in_str, esc, begin = [], 0, False, False, None
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == '{':
            if depth == 0:
                begin = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                spans.append(text[begin:i + 1])
        elif ch == ']' and depth == 0:
            break
    return spans


def _save_data(data):
    """Write data/campaigns.json in the site's layout: one record per line, except that a record whose content
    is unchanged keeps its existing text (some are laid out by hand), so diffs show only real changes."""
    j = lambda o: json.dumps(o, ensure_ascii=False)
    old = []
    if os.path.exists(config.DATA):
        try:
            old = _record_spans(open(config.DATA).read())
        except ValueError:
            old = []
    previous = {}
    for t in old:
        previous.setdefault(json.dumps(json.loads(t), sort_keys=True, ensure_ascii=False), t)

    def rec(c):
        return previous.get(json.dumps(c, sort_keys=True, ensure_ascii=False)) or j(c)

    lines = ['{', f'  "updated": {j(data["updated"])},', '  "brands": {']
    lines.append(',\n'.join(f'    {j(k)}: {j(v)}' for k, v in data['brands'].items()))
    lines += ['  },', '  "models": {']
    lines.append(',\n'.join(f'    {j(k)}: {j(v)}' for k, v in data['models'].items()))
    lines += ['  },', '  "campaigns": [']
    lines.append(',\n'.join('    ' + rec(c) for c in data['campaigns']))
    lines += ['  ]', '}']
    open(config.DATA, 'w').write('\n'.join(lines) + '\n')


# ---------------------------------------------------------------- undated relationships

def cmd_general(args):
    """Undated credits are general relationships. A photo may stay on one only when its source page names
    both the model and the label; dates read off a photo's source page are kept only when the page states
    the campaign's season and year in its text. Everything else is removed and reported."""
    data = groups.load()
    report = collections.Counter()
    examples = collections.defaultdict(list)
    ev = json.load(open(_evidence_path())) if os.path.exists(_evidence_path()) else {}

    def page_names(c, img, need_year=None):
        if img.get('match') == 'exact' and img['src'] in ev:
            # added by this pipeline: its page already passed verification for this label, season and year
            return True, 'year confirmed' if need_year else 'ok'
        url = img.get('from')
        if not url:
            return False, 'no source page recorded'
        p = net.page(url)
        if p['status'] != 'ok':
            return None, f'source page {p["status"]}'
        art = extract.read(p['html'], p.get('final') or url)
        b = verify.Brand(c['brand'], data['brands'].get(c['brand'], {}).get('aliases', []))
        t = art['title'] + ' ' + art['text'][:2500] + ' ' + (img.get('alt') or '')
        if not b.find(t):
            return False, 'label not named on the source page'
        if not verify.model_hits(c['talent'], t):
            return False, 'model not named on the source page'
        if need_year:
            g = {'brand': c['brand'], 'aliases': data['brands'].get(c['brand'], {}).get('aliases', []), 'kind': c.get('kind') or 'campaign',
                 'year': need_year, 'family': None, 'models': c['talent'], 'title': None}
            v = verify.assess(g, art)
            if v['verdict'] != 'exact':
                # the photo is still of this model for this label; only the date is unsupported
                return True, 'year not stated as the campaign year: ' + v['reason']
            return True, 'year confirmed'
        return True, 'ok'

    todo = []
    for idx, c in enumerate(data['campaigns']):
        if c.get('yearFrom') or (not c.get('year') and c.get('images')):
            todo.append(idx)
    print(f'{len(todo)} credits to re-check', flush=True)

    def check(idx):
        c = data['campaigns'][idx]
        out = []
        for img in c.get('images', []):
            out.append(page_names(c, img, need_year=c.get('year') if c.get('yearFrom') else None))
        return idx, out

    with cf.ThreadPoolExecutor(10) as ex:
        results = list(ex.map(check, todo))
    for idx, verdicts in results:
        c = data['campaigns'][idx]
        dated_from_photo = bool(c.get('yearFrom'))
        keep = []
        for img, (ok, why) in zip(c.get('images', []), verdicts):
            if ok:
                keep.append(img)
                report['photo kept: source names model and label' + (' and states the year' if why == 'year confirmed' else '')] += 1
            elif ok is None:
                # page no longer reachable: keep the human-reviewed photo, but never let it date the credit
                keep.append(img)
                report['photo kept (reviewed earlier), source page now unreachable'] += 1
            else:
                report['photo removed: ' + why.split(':')[0]] += 1
                if len(examples[why.split(':')[0]]) < 5:
                    examples[why.split(':')[0]].append(f"{', '.join(c['talent'])} / {c['brand']}: {img.get('from')}")
        if dated_from_photo:
            confirmed = any(ok and why == 'year confirmed' for ok, why in verdicts)
            if confirmed:
                c['yearFrom'] = 'source states the year'
                if c.get('note'):
                    c['note'] = c['note'].replace('year from the photo source', 'year stated on the photo’s source page')
                report['date kept: source states the campaign year'] += 1
            else:
                c['year'] = None
                c.pop('season', None)
                c.pop('yearFrom', None)
                if c.get('note'):
                    c['note'] = '; '.join(x for x in c['note'].split('; ') if x != 'year from the photo source') or None
                    if not c['note']:
                        c.pop('note')
                report['date removed: not stated by a source (back to undated)'] += 1
        if keep:
            c['images'] = keep
        else:
            c.pop('images', None)
    out = {'counts': dict(report.most_common()), 'examples': examples}
    print(json.dumps(out, indent=1, ensure_ascii=False))
    if not args.dry_run:
        _save_data(data)
        _write_json('general.json', out)
    return 0


# ---------------------------------------------------------------- validate

def cmd_validate(args):
    data = groups.load()
    refs = collections.defaultdict(list)
    for c in data['campaigns']:
        for i in c.get('images', []):
            refs[i['src']].append(('credit', c['brand']))
    for name, m in data['models'].items():
        if m.get('portrait'):
            refs[m['portrait']].append(('portrait', name))
        for k in m.get('press', []):
            refs[k['src']].append(('press', name))
    bad = collections.defaultdict(list)
    remote = []
    for src, where in refs.items():
        if src.startswith('http'):
            remote.append(src)
            continue
        path = os.path.join(config.ROOT, src)
        if not os.path.exists(path):
            bad['missing file'].append((src, where[0]))
            continue
        try:
            with Image.open(path) as im:
                im.verify()
            with Image.open(path) as im:
                if im.width < 50 or im.height < 50:
                    bad['tiny'].append((src, where[0]))
        except Exception:
            bad['does not decode'].append((src, where[0]))
    ign = open(os.path.join(config.ROOT, '.assetsignore')).read().split()
    hidden = [s for s in refs if any(s.startswith(x.rstrip('/')) for x in ign if x.startswith('assets'))]
    out = {'referenced': len(refs), 'local_ok': len(refs) - len(remote) - sum(len(v) for v in bad.values()),
           'remote_urls': len(remote), 'remote_examples': remote[:5], 'excluded_by_assetsignore': hidden[:5],
           'problems': {k: len(v) for k, v in bad.items()}, 'problem_examples': {k: v[:5] for k, v in bad.items()}}
    print(json.dumps(out, indent=1, ensure_ascii=False))
    _write_json('validate.json', out)
    return 1 if bad else 0


# ---------------------------------------------------------------- audit

def cmd_audit(args):
    from . import audit
    return audit.run(offline=args.offline)
