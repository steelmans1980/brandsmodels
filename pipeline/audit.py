"""Coverage and failure audit: how specific each credit is, the best picture it has, and why dated credits lack one."""
import collections
import json
import os
import re

from . import cache, config, groups, runner


def _legacy_state():
    """What the earlier (pre-pipeline) runs did per credit key brand|year|kind|model."""
    brave = json.load(open(os.path.join(config.LEGACY, 'brave_images.json')))
    rejected = set(json.load(open(os.path.join(config.LEGACY, 'og_rejected.json'))))
    reviewed = set(json.load(open(os.path.join(config.LEGACY, 'brave_reviewed.json'))))
    out = {}
    for k, v in brave.items():
        imgs = v.get('images', [])
        out[k] = {'searched': True, 'found': len(imgs), 'rejected': sum(1 for i in imgs if i['file'] in rejected),
                  'filtered': sum(1 for i in imgs if i['file'] not in rejected and i['file'] not in reviewed)}
    return out


def _fallback(c, models):
    return any(models.get(t, {}).get('press') or models.get(t, {}).get('portrait') for t in c['talent'])


MONTH = re.compile(r'(?i)\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\bissue\b|\bno\.? ?\d')


def appearance(c, evidence):
    """How specifically a credit identifies an appearance.

    identified   the issue, show or campaign is pinned down: a cover with its issue, a runway show or campaign with
                 its season, a named campaign, or a source page verified for this model, label and season/year
    dated        a year only: the model worked with the label that year, but which campaign or show is not known
    undated      a relationship with no date
    """
    if not c.get('year'):
        return 'undated'
    kind = c.get('kind') or 'campaign'
    season = c.get('season') if c.get('season') not in (None, 'Full year') else None
    if kind == 'cover' and MONTH.search(c.get('title') or ''):
        return 'identified'
    if kind != 'cover' and (season or c.get('title')):
        return 'identified'
    if c.get('yearFrom') == 'source states the year':
        return 'identified'  # its photo's page names the model and label and states the campaign year
    for i in c.get('images', []):
        e = evidence.get(i['src'])
        if e and set(c['talent']) & set(e['evidence'].get('models_named') or []):
            return 'identified'  # a verified page names this model for this label and period
    return 'dated'


PICTURES = ['photo attributed by human review', 'photo whose own caption names the model (automated)',
            'campaign gallery only (models not identified individually)', 'portrait/press fallback only', 'no picture']


def picture(c, models, reviews=None):
    """The best picture a credit has, from strongest to weakest. After the attribution recheck a model tag on a photo
    means its caption or alt text names her, or a person recorded the attribution."""
    imgs = c.get('images', [])
    mine = [i for i in imgs if set(i.get('talent') or []) & set(c['talent'])]
    if reviews and any(i['src'] in reviews for i in mine):
        return PICTURES[0]
    if mine:
        return PICTURES[1]
    if imgs:
        return PICTURES[2]
    if _fallback(c, models):
        return PICTURES[3]
    return PICTURES[4]


def run(offline=False):
    data = groups.load()
    models = data['models']
    gs = groups.build(data)
    gid_of = {}
    for g in gs.values():
        for idx in g['credits']:
            gid_of[idx] = g['id']
    free = runner._results('free-sources')
    legacy = _legacy_state()
    evp = os.path.join(config.RESULTS, 'evidence.json')
    evidence = json.load(open(evp)) if os.path.exists(evp) else {}
    from . import recheck
    reviews = recheck.human_reviews()

    # ---- coverage: every credit counted once, by how specific it is and by its best picture
    cov = collections.defaultdict(collections.Counter)
    for c in data['campaigns']:
        key = (appearance(c, evidence), c.get('kind') or 'campaign')
        cov[key]['credits'] += 1
        cov[key][picture(c, models, reviews)] += 1
    total = sum(v['credits'] for v in cov.values())
    assert total == len(data['campaigns'])
    by_appearance = collections.Counter()
    for (a, _), v in cov.items():
        by_appearance[a] += v['credits']

    # ---- reasons for specific credits without a photo
    reasons = collections.Counter()
    examples = collections.defaultdict(list)
    for idx, c in enumerate(data['campaigns']):
        if groups.relation(c) != 'specific' or picture(c, models, reviews) in PICTURES[:2]:
            continue
        r = free.get(gid_of.get(idx))
        key = f"{c['brand']}|{c.get('year')}|{c.get('kind', 'campaign')}|{c['talent'][0]}"
        leg = legacy.get(key)
        why, detail = None, ''
        f = (r or {}).get('failure') or ''
        if f.startswith('inaccessible source'):
            why, detail = 'relevant result, inaccessible source', f.split(': ', 1)[-1]
        elif f.startswith('extraction failed'):
            why, detail = 'accessible source, image extraction failed', f.split(': ', 1)[-1]
        elif f.startswith('unverified'):
            why, detail = 'rejected: campaign/identity not confirmed', f.split(': ', 1)[-1]
        elif leg and leg['rejected']:
            why, detail = 'rejected: campaign/identity not confirmed', f"{leg['rejected']} search image(s) rejected in visual review"
        elif leg and leg['filtered']:
            why, detail = 'rejected: campaign/identity not confirmed', 'search images filtered as event/street/red-carpet shots'
        elif leg:
            why, detail = 'no relevant search results', 'earlier paid search returned no candidate naming model, label and year'
        else:
            why, detail = 'not searched yet', 'no usable cited source; never sent to paid search'
        why = f'{appearance(c, evidence)} | {why}'
        reasons[why] += 1
        if len(examples[why]) < 6:
            src = [p for p, v in ((r or {}).get('pages') or {}).items()][:1]
            examples[why].append({'credit': f"{', '.join(c['talent'][:3])} — {c['brand']} {c.get('season') or ''} {c.get('year')} {c.get('kind') or 'campaign'}".replace('  ', ' '),
                                  'detail': detail, 'source': src[0] if src else (c['sources'][-1]['url'] if c['sources'] else '')})

    # ---- general relationships
    general = [c for c in data['campaigns'] if groups.relation(c) == 'general']
    gen = {'credits': len(general), 'with a photo': sum(1 for c in general if c.get('images')),
           'by kind': dict(collections.Counter(c.get('kind') or 'campaign' for c in general))}

    # ---- rendering
    import io
    import contextlib
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        runner.cmd_validate(None)
    render = json.load(open(os.path.join(config.RESULTS, 'validate.json')))

    out = {
        'credits': total,
        'by_appearance': dict(by_appearance),
        'coverage': {f'{a} | {k}': {x: v[x] for x in ['credits'] + PICTURES if v[x]} for (a, k), v in sorted(cov.items())},
        'pictures_by_appearance': {a: {p: sum(v[p] for (aa, _), v in cov.items() if aa == a) for p in PICTURES}
                                   for a in ('identified', 'dated', 'undated')},
        'dated_without_model_photo_by_reason': dict(reasons.most_common()),
        'examples': examples,
        'general_relationships': gen,
        'rendering': render,
        'free_pass_groups': len(free),
    }
    runner._write_json('audit.json', out)
    print(json.dumps(out, indent=1, ensure_ascii=False)[:6000])
    return 0
