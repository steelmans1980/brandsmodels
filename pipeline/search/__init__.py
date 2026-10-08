"""Paid search adapters. Every response is cached by (provider, query) so a query is paid for once.

Budget accounting is shared: a run stops issuing paid requests once its budget is reached.
"""
import threading
import time
import uuid

from .. import cache, config


class Budget:
    def __init__(self, dollars, dry=False, run=''):
        self.run = run
        self.limit = dollars
        self.spent = 0.0
        self.requests = {}
        self.cached = 0
        self.dry = dry
        self.lock = threading.Lock()

    def allow(self, provider):
        with self.lock:
            return not self.dry and self.spent + config.PRICE[provider] <= self.limit + 1e-9

    def charge(self, provider, query=''):
        with self.lock:
            self.spent += config.PRICE[provider]
            self.requests[provider] = self.requests.get(provider, 0) + 1
        # permanent record of every paid request (kept with the committed search cache)
        cache.search_store().put('ledger', f'{time.time():.3f}-{uuid.uuid4().hex[:6]}',
                                 {'provider': provider, 'query': query, 'usd': config.PRICE[provider], 'ts': time.time(),
                                  'run': self.run})


def ledger_total(run_prefix=None):
    """Requests and dollars actually paid, optionally for runs whose name starts with run_prefix."""
    rows = [v for _, v in cache.search_store().items('ledger')
            if run_prefix is None or (v.get('run') or '').startswith(run_prefix)]
    return {'requests': len(rows), 'usd': round(sum(r['usd'] for r in rows), 3)}


def cached(provider, query):
    return cache.search_store().get(provider, query)


def save(provider, query, value):
    cache.search_store().put(provider, query, value)
