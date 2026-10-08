"""Article reading: title, date, body text and the gallery of images inside the article body.

Handles src/srcset/data-* lazy attributes, <picture>, <noscript>, links to full-size files,
and JSON-LD image lists. Related-post blocks, sidebars, ads and recommendations are removed
before images are collected.
"""
import json
import re
import urllib.parse

from bs4 import BeautifulSoup

JUNK = re.compile(r'(?i)related|recommend|sidebar|widget|share|social|(^|[-_ ])ads?([-_ ]|$)|advert|promo|newsletter|'
                  r'comment|footer|more-from|trending|popular|outbrain|taboola|jp-relatedposts|you-may|read-next|'
                  r'next-post|prev-post|author|byline|breadcrumb|menu|nav|subscribe|banner|sponsor|carousel-related|most-read')
BAD_TOKENS = {'logo', 'icon', 'avatar', 'sprite', 'placeholder', 'blank', 'spacer', 'pixel', 'gravatar', 'emoji',
              'badge', 'button', 'favicon', 'loader', 'loading', 'default', 'share', 'thumbnail', 'thumb'}


ALWAYS_BAD = {'gravatar', 'avatar', 'favicon', 'sprite', 'emoji', 'pixel', 'spacer', 'placeholder'}


def bad_image_name(name, large=False):
    """Site furniture judged by file name. A picture declared large keeps words like 'logo' (campaign images are
    often exported as 'AW26_1080x1350_LOGO_14.jpg')."""
    name = name.lower()
    if re.search(r'\.(svg|gif)$', name):
        return True
    tokens = set(re.split(r'[-_.\s]+', name))
    return bool(tokens & (ALWAYS_BAD if large else BAD_TOKENS))


LAZY = ('data-orig-file', 'data-large-file', 'data-full-url', 'data-lazy-src', 'data-src', 'data-original',
        'data-lazy', 'data-url', 'data-image', 'src')
IMG_FILE = re.compile(r'(?i)\.(jpe?g|png|webp)(\?|$)')


def _largest_from_srcset(srcset):
    best, best_w = None, -1
    for part in (srcset or '').split(','):
        bits = part.strip().split()
        if not bits:
            continue
        w = 0
        if len(bits) > 1 and bits[1].endswith('w'):
            try:
                w = int(bits[1][:-1])
            except ValueError:
                w = 0
        elif len(bits) > 1 and bits[1].endswith('x'):
            try:
                w = int(float(bits[1][:-1]) * 1000)
            except ValueError:
                w = 0
        if w >= best_w:
            best, best_w = bits[0], w
    return best


def _canon(url):
    """Strip WordPress size suffixes and resize queries so variants of one image dedupe."""
    u = urllib.parse.urlparse(url)
    path = re.sub(r'-\d{2,4}x\d{2,4}(?=\.\w+$)', '', u.path)
    return f'{u.netloc}{path}'.lower()


def _full_size(url):
    """Prefer the original upload over a resized WordPress variant."""
    return re.sub(r'-\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp)(\?|$))', '', url, flags=re.I)


def _text(node):
    return re.sub(r'\s+', ' ', node.get_text(' ', strip=True)) if node else ''


def _meta(soup, *names):
    for n in names:
        tag = soup.find('meta', attrs={'property': n}) or soup.find('meta', attrs={'name': n}) or soup.find('meta', attrs={'itemprop': n})
        if tag and tag.get('content'):
            return tag['content'].strip()
    return ''


def _jsonld(soup):
    out = []
    for s in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(s.string or '')
        except Exception:
            continue
        stack = [data]
        while stack:
            x = stack.pop()
            if isinstance(x, list):
                stack.extend(x)
            elif isinstance(x, dict):
                out.append(x)
                for k in ('@graph', 'mainEntity', 'associatedMedia', 'image'):
                    if isinstance(x.get(k), (list, dict)):
                        stack.append(x[k])
    return out


def _main(soup):
    cands = soup.select('[itemprop=articleBody], .entry-content, .post-content, .article-body, .article__body, '
                        '.article-content, .story-body, .post-body, .single-content, .td-post-content, article, main')
    best, best_len = None, 0
    for c in cands:
        n = len(_text(c))
        if n > best_len:
            best, best_len = c, n
    return best or soup.body or soup


def read(html, base_url):
    """Parse an article. Returns dict with title, published, text, images[{url, alt, caption, w, h, lead}]."""
    soup = BeautifulSoup(html, 'lxml')
    title = _meta(soup, 'og:title', 'twitter:title') or _text(soup.find('h1')) or _text(soup.title)
    published = _meta(soup, 'article:published_time', 'datePublished', 'date', 'pubdate', 'parsely-pub-date')
    ld = _jsonld(soup)
    for x in ld:
        if not published and isinstance(x.get('datePublished'), str):
            published = x['datePublished']
    if not published:
        m = re.search(r'/((?:19|20)\d\d)/(\d\d)/', base_url)
        if m:
            published = f'{m.group(1)}-{m.group(2)}'
    og = _meta(soup, 'og:image', 'og:image:secure_url', 'twitter:image')

    for tag in soup(['script', 'style', 'nav', 'footer', 'aside', 'form', 'iframe', 'header']):
        if tag.name == 'script' and tag.get('type') == 'application/ld+json':
            continue
        tag.decompose()
    main = _main(soup)
    for tag in list(main.find_all(True)):
        if tag.decomposed if hasattr(tag, 'decomposed') else False:
            continue
        attrs = getattr(tag, 'attrs', None)
        if not attrs:
            continue
        ident = ' '.join([tag.get('id') or ''] + (tag.get('class') or []))
        if ident and JUNK.search(ident) and tag.name not in ('img', 'body', 'html'):
            tag.decompose()
    text = _text(main)

    images, seen = [], set()

    def add(url, alt='', caption='', w=0, h=0, lead=False):
        if not isinstance(url, str) or not url or url.startswith('data:'):
            return
        url = urllib.parse.urljoin(base_url, url.strip())
        large = (w or 0) >= 500 and (h or 0) >= 500
        if not url.startswith('http') or bad_image_name(url.split('?')[0].rsplit('/', 1)[-1], large):
            return
        url = _full_size(url)
        c = _canon(url)
        if c in seen:
            for i in images:
                if _canon(i['url']) == c:
                    i['alt'] = i['alt'] or alt
                    i['caption'] = i['caption'] or caption
            return
        seen.add(c)
        images.append({'url': url, 'alt': alt or '', 'caption': caption or '', 'w': w, 'h': h, 'lead': lead})

    if og:
        add(og, '', '', lead=True)  # the page title is not this image's caption; a real alt in the body fills it
    for ns in main.find_all('noscript'):
        inner = BeautifulSoup(ns.decode_contents(), 'lxml')
        ns.replace_with(inner)
    for img in main.find_all(['img', 'source']):
        url = None
        for a in ('data-srcset', 'srcset'):
            if img.get(a):
                url = _largest_from_srcset(img[a])
                if url:
                    break
        if not url:
            for a in LAZY:
                v = img.get(a)
                if v and not v.startswith('data:'):
                    url = v
                    break
        if img.name == 'source':
            pic = img.find_parent('picture')
            alt_img = pic.find('img') if pic else None
            alt = alt_img.get('alt', '') if alt_img else ''
        else:
            alt = img.get('alt', '') or img.get('title', '')
        fig = img.find_parent('figure')
        cap = _text(fig.find('figcaption')) if fig else ''
        link = img.find_parent('a')
        if link and link.get('href') and IMG_FILE.search(link['href']):
            url = link['href']  # the gallery link points at the full-size file
        try:
            w = int(img.get('width') or 0)
            h = int(img.get('height') or 0)
        except ValueError:
            w = h = 0
        if (w and w < 250) or (h and h < 250):
            continue
        add(url, alt, cap, w, h)
    for a in main.find_all('a', href=IMG_FILE):
        add(a['href'], a.get('title', '') or _text(a), '')
    for x in ld:
        if x.get('@type') in ('ImageObject',) and x.get('url'):
            cap = x.get('caption') or x.get('name') or ''
            add(x['url'], cap if isinstance(cap, str) else '', '')
    return {'title': title, 'published': published, 'text': text, 'images': images[:40], 'url': base_url}
