"""Download, check, deduplicate and store photos in assets/photos."""
import hashlib
import io
import os
import threading

from PIL import Image

from . import cache, config, net

MIN_W, MIN_H = 400, 300
_lock = threading.RLock()
_index = None  # dhash -> file


def dhash(im, size=8):
    g = im.convert('L').resize((size + 1, size), Image.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for r in range(size):
        for c in range(size):
            bits = (bits << 1) | (px[r * (size + 1) + c] > px[r * (size + 1) + c + 1])
    return bits


def _hamming(a, b):
    return bin(a ^ b).count('1')


def index():
    """Perceptual hashes of every photo already stored (cached by file name)."""
    global _index
    with _lock:
        if _index is not None:
            return _index
        store = cache.pages_store()
        known = dict(store.items('dhash'))
        _index = {}
        for f in os.listdir(config.PHOTOS):
            rel = 'assets/photos/' + f
            h = known.get(rel)
            if h is None:
                try:
                    h = dhash(Image.open(os.path.join(config.PHOTOS, f)))
                except Exception:
                    continue
                store.put('dhash', rel, h)
            _index[h] = rel
        return _index


def near_duplicate(h, limit=4):
    for k, rel in index().items():
        if _hamming(k, h) <= limit:
            return rel
    return None


def fetch(url, referer=None, dry=False):
    """Fetch and store one image. Returns {'status': 'ok'|reason, 'file', 'w', 'h', 'sha1', 'dhash', 'duplicate_of'}."""
    store = cache.pages_store()
    got = store.get('image', url)
    if got is not None:
        if got.get('status') != 'ok' or os.path.exists(os.path.join(config.ROOT, got['file'])):
            return got
    if dry:
        return {'status': 'not fetched (dry run)'}
    body, why = net.image_bytes(url, referer)
    if body is None:
        res = {'status': why}
    else:
        try:
            im = Image.open(io.BytesIO(body))
            im.load()
            im = im.convert('RGB')
        except Exception:
            res = {'status': 'not an image'}
        else:
            if im.width < MIN_W or im.height < MIN_H:
                res = {'status': f'too small ({im.width}x{im.height})'}
            else:
                sha = hashlib.sha1(body).hexdigest()
                h = dhash(im)
                dup = near_duplicate(h)
                rel = dup or f'assets/photos/{sha[:16]}.jpg'
                if not dup:
                    small = im.copy()
                    small.thumbnail((720, 900))
                    small.save(os.path.join(config.ROOT, rel), 'JPEG', quality=80, optimize=True, progressive=True)
                    with _lock:
                        index()[h] = rel
                    store.put('dhash', rel, h)
                res = {'status': 'ok', 'file': rel, 'w': im.width, 'h': im.height, 'sha1': sha, 'dhash': h, 'duplicate_of': dup}
    store.put('image', url, res)
    return res
