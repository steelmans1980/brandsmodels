"""Small SQLite key/value stores: one for paid search responses, one for fetched pages."""
import json
import os
import sqlite3
import threading
import time
import zlib

from . import config


class Store:
    def __init__(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.path = path
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('CREATE TABLE IF NOT EXISTS kv (ns TEXT, k TEXT, v BLOB, ts REAL, PRIMARY KEY (ns, k))')
        self.db.commit()

    def get(self, ns, k):
        with self.lock:
            row = self.db.execute('SELECT v FROM kv WHERE ns=? AND k=?', (ns, k)).fetchone()
        return json.loads(zlib.decompress(row[0])) if row else None

    def put(self, ns, k, v):
        blob = zlib.compress(json.dumps(v, ensure_ascii=False).encode(), 6)
        with self.lock:
            self.db.execute('INSERT OR REPLACE INTO kv VALUES (?,?,?,?)', (ns, k, blob, time.time()))
            self.db.commit()

    def items(self, ns):
        with self.lock:
            rows = self.db.execute('SELECT k, v FROM kv WHERE ns=?', (ns,)).fetchall()
        return [(k, json.loads(zlib.decompress(v))) for k, v in rows]

    def delete(self, ns, k):
        with self.lock:
            self.db.execute('DELETE FROM kv WHERE ns=? AND k=?', (ns, k))
            self.db.commit()

    def count(self, ns):
        with self.lock:
            return self.db.execute('SELECT COUNT(*) FROM kv WHERE ns=?', (ns,)).fetchone()[0]


_stores = {}


def search_store():
    return _stores.setdefault('search', Store(config.SEARCH_DB))


def pages_store():
    return _stores.setdefault('pages', Store(config.PAGES_DB))
