"""Polite, cached HTTP: robots.txt checks, article pages and image downloads."""
import re
import threading
import time
import urllib.parse
import urllib.robotparser

import requests

from . import cache, config

_host_lock = threading.Lock()
_host_next = {}
_local = threading.local()

# Sites that serve no usable page to us whatever robots.txt says (login walls, data brokers).
NEVER = ('instagram.com', 'facebook.com', 'pinterest.', 'tiktok.com', 'twitter.com', 'x.com', 'reddit.com',
         'models.com', 'fashionmodeldirectory.com', 'gettyimages.', 'shutterstock.', 'alamy.', 'ebay.', 'etsy.',
         'amazon.', 'aliexpress.', 'wikipedia.org', 'wikimedia.org', 'youtube.com', 'tumblr.com', 'imdb.com', 'alchetron.com', 'famousfix.com',
         '1stdibs.com', 'therealreal.com', 'vestiairecollective.com', 'poshmark.com', 'shrimptoncouture.com',
         # event and red-carpet photo sites: never campaign imagery
         'redcarpet-fashionawards.com')


def _decode(r, ctype):
    """Page text. Without a declared charset requests assumes ISO-8859-1, which garbles UTF-8 pages."""
    if 'charset' in ctype.lower():
        return r.text
    try:
        return r.content.decode('utf-8')
    except UnicodeDecodeError:
        return r.content.decode(r.apparent_encoding or 'latin-1', errors='replace')


MOJIBAKE = re.compile('Ã[\x80-\xbf©¨§¶¼½¾]|â€')


def repair(text):
    """Undo UTF-8 read as Latin-1 (pages cached before _decode existed)."""
    if text and MOJIBAKE.search(text):
        try:
            return text.encode('latin-1').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            try:
                return text.encode('cp1252').decode('utf-8')
            except (UnicodeEncodeError, UnicodeDecodeError):
                return text
    return text


def session():
    s = getattr(_local, 's', None)
    if s is None:
        s = _local.s = requests.Session()
        s.headers.update({'User-Agent': config.USER_AGENT, 'Accept-Language': 'en'})
    return s


def host_of(url):
    return urllib.parse.urlparse(url).netloc.lower()


def never(url):
    h = host_of(url)
    return any(n in h for n in NEVER)


def _polite(host, gap=1.0):
    with _host_lock:
        now = time.time()
        at = max(now, _host_next.get(host, 0))
        _host_next[host] = at + gap
    if at > now:
        time.sleep(at - now)


def _robots_text(scheme, host):
    store = cache.pages_store()
    key = f'{scheme}://{host}'
    got = store.get('robots', key)
    if got is not None:
        return got['text']
    try:
        _polite(host)
        r = session().get(key + '/robots.txt', timeout=15)
        if r.status_code in (401, 403):
            text = 'User-agent: *\nDisallow: /'
        elif r.status_code >= 400:
            text = ''
        else:
            text = r.text[:60000]
    except Exception:
        text = ''
    store.put('robots', key, {'text': text})
    return text


def allowed(url):
    """True when every Claude user agent may fetch this URL under the site's robots.txt."""
    u = urllib.parse.urlparse(url)
    if u.scheme not in ('http', 'https') or not u.netloc:
        return False
    text = _robots_text(u.scheme, u.netloc.lower())
    if not text:
        return True
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(text.splitlines())
    return all(rp.can_fetch(a, url) for a in config.ROBOTS_AGENTS)


def page(url, offline=False):
    """Fetch an article page (cached). Returns {'status': 'ok'|'blocked'|'never'|'error'|'http NNN'|'not html', ...}."""
    store = cache.pages_store()
    got = store.get('page', url)
    if got is not None and never(url):
        return {'status': 'never'}  # a host excluded after the page was cached
    if got is not None:
        if got.get('html'):
            got['html'] = repair(got['html'])
        return got
    if offline:
        return {'status': 'uncached'}
    if never(url):
        res = {'status': 'never'}
    elif not allowed(url):
        res = {'status': 'blocked'}
    else:
        try:
            _polite(host_of(url))
            r = session().get(url, timeout=25, allow_redirects=True)
            ctype = r.headers.get('content-type', '')
            if r.status_code != 200:
                res = {'status': f'http {r.status_code}'}
            elif 'html' not in ctype:
                res = {'status': 'not html'}
            elif r.url != url and not allowed(r.url):
                res = {'status': 'blocked', 'final': r.url}
            else:
                res = {'status': 'ok', 'final': r.url, 'html': _decode(r, ctype)[:1500000]}
        except Exception as e:
            res = {'status': 'error', 'error': type(e).__name__}
    store.put('page', url, res)
    return res


def image_bytes(url, referer=None):
    """Download an image if robots.txt allows it. Returns (bytes or None, reason)."""
    if never(url):
        return None, 'image host never used'
    if not allowed(url):
        return None, 'image host blocks Claude'
    try:
        _polite(host_of(url), 0.3)
        r = session().get(url, timeout=25, headers={'Referer': referer} if referer else {})
    except Exception as e:
        return None, f'image error {type(e).__name__}'
    if r.status_code != 200:
        return None, f'image http {r.status_code}'
    return r.content, 'ok'
