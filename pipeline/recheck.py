"""Re-check every published photo that is tagged with a model.

A tag is kept only when the photo's own caption or alt text on its source page names that model, or when a person
recorded the attribution in results/review_attributions.json. A page about one model, a file name or a page title is
not enough. Photos that fail keep their place in the campaign but lose the tag ("models not identified individually").

The source page is fetched again (robots.txt respected). The picture on the page is matched to the stored file by its
original URL when the evidence recorded one, otherwise by perceptual hash of the captioned pictures only.
"""
import io
import json
import os
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

from . import config, extract, net, verify
from .images import _hamming, dhash

REVIEW = os.path.join(config.RESULTS, 'review_attributions.json')
MAX_HASH_DISTANCE = 8
MAX_DOWNLOADS = 12


def key(src, talent):
    return src + '|' + ','.join(sorted(talent))


def human_reviews():
    """{file: {'models': [...], 'reviewer': ..., 'date': ..., 'note': ...}} recorded by a person."""
    if not os.path.exists(REVIEW):
        return {}
    return {k: v for k, v in json.load(open(REVIEW)).items() if not k.startswith('_')}


def _canon(u):
    return extract._canon(extract._full_size(u)) if u else None


def _local_hash(rel):
    try:
        return dhash(Image.open(os.path.join(config.ROOT, rel)))
    except Exception:
        return None


def check(item):
    """item: {'src', 'from', 'talent', 'image' (original URL or None)}. Returns the decision."""
    out = {'src': item['src'], 'page': item['from'], 'before': item['talent'], 'after': [], 'caption': ''}
    if not item['from']:
        out['why'] = 'no source page recorded'
        return out
    p = net.page(item['from'])
    if p.get('status') != 'ok':
        out['why'] = f"source page not readable ({p.get('status')})"
        return out
    try:
        art = extract.read(p['html'], p.get('final') or item['from'])
    except Exception as e:
        out['why'] = f'source page not parsed ({type(e).__name__})'
        return out
    captioned = []
    boiler = verify.page_boilerplate(art)
    for img in art['images']:
        cap = verify.image_caption(img, boiler)
        named = verify.model_hits(item['talent'], cap) if cap else []
        if named:
            captioned.append((img, cap, named))
    if not captioned:
        out['why'] = 'no picture on the source page is captioned with the model'
        return out
    want = _canon(item.get('image'))
    match = next(((img, cap, named) for img, cap, named in captioned if want and _canon(img['url']) == want), None)
    if match is None:
        h = _local_hash(item['src'])
        if h is not None:
            for img, cap, named in captioned[:MAX_DOWNLOADS]:
                body, _ = net.image_bytes(img['url'], art['url'])
                if not body:
                    continue
                try:
                    d = _hamming(dhash(Image.open(io.BytesIO(body))), h)
                except Exception:
                    continue
                if d <= MAX_HASH_DISTANCE:
                    match = (img, cap, named)
                    out['hash_distance'] = d
                    break
    if match is None:
        out['why'] = 'captioned pictures on the page are not this photo'
        return out
    img, cap, named = match
    out.update(after=named, caption=cap[:300], image=img['url'], why='caption or alt text names the model')
    return out


def run(data, evidence, workers=12):
    reviews = human_reviews()
    todo, decisions, seen = [], {}, set()
    for c in data['campaigns']:
        for im in c.get('images', []):
            if not im.get('talent'):
                continue
            r = reviews.get(im['src'])
            if r:
                decisions[key(im['src'], im['talent'])] = {'src': im['src'], 'page': im.get('from'), 'before': im['talent'],
                                        'after': [t for t in r['models'] if t in c['talent']],
                                        'why': 'human review', 'review': r}
                continue
            k = key(im['src'], im['talent'])
            if k in seen:
                continue
            seen.add(k)
            todo.append({'src': im['src'], 'from': im.get('from'), 'talent': im['talent'],
                         'image': (evidence.get(im['src']) or {}).get('image')})
    # round-robin across hosts so workers don't all queue behind one site's politeness delay
    by_host = {}
    for t in todo:
        by_host.setdefault(net.host_of(t['from'] or ''), []).append(t)
    lanes = sorted(by_host.values(), key=len, reverse=True)
    todo = [lane[i] for i in range(max(map(len, lanes), default=0)) for lane in lanes if i < len(lane)]
    with ThreadPoolExecutor(workers) as ex:
        for i, d in enumerate(ex.map(check, todo), 1):
            decisions[key(d['src'], d['before'])] = d
            if i % 250 == 0:
                print(f'  {i}/{len(todo)} checked', flush=True)
    return decisions
