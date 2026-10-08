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
