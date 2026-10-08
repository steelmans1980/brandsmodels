"""Coverage and failure audit: why each specific (dated) credit has no exact photo yet."""
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

    # ---- coverage
    cov = collections.defaultdict(collections.Counter)
    for idx, c in enumerate(data['campaigns']):
        rel = groups.relation(c)
        if rel == 'specific' and c.get('yearFrom'):
            rel = 'specific (year read from a photo source)'
        kind = c.get('kind') or 'campaign'
        row = cov[(rel, kind)]
        row['credits'] += 1
        if c.get('images'):
            row['exact photo'] += 1
            if any(not i.get('talent') for i in c['images']) and len(c['talent']) > 1:
                row['exact photo, models not identified individually'] += 1
        elif _fallback(c, models):
            row['portrait/press fallback only'] += 1
        else:
            row['no picture at all'] += 1

    # ---- reasons for specific credits without a photo
    reasons = collections.Counter()
    examples = collections.defaultdict(list)
    for idx, c in enumerate(data['campaigns']):
        if groups.relation(c) != 'specific' or c.get('images'):
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
        'coverage': {f'{rel} | {kind}': dict(v) for (rel, kind), v in sorted(cov.items())},
        'missing_specific_credits_by_reason': dict(reasons.most_common()),
        'examples': examples,
        'general_relationships': gen,
        'rendering': render,
        'free_pass_groups': len(free),
    }
    runner._write_json('audit.json', out)
    print(json.dumps(out, indent=1, ensure_ascii=False)[:6000])
    return 0
