"""Optional Google Images discovery through SerpApi (engine=google_images).

Set SERPAPI_API_KEY in the environment (or have the outbound proxy inject `api_key` for serpapi.com).
Without it this adapter is skipped. Results are used only to find candidate article pages and
image URLs: a page must still allow Claude in robots.txt and pass verification, and an image is
downloaded only from a host that allows it. A search result is not permission to republish.
"""
import collections
import os
import threading
import time
import uuid

import requests

from .. import cache
from . import cached, save

ENDPOINT = 'https://serpapi.com/search.json'
ACCOUNT = 'https://serpapi.com/account.json'  # plan and searches left; not billed as a search


def available():
    return bool(os.environ.get('SERPAPI_API_KEY'))


def account():
    """The account's plan and remaining searches (plan_id, plan_name, searches_per_month, plan_searches_left,
    total_searches_left, account_rate_limit_per_hour, this_hour_searches). The key is never logged."""
    r = requests.get(ACCOUNT, params={'api_key': os.environ['SERPAPI_API_KEY']}, timeout=30)
    r.raise_for_status()
    d = r.json()
    return {k: d.get(k) for k in ('plan_id', 'plan_name', 'searches_per_month', 'plan_searches_left', 'extra_credits',
                                  'total_searches_left', 'account_rate_limit_per_hour', 'this_hour_searches',
                                  'last_hour_searches')}


def allowance(needed, plans=('free',)):
    """(ok, account, why). ok only when the account's plan is one of `plans` and its current month still includes
    `needed` searches (plan_searches_left, not extra credits), and this hour's limit allows them. The run then uses
    searches already paid for and can never cause overage or an early renewal."""
    if not available():
        return False, None, 'SERPAPI_API_KEY not set'
    acc = account()
    plan = f"{acc.get('plan_id') or ''} {acc.get('plan_name') or ''}".lower()
    if not any(p in plan for p in plans):
        return False, acc, f"account is on '{acc.get('plan_name')}', not one of {', '.join(plans)}: not running"
    left = acc.get('plan_searches_left')
    if left is None or left < needed:
        return False, acc, f'only {left} searches left in this month\'s plan, {needed} needed'
    hour_left = (acc.get('account_rate_limit_per_hour') or 0) - (acc.get('this_hour_searches') or 0)
    if hour_left < needed:
        return False, acc, f'only {hour_left} searches left this hour, {needed} needed'
    return True, acc, 'ok'


# What one search of the plan's included allowance is worth, for the ledger (the subscription is paid either way).
PLAN_PRICE_PER_SEARCH = {'free': 0.0, 'starter': 25 / 1000, 'developer': 75 / 5000, 'production': 150 / 15000}


# SerpApi's light engine answers 503 under parallel load, so at most two searches are in flight at once.
_slots = threading.BoundedSemaphore(2)


def _log_attempt(query, engine, status, billable):
    """Every HTTP request, kept apart from the ledger: an attempt is not necessarily a billed search. SerpApi bills a
    successful search (results or "no results"), not a 5xx, an account error, or a repeat it serves from its own
    hour-long cache, so `billable` is an upper bound; the account's own counter (account.json) is the reference."""
    cache.search_store().put('serpapi_attempts', f'{time.time():.3f}-{uuid.uuid4().hex[:6]}',
                             {'query': query, 'engine': engine, 'status': status, 'possibly_billable': billable,
                              'ts': time.time()})


def attempts_since(ts):
    rows = [v for _, v in cache.search_store().items('serpapi_attempts') if v['ts'] >= ts]
    return {'http_requests': len(rows), 'possibly_billable': sum(1 for r in rows if r['possibly_billable']),
            'by_status': dict(collections.Counter(r['status'] for r in rows))}


def images(query, budget):
    provider = 'serpapi_google_images'
    hit = cached(provider, query)
    if hit is not None:
        budget.cached += 1
        return hit
    if not available():
        return None
    d = None
    # google_images often reports "no results" for queries Google answers (seen on 27 of 50 trial queries);
    # google_images_light returns the same fields for those, so it is tried once before giving up.
    # budget.allow() is called once per engine search, so its cap bounds the searches that can be billed.
    for engine in ('google_images', 'google_images_light'):
        if not budget.allow(provider):
            return None
        params = {'engine': engine, 'q': query, 'hl': 'en', 'gl': 'us', 'api_key': os.environ['SERPAPI_API_KEY']}
        with _slots:
            for attempt in range(3):
                try:
                    r = requests.get(ENDPOINT, params=params, timeout=120)
                except requests.RequestException as e:
                    _log_attempt(query, engine, type(e).__name__, False)
                    return {'error': type(e).__name__, 'results': []}
                if r.status_code not in (502, 503, 504):
                    break
                _log_attempt(query, engine, f'http {r.status_code}', False)
                time.sleep(5 * (attempt + 1))
        if r.status_code != 200:
            return {'error': f'http {r.status_code}', 'results': []}
        d = r.json()
        empty = bool(d.get('error')) and ('hasn' in d['error'] or 'no results' in d['error'].lower())
        if d.get('error') and not d.get('images_results') and not empty:
            _log_attempt(query, engine, 'account error', False)
            return {'error': d['error'], 'results': []}
        _log_attempt(query, engine, 'results' if d.get('images_results') else 'no results', True)
        budget.charge(provider, query)
        if d.get('images_results'):
            break
    if not d.get('images_results'):
        out = {'error': d.get('error') or 'no results', 'results': []}
        save(provider, query, out)
        return out
    res = [{'url': x.get('link'), 'title': x.get('title') or '', 'image': x.get('original'), 'source': x.get('source'),
            'w': x.get('original_width'), 'h': x.get('original_height'), 'engine': engine}
           for x in d.get('images_results', [])]
    out = {'results': res}
    save(provider, query, out)
    return out
