"""Optional Google Images discovery through SerpApi (engine=google_images).

Set SERPAPI_API_KEY in the environment (or have the outbound proxy inject `api_key` for serpapi.com).
Without it this adapter is skipped. Results are used only to find candidate article pages and
image URLs: a page must still allow Claude in robots.txt and pass verification, and an image is
downloaded only from a host that allows it. A search result is not permission to republish.
"""
import os

import requests

from . import cached, save

ENDPOINT = 'https://serpapi.com/search.json'


def available():
    return bool(os.environ.get('SERPAPI_API_KEY'))


def images(query, budget):
    provider = 'serpapi_google_images'
    hit = cached(provider, query)
    if hit is not None:
        budget.cached += 1
        return hit
    if not available() or not budget.allow(provider):
        return None
    params = {'engine': 'google_images', 'q': query, 'hl': 'en', 'gl': 'us', 'api_key': os.environ['SERPAPI_API_KEY']}
    r = requests.get(ENDPOINT, params=params, timeout=60)
    if r.status_code != 200:
        return {'error': f'http {r.status_code}', 'results': []}
    d = r.json()
    if d.get('error') and not d.get('images_results'):
        # SerpApi reports "no results" and account errors in the body; only successful searches are billed
        out = {'error': d['error'], 'results': []}
        if 'hasn' in d['error'] or 'no results' in d['error'].lower():
            save(provider, query, out)
        return out
    budget.charge(provider, query)
    res = [{'url': x.get('link'), 'title': x.get('title') or '', 'image': x.get('original'), 'source': x.get('source'),
            'w': x.get('original_width'), 'h': x.get('original_height')} for x in d.get('images_results', [])]
    out = {'results': res}
    save(provider, query, out)
    return out
