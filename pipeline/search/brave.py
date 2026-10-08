"""Brave Search API (web and image search).

The key is injected by the environment's outbound proxy for api.search.brave.com, or read from
the BRAVE_API_KEY environment variable. It is never stored in the repository.
"""
import os
import time

import requests

from . import cached, save

URL = {'brave_web': 'https://api.search.brave.com/res/v1/web/search',
       'brave_images': 'https://api.search.brave.com/res/v1/images/search'}


def _call(provider, query, budget):
    hit = cached(provider, query)
    if hit is not None:
        budget.cached += 1
        return hit
    if not budget.allow(provider):
        return None
    headers = {'Accept': 'application/json'}
    if os.environ.get('BRAVE_API_KEY'):
        headers['X-Subscription-Token'] = os.environ['BRAVE_API_KEY']
    params = {'q': query, 'count': 20 if provider == 'brave_web' else 50, 'safesearch': 'off'}
    for attempt in range(4):
        r = requests.get(URL[provider], params=params, headers=headers, timeout=30)
        if r.status_code == 429:
            time.sleep(1.5 * (attempt + 1))
            continue
        break
    if r.status_code != 200:
        return {'error': f'http {r.status_code}', 'results': []}
    budget.charge(provider, query)
    d = r.json()
    if provider == 'brave_web':
        res = [{'url': x.get('url'), 'title': x.get('title') or '', 'snippet': x.get('description') or '',
                'age': x.get('page_age')} for x in d.get('web', {}).get('results', [])]
    else:
        res = [{'url': x.get('url'), 'title': x.get('title') or '', 'image': (x.get('properties') or {}).get('url'),
                'source': x.get('source')} for x in d.get('results', [])]
    out = {'results': res}
    save(provider, query, out)
    return out


def web(query, budget):
    return _call('brave_web', query, budget)


def images(query, budget):
    return _call('brave_images', query, budget)
