"""Find verified photos for one group: cited sources first, then paid searches, cheapest first."""
import json
import os
import re
import urllib.parse

from . import config, extract, groups, images, net, seasons, verify
from .search import brave, serpapi

MAX_PER_PAGE = 8
MAX_PER_GROUP = 12
SKIP_SOURCE = re.compile(r'wikipedia\.org|models\.com|fashionmodeldirectory|imdb\.com|google\.')


def _legacy():
    out = {}
    p = os.path.join(config.LEGACY, 'brave_images.json')
    if os.path.exists(p):
        for k, v in json.load(open(p)).items():
            out.setdefault(k, set()).update(i['from'] for i in v.get('images', []))
    p = os.path.join(config.LEGACY, 'extra_sources.json')
    if os.path.exists(p):
        for e in json.load(open(p)):
            out.setdefault(f"{e['brand']}|{e.get('year')}|{e.get('kind', 'campaign')}|{e['talent']}", set()).add(e['url'])
    return out


_LEGACY = None
_OTHER = None
_REJECTED = None


def rejected():
    """Photos rejected in earlier visual reviews: never accepted again."""
    global _REJECTED
    if _REJECTED is None:
        _REJECTED = set()
        for f in ('og_rejected.json', 'model_rejected.json'):
            p = os.path.join(config.LEGACY, f)
            if os.path.exists(p):
                _REJECTED |= set(json.load(open(p)))
        p = os.path.join(config.RESULTS, 'review_rejected.txt')
        if os.path.exists(p):
            _REJECTED |= {x.strip() for x in open(p) if x.strip()}
    return _REJECTED


def other_brands(data, exclude):
    global _OTHER
    if not verify.KNOWN_MODELS:
        verify.KNOWN_MODELS.update(groups.fold(m) for m in data['models'] if len(groups.fold(m).split()) >= 2)
        verify.KNOWN_BRANDS.update(groups.fold(b) for b in data['brands'])
        verify.KNOWN_MAGAZINES.update(b for b, v in data['brands'].items()
                                      if v.get('type') == 'magazine' and len(groups.fold(b)) >= 4)
    if _OTHER is None:
        _OTHER = {b: verify.Brand(b, v.get('aliases', [])) for b, v in data['brands'].items()
                  if len(groups.fold(b)) >= 4 and v.get('type') != 'magazine'}
    return [v for k, v in _OTHER.items() if k != exclude]


def queries(g):
    """(stage, provider, query) in the order they are tried."""
    brand, year, kind = g['brand'], g['year'], g['kind']
    words = seasons.query_words(g.get('family'))
    season = words[0] if g.get('family') else ''
    title = f" {g['title']}" if g.get('title') and kind != 'cover' else ''
    what = {'runway': 'runway', 'cover': 'cover'}.get(kind, 'campaign')
    m0 = g['models'][0]
    if kind == 'cover':
        issue = g['title'].replace(' issue', '') if g.get('title') else str(year)
        if str(year) not in issue:
            issue += f' {year}'
        first = f'{m0} {brand} {issue} cover'
        return [('campaign-first', 'brave_web', first), ('campaign-first', 'brave_images', first),
                ('google-images', 'serpapi_google_images', first)]
    if kind == 'runway':
        q = f'{m0} {brand} {season} {year} runway'.replace('  ', ' ')
        return [('model-first', 'brave_web', q), ('model-first', 'brave_images', q),
                ('google-images', 'serpapi_google_images', q)]
    camp = f'{brand}{title} {season} {year} {what}'.replace('  ', ' ')
    model = f'{m0} {brand} {season} {year} {what}'.replace('  ', ' ')
    return [('campaign-first', 'brave_web', camp), ('campaign-first', 'brave_images', camp),
            ('model-first', 'brave_web', model), ('google-images', 'serpapi_google_images', model)]


def _relevant(g, item):
    t = (item.get('title') or '') + ' ' + (item.get('snippet') or '') + ' ' + urllib.parse.unquote(item.get('url') or '')
    b = verify.Brand(g['brand'], g.get('aliases', []))
    return bool(b.find(t)) and (bool(verify.model_hits(g['models'], t)) or str(g['year']) in t)


def process(g, data, budget, providers=('sources', 'legacy', 'brave_web', 'brave_images', 'serpapi_google_images'), offline=False):
    global _LEGACY
    if _LEGACY is None:
        _LEGACY = _legacy()
    res = {'id': g['id'], 'label': groups.label(g), 'brand': g['brand'], 'kind': g['kind'], 'year': g['year'],
           'season': g.get('season'), 'models': g['models'], 'stages': [], 'pages': {}, 'accepted': [], 'dropped': 0,
           'campaign_level': []}
    others = other_brands(data, g['brand'])
    seen_pages, files = set(), set()

    def try_page(url, via, hint_images=()):
        if url in seen_pages or len(res['accepted']) >= MAX_PER_GROUP:
            return
        seen_pages.add(url)
        p = net.page(url, offline=offline)
        rec = {'via': via, 'status': p['status']}
        res['pages'][url] = rec
        if p['status'] != 'ok':
            return
        art = extract.read(p['html'], p.get('final') or url)
        for h in hint_images:
            if h.get('url') and not any(i['url'] == h['url'] for i in art['images']):
                art['images'].append({'url': h['url'], 'alt': h.get('alt', ''), 'caption': '', 'w': 0, 'h': 0, 'lead': False})
        v = verify.assess(g, art)
        rec.update(verdict=v['verdict'], reason=v['reason'], evidence=v['evidence'], n_images=len(art['images']))
        level = v['verdict'] == 'candidate' and v['evidence'].get('campaign_level')
        if v['verdict'] != 'exact' and not level:
            return
        kept, dropped = verify.pick_images(g, art, v, others)
        if level:
            # campaign confirmed, model not: kept apart, never tagged with a model, never applied automatically
            for img in kept[:MAX_PER_PAGE]:
                if len(res['campaign_level']) >= 8:
                    break
                r = images.fetch(img['url'], referer=p.get('final') or url, dry=budget.dry and offline)
                if r['status'] == 'ok' and r['file'] not in rejected() and r['file'] not in {a['file'] for a in res['campaign_level']}:
                    res['campaign_level'].append({'file': r['file'], 'image': img['url'], 'page': p.get('final') or url,
                                                  'site': net.host_of(p.get('final') or url).replace('www.', ''), 'talent': [],
                                                  'attribution': 'campaign confirmed; credited model not named on the page',
                                                  'via': via, 'alt': (img.get('alt') or '')[:160], 'evidence': v['evidence']})
            rec['campaign_level'] = True
            return
        res['dropped'] += len(dropped)
        rec['kept'] = len(kept)
        got = 0
        fails = {}
        for img in kept:
            if got >= MAX_PER_PAGE or len(res['accepted']) >= MAX_PER_GROUP:
                break
            r = images.fetch(img['url'], referer=p.get('final') or url, dry=budget.dry and offline)
            if r['status'] != 'ok':
                fails[r['status']] = fails.get(r['status'], 0) + 1
                continue
            if r['file'] in rejected() or (r.get('duplicate_of') and r['duplicate_of'] in rejected()):
                fails['rejected in an earlier review'] = fails.get('rejected in an earlier review', 0) + 1
                continue
            if r['file'] in files:
                continue
            files.add(r['file'])
            got += 1
            res['accepted'].append({'file': r['file'], 'image': img['url'], 'page': p.get('final') or url,
                                    'site': net.host_of(p.get('final') or url).replace('www.', ''),
                                    'talent': img['talent'], 'attribution': img['attribution'], 'via': via,
                                    'alt': (img.get('alt') or '')[:160], 'evidence': v['evidence'], 'duplicate_of': r.get('duplicate_of')})
        rec['downloaded'] = got
        if fails:
            rec['image_failures'] = fails

    def done():
        if not res['accepted']:
            return False
        covered = {t for a in res['accepted'] for t in a['talent']}
        return all(m in covered for m in g['models'][:3]) or len(res['accepted']) >= 6

    if 'sources' in providers:
        srcs = [u for u in g['sources'] if u.startswith('http') and not SKIP_SOURCE.search(u)]
        res['stages'].append({'stage': 'cited sources', 'n': len(srcs)})
        for u in srcs:
            try_page(u, 'cited source')
    if 'legacy' in providers and not done():
        urls = set()
        for idx in g['credits']:
            c = data['campaigns'][idx]
            for y in {c.get('year'), None if c.get('yearFrom') else c.get('year')}:
                urls |= _LEGACY.get(f"{c['brand']}|{y}|{c.get('kind', 'campaign')}|{c['talent'][0]}", set())
        res['stages'].append({'stage': 'earlier search results', 'n': len(urls)})
        for u in sorted(urls):
            try_page(u, 'earlier search result')
    for stage, provider, q in queries(g):
        if done() or provider not in providers:
            continue
        if provider == 'serpapi_google_images' and not serpapi.available() and not budget.dry:
            res['stages'].append({'stage': stage, 'provider': provider, 'query': q, 'skipped': 'no SERPAPI_API_KEY'})
            continue
        fn = {'brave_web': brave.web, 'brave_images': brave.images, 'serpapi_google_images': serpapi.images}[provider]
        out = fn(q, budget)
        if out is None:
            res['stages'].append({'stage': stage, 'provider': provider, 'query': q,
                                  'skipped': 'dry run (not cached)' if budget.dry else 'budget reached or no key'})
            continue
        items = out.get('results', [])
        rel = [x for x in items if x.get('url') and _relevant(g, x)]
        res['stages'].append({'stage': stage, 'provider': provider, 'query': q, 'n': len(items), 'relevant': len(rel),
                              'error': out.get('error')})
        by_page = {}
        for x in items:
            if x.get('url'):
                by_page.setdefault(x['url'], []).append({'url': x.get('image'), 'alt': x.get('title', '')})
        # relevant results first, then the rest (the article may establish what the title does not)
        order = [x['url'] for x in rel] + [u for u in by_page if u not in {x['url'] for x in rel}]
        for u in order[:12]:
            if net.never(u):
                res['pages'].setdefault(u, {'via': provider, 'status': 'never', 'relevant': u in {x['url'] for x in rel}})
                continue
            try_page(u, provider, by_page.get(u, []) if provider != 'brave_web' else ())
            if u in res['pages']:
                res['pages'][u]['relevant'] = u in {x['url'] for x in rel}
            if done():
                break
    res['failure'] = None if res['accepted'] else classify(res)
    return res


def classify(res):
    pages = res['pages'].values()
    if any(p.get('verdict') == 'exact' for p in pages):
        fails = {}
        for p in pages:
            for k, n in (p.get('image_failures') or {}).items():
                fails[k] = fails.get(k, 0) + n
        if fails:
            return 'extraction failed: ' + ', '.join(f'{k} ({n})' for k, n in sorted(fails.items(), key=lambda x: -x[1])[:3])
        return 'extraction failed: no campaign image found in the verified article'
    judged = [p for p in pages if p.get('verdict') in ('candidate', 'reject') and (p.get('relevant') or p.get('via') == 'cited source')]
    if any(p.get('verdict') == 'candidate' for p in judged):
        reasons = [p['reason'] for p in judged if p.get('verdict') == 'candidate']
        return 'unverified: ' + max(set(reasons), key=reasons.count)
    relevant = [p for p in pages if p.get('relevant') or p.get('via') in ('cited source', 'earlier search result')]
    if relevant and all(p['status'] != 'ok' for p in relevant):
        st = [p['status'] for p in relevant]
        return 'inaccessible source: ' + max(set(st), key=st.count)
    if judged:
        reasons = [p['reason'] for p in judged]
        return 'unverified: ' + max(set(reasons), key=reasons.count)
    if not any(s.get('n') for s in res['stages'] if 'provider' in s) and not res['pages']:
        return 'not searched'
    return 'no relevant search results'
