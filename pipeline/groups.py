"""Credits grouped into distinct campaigns, shows and covers.

A group is one brand + kind + year + season family (+ title when a source names the campaign).
Credits for different models in the same group share discovery and gallery extraction.
Undated credits are general relationships ("worked for Chanel"), not specific appearances,
and are never searched for a specific campaign.
"""
import hashlib
import json
import re
import unicodedata

from . import config, seasons


_TRANS = str.maketrans({'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'Ae', 'ß': 'ss', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D',
                        'œ': 'oe', 'Œ': 'Oe', 'ı': 'i'})


def fold(s):
    s = unicodedata.normalize('NFD', (s or '').translate(_TRANS)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def load():
    return json.load(open(config.DATA))


def relation(c):
    """'specific' for a dated appearance; 'general' for an undated relationship."""
    return 'specific' if c.get('year') else 'general'


def has_exact(c, verified_only=False):
    imgs = c.get('images') or []
    if verified_only:
        imgs = [i for i in imgs if i.get('match') == 'exact']
    return bool(imgs)


def key_of(c):
    kind = c.get('kind') or 'campaign'
    title = c.get('title') or ''
    if kind == 'cover':
        # one magazine issue; the month is carried in the title ("March 2016 issue")
        return (c['brand'], kind, c.get('year'), None, title)
    if re.search(r'(?i)issue', title):
        title = ''
    return (c['brand'], kind, c.get('year'), seasons.family(c.get('season')), title)


def gid(key):
    return hashlib.sha1(json.dumps(key, ensure_ascii=False).encode()).hexdigest()[:12]


def build(data=None):
    """Return {group id: group} for the dated (specific) credits."""
    data = data or load()
    brands = data.get('brands', {})
    out = {}
    for idx, c in enumerate(data['campaigns']):
        if relation(c) != 'specific':
            continue
        k = key_of(c)
        g = out.setdefault(gid(k), {
            'id': gid(k), 'brand': c['brand'], 'kind': k[1], 'year': k[2], 'family': k[3], 'title': k[4],
            'season': c.get('season'), 'aliases': brands.get(c['brand'], {}).get('aliases', []),
            'models': [], 'credits': [], 'sources': [], 'has_photo': False,
        })
        g['credits'].append(idx)
        for t in c['talent']:
            if t not in g['models']:
                g['models'].append(t)
        for s in c['sources']:
            if s['url'] not in g['sources']:
                g['sources'].append(s['url'])
        if c.get('images'):
            g['has_photo'] = True
        if c.get('season') and not g['season']:
            g['season'] = c['season']
    return out


def label(g):
    when = ' '.join(str(x) for x in [g.get('season') or '', g.get('year') or ''] if x)
    what = {'campaign': 'campaign', 'runway': 'runway show', 'cover': 'cover', 'ambassador': 'campaign'}.get(g['kind'], g['kind'])
    return f"{g['brand']} {g['title'] + ' ' if g['title'] else ''}{when} {what}".replace('  ', ' ')
