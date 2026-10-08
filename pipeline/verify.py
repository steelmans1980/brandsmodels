"""Does an article document this exact campaign, show or cover, and which of its images show whom?

An article is accepted as exact only when it names the label, the kind of work (campaign, show,
cover) and the group's year — and its season when the credit has one — and mentions at least one
of the group's models. A year one off, or a date inferred only from the publication date, gives a
candidate that is recorded but not accepted.
"""
import re

from . import groups, seasons

KIND_WORDS = {
    'campaign': r'campaign|\bads?\b|advert|stars? in|fronts?\b|face of|lookbook|imagery|lensed|shot by|photographed by|ambassador',
    'ambassador': r'campaign|\bads?\b|advert|stars? in|fronts?\b|face of|ambassador|lookbook',
    'runway': r'runway|catwalk|\bshow\b|fashion week|walked|walks|défilé',
    'cover': r'\bcovers?\b|cover star|issue',
}
_MON = r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?'
_DATE = (r'(?:\b' + _MON + r'\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d\d|\b\d{1,2}(?:st|nd|rd|th)?\s+' + _MON +
         r',?\s+(?:19|20)\d\d)')
# A byline: a date after "Published/Updated/Posted", a date followed by a clock time, or an ISO date. A date in a
# sentence ("walked the show on September 26, 2021") is left alone: it can be the event's own date.
DATELINE = re.compile(
    r'(?i)\b(?:published|updated|posted|last updated|modified)(?:\s+on)?\s*:?\s*' + _DATE + r'(?:\s*(?:at\s+)?\d{1,2}:\d\d\s*(?:am|pm)?(?:\s*[a-z]{2,4})?)?'
    r'|' + _DATE + r'\s*(?:at\s+|[|·,]\s*)?\d{1,2}:\d\d\s*(?:am|pm)?(?:\s*[a-z]{2,4}\b)?'
    r'|\b(?:19|20)\d\d-\d\d-\d\d(?:T[\d:+-]+)?')
# Pages that list many things (profiles, tags, archives) mention campaigns without being about one.
LISTING_URL = re.compile(r'(?i)/(?:models?|tags?|category|categories|archive|archives|author|search|page/\d+)/|[?&](?:s|tag|q)=')


def strip_dates(text):
    """Blank out datelines ("Mar 8, 2023 8:51 AM EST", "Published: Aug 28, 2013") so a publication date is never
    read as a campaign year. Positions are preserved."""
    return DATELINE.sub(lambda m: ' ' * len(m.group(0)), text or '')


KNOWN_BRANDS = set()  # folded label names in the data, set by discover (to tell "Armani" from "Emporio Armani")
KNOWN_MAGAZINES = set()  # folded magazine names in the data, set by discover (to spot editorials)
KNOWN_MODELS = set()  # folded names of every model in the data, set by discover (to spot pages about someone else)
RUNWAY_STRICT = r'runway|catwalk|\bshow\b|fashion week|défilé|walked|walks'
NOT_CAMPAIGN = r'runway|catwalk|fashion week|backstage|red carpet|street style|front row|\battends?\b|\barrives?\b|spotted|paparazzi|\bgala\b|premiere'
# image text that marks a picture as something other than the campaign or show itself
OFF_KIND = {
    'runway': r'campaign|\bads?\b|advert|backstage|red carpet|street style|front row|\battends?\b|\barrives?\b|spotted|beauty look',
    'campaign': NOT_CAMPAIGN + r'|beauty look|\bshow\b',
    'ambassador': r'backstage|street style|paparazzi|spotted',
    'cover': r'backstage|red carpet|street style|\battends?\b|\barrives?\b|spotted',
}
ROUNDUP = re.compile(r'(?i)\b(best|top \d+|round-?up|all the|every|our favou?rite|\d+ (?:new )?(?:campaigns|ads|covers|looks))\b|campaigns of the (?:season|year|week)')
# Single words that are also common English words: matched case-sensitively in the raw text.
AMBIGUOUS = {'gap', 'coach', 'guess', 'express', 'mango', 'next', 'elle', 'w', 'v', 'love', 'time', 'people', 'self',
             'glamour', 'allure', 'essence', 'muse', 'paper', 'interview', 'vogue', 'grazia', 'shape', 'marie claire',
             'nylon', 'i d', 'numero', 'tatler', 'porter', 'arena', 'lui', 'pop', 'exit', 'twin', 'hunger', 'flair',
             'kenzo', 'boss', 'escada', 'fila', 'puma', 'loewe', 'bebe', 'joop', 'lanvin', 'celine', 'chloe'}


def _brand_rx(names):
    pats, case = [], []
    for n in names:
        f = groups.fold(n)
        if not f:
            continue
        if f in AMBIGUOUS or len(f) <= 3:
            # the label's own spelling, or set in capitals / title case ("bebe", "Bebe", "BEBE"; not "coach")
            case += [re.escape(v) for v in {n, n.upper(), n[:1].upper() + n[1:]}]
        else:
            pats.append(r'\b' + r'\s+'.join(map(re.escape, f.split())) + r'\b')
    return (re.compile('|'.join(pats)) if pats else None), (re.compile(r'\b(?:' + '|'.join(case) + r')\b') if case else None)


class Brand:
    def __init__(self, name, aliases=()):
        self.name = name
        names = {name, *aliases}
        if name.startswith('Christian Dior') or name == 'Dior':
            names |= {'Dior'}
        self.folded, self.cased = _brand_rx(names)

    def find(self, raw):
        """Positions (in the folded text) where the label is named."""
        f = groups.fold(raw)
        hits = [m.start() for m in self.folded.finditer(f)] if self.folded else []
        if self.cased and self.cased.search(raw):
            for m in self.cased.finditer(raw):
                hits.append(len(groups.fold(raw[:m.start()])))
        return sorted(hits)


SUBLINES = ('exchange', 'junior', 'kids', 'kid', 'teen', 'man', 'men', 'homme', 'uomo', 'baby', 'home', 'children',
            'boys', 'girls', 'mini', 'beauty', 'eyewear', 'fragrance', 'parfums', 'golf', 'ski')


PREFIX_LINES = ('emporio', 'mcq', 'ea7')


def _subline(group, title):
    """The sub-line a headline is about when the label is always followed by one ("Armani Exchange",
    "Mango Teen"), or a menswear headline; None when the credit itself names that line."""
    own = set(groups.fold(group['brand'] + ' ' + (group.get('title') or '')).split())
    f = groups.fold(title)
    fb = groups.fold(group['brand'])
    for longer in KNOWN_BRANDS:
        if longer != fb and f' {fb} ' in f' {longer} ' and f' {longer} ' in f' {f} ':
            return longer.title()
    if re.search(r"\bmen ?s\b|menswear|\bmen s campaign", f) and not own & {'men', 'man', 'homme', 'uomo'}:
        return 'menswear'
    brand = Brand(group['brand'], group.get('aliases', []))
    after = []
    for pos in brand.find(title):
        rest = f[pos:].split()
        n = len(groups.fold(group['brand']).split())
        nxt = rest[n] if len(rest) > n else ''
        after.append(nxt)
    before = [f[:pos].split()[-1] if f[:pos].split() else '' for pos in brand.find(title)]
    if before and all(b in PREFIX_LINES and b not in own for b in before):
        return f"{before[0].title()} {group['brand']}"
    if after and all(a in SUBLINES and a not in own for a in after):
        return f"{group['brand']} {after[0].title()}"
    return None


def _surname(name):
    parts = groups.fold(name).split()
    return parts[-1] if parts else ''


def model_hits(models, text):
    """Models of the group named in text (full name, or a surname of 4+ letters)."""
    f = ' ' + groups.fold(text) + ' '
    out = []
    for m in models:
        full = ' ' + groups.fold(m) + ' '
        sur = _surname(m)
        if full in f or (len(sur) >= 4 and f' {sur} ' in f and _surname_alone(m, sur, text)):
            out.append(m)
    return out


_TITLES = {'ms', 'mrs', 'miss', 'model', 'models', 'supermodel', 'by', 'and', 'with', 'of', 'the', 'for', 'star', 'stars',
           'muse', 'a', 'an', 'in', 'on', 'as', 'to', 'at', 'from', 'photo', 'image', 'campaign', 'cover', 'ad', 'ads',
           'feat', 'featuring', 'starring', 'x', 'jpg', 'img'}


def _surname_alone(model, sur, text):
    """True unless every mention of the surname follows a different capitalised first name
    ("Sienna Miller" is not Alyssa Miller), also in lower-case file names."""
    names = {groups.fold(w) for w in model.split()}
    words = re.findall(r"[\w'’.-]+", text)
    seen = False
    for i, w in enumerate(words):
        if groups.fold(w).strip('.') != sur:
            continue
        seen = True
        prev = words[i - 1] if i else ''
        p = groups.fold(prev).strip('.')
        if not p or not p.isalpha() or p in names or p in _TITLES:
            return True
    return not seen


def _pub_ok(published, fam, year):
    m = re.match(r'((?:19|20)\d\d)(?:-(\d\d))?', published or '')
    if not m:
        return None
    y, mo = int(m.group(1)), int(m.group(2) or 6)
    t = y * 12 + mo
    lo, hi = {
        'SS': ((year - 1) * 12 + 10, year * 12 + 6), 'FW': (year * 12 + 5, year * 12 + 12),
        'HOL': (year * 12 + 9, (year + 1) * 12 + 1), 'RES': ((year - 1) * 12 + 9, year * 12 + 3),
        'PF': (year * 12 + 3, year * 12 + 9),
    }.get(fam, ((year - 1) * 12 + 9, (year + 1) * 12 + 2))
    return lo <= t <= hi


def assess(group, article):
    """Verdict on an article for a group: {'verdict': 'exact'|'candidate'|'reject', 'reason', 'evidence'}."""
    brand = Brand(group['brand'], group.get('aliases', []))
    title, text = article['title'] or '', strip_dates(article['text'] or '')
    lead = text[:2500]
    ev = {'title': title[:200], 'published': article.get('published')}
    if LISTING_URL.search(article.get('url') or '') or re.fullmatch(r'(?i)\s*(archive|archives|tag:.*|category:.*)\s*', title):
        return {'verdict': 'reject', 'reason': 'listing, tag or profile page, not an article about the campaign', 'evidence': ev}
    t_brand = brand.find(title)
    b_brand = brand.find(lead)
    if not t_brand and not b_brand:
        return {'verdict': 'reject', 'reason': 'label not named in the article', 'evidence': ev}
    kind = group['kind']
    if kind != 'cover' and not t_brand:
        # case-sensitive on the raw headline: "Elle" / "Vogue" the masthead, not the word
        plain = title.replace('’', "'").replace('‘', "'")
        mag = next((m for m in KNOWN_MAGAZINES if re.search(r'(?<![\w])' + re.escape(m) + r'(?![\w])', plain)), None)
        if mag:
            ev['magazine'] = mag  # an issue's pages: only pictures captioned with this label can be its ads
    line = _subline(group, title)
    if line:
        return {'verdict': 'reject', 'reason': f'about another line ({line})', 'evidence': ev}
    if not re.search(KIND_WORDS.get(kind, KIND_WORDS['campaign']), title + ' ' + lead, re.I):
        return {'verdict': 'reject', 'reason': f'not about a {kind}', 'evidence': ev}
    if kind == 'runway' and re.search(KIND_WORDS['campaign'], title, re.I) and not re.search(RUNWAY_STRICT, title, re.I):
        return {'verdict': 'reject', 'reason': 'about a campaign, not the show', 'evidence': ev}
    if kind in ('campaign', 'ambassador') and re.search(NOT_CAMPAIGN, title, re.I) and not re.search(KIND_WORDS['campaign'], title, re.I):
        return {'verdict': 'reject', 'reason': 'about a show or event, not the campaign', 'evidence': ev}
    # a named campaign ("Zara Origins") must be the one the page is about
    ctitle = ''
    if group.get('title') and kind != 'cover':
        words = [w for w in groups.fold(group['title']).split() if w not in groups.fold(group['brand']).split()]
        ctitle = ' ' + ' '.join(words) + ' ' if words else ''
        if ctitle and ctitle not in ' ' + groups.fold(title + ' ' + lead) + ' ':
            return {'verdict': 'candidate', 'reason': f"campaign title '{group['title']}' not on the page", 'evidence': ev}
    named = model_hits(group['models'], title + ' ' + text)
    ev['models_named'] = named
    roundup = bool(ROUNDUP.search(title))
    ev['roundup'] = roundup

    # Season/year mentions in the title, and in the body near the label. A campaign title that is itself a season
    # word ("Gucci Primavera") is blanked first so it is not read as a season.
    blank = lambda t: re.sub(r'(?i)\b' + re.escape(group['title']) + r'\b', ' ' * len(group['title']), t) if group.get('title') else t
    title_s, lead_s = blank(title), blank(lead)
    flead = groups.fold(lead)
    near, snippets = [], {}
    for f, y, pos in seasons.mentions(title_s):
        near.append((f, y))
        snippets.setdefault((f, y), 'headline: ' + title[max(0, pos - 60):pos + 40].strip())
    title_periods = list(near)
    own_name = groups.fold(group['brand'])
    other_pos = [m.start() for b in KNOWN_BRANDS if b != own_name and len(b) >= 4 and b not in own_name
                 for m in re.finditer(r'\b' + re.escape(b) + r'\b', flead)] if KNOWN_BRANDS else []
    for f, y, pos in seasons.mentions(lead_s):
        p = len(groups.fold(lead[:pos]))
        mine = min((abs(p - b) for b in b_brand), default=10 ** 6)
        if other_pos and min(abs(p - o) for o in other_pos) < mine and kind != 'cover':
            continue  # this season belongs to another label named closer to it
        if mine < 250 or kind == 'cover':
            near.append((f, y))
            snippets.setdefault((f, y), 'body: ' + lead[max(0, pos - 100):pos + 60].replace('\n', ' ').strip())
    ev['periods'] = sorted(set(near))
    year, fam = group['year'], group.get('family')
    if kind == 'cover':
        ys = [y for y in seasons.years(title + ' ' + lead[:600])]
        ok = year in ys
        ev['years'] = sorted(set(ys))[:6]
        if not ok:
            return {'verdict': 'candidate' if any(abs(y - year) <= 1 for y in ys) or _pub_ok(article.get('published'), None, year) else 'reject',
                    'reason': f'issue year not confirmed ({", ".join(map(str, sorted(set(ys))[:4])) or "no year"})', 'evidence': ev}
    else:
        exact = [p for p in near if p[1] == year and seasons.matches(p[0], fam)]
        if not exact and fam is None:
            # a credit without a season: an explicit "<year> campaign/show" next to the label also counts
            both = title_s + ' \n ' + lead_s
            for m in re.finditer(r'(?<!\d)' + str(year) + r'(?!\d)', both):
                # text around the year must name the label and the kind, stay inside the headline or the body, and
                # carry no other season or year ("debut in 2020 at the Louis Vuitton FW21 show")
                split = len(title_s) + 3
                lo, hi = (0, len(title_s)) if m.start() < split else (split, len(both))
                sent = both[max(lo, m.start() - 120):min(hi, m.end() + 120)]
                if any(y != year for _, y, _ in seasons.mentions(sent)) or any(y != year for y in seasons.years(sent)):
                    continue
                # the year's own sentence must say what it dates ("the 1980 Giorgio Arman campaign"; not "named an
                # Angel in 1997"), and the label must be next to it or in the headline
                a_ = max(both.rfind(c, lo, m.start()) for c in '.!?|') + 1
                ends = [i for i in (both.find(c, m.end(), hi) for c in '.!?|') if i != -1]
                own = both[max(a_, lo):min(ends) if ends else hi]
                close = own[max(0, m.start() - max(a_, lo) - 60):m.end() - max(a_, lo) + 60]
                if (brand.find(sent) or t_brand) and re.search(KIND_WORDS.get(kind, ''), close, re.I):
                    exact = [(None, year)]
                    ev['period_evidence'] = 'year next to label: ' + sent.replace('\n', ' ').strip()[:220]
                    break
        if exact and title_periods and not any(p[1] == year and seasons.matches(p[0], fam) for p in title_periods):
            # The headline names another period than the body. A publication date only supports one reading; it
            # does not settle the conflict. The page stays a candidate; an independent page has to confirm the period.
            ev['conflict'] = {'headline': sorted(set(title_periods)), 'body': sorted(set(exact)),
                              'publication_date': article.get('published'),
                              'publication_date_fits': {'body': bool(_pub_ok(article.get('published'), fam, year)),
                                                        'headline': any(_pub_ok(article.get('published'), f, y) for f, y in title_periods)}}
            return {'verdict': 'candidate', 'reason': 'headline and body state different seasons (needs independent corroboration)',
                    'evidence': ev}
        if exact and exact[0] in snippets:
            ev['period_evidence'] = snippets[exact[0]]
        if not exact:
            other = sorted({p for p in near if p[1] != year or not seasons.matches(p[0], fam)})
            close = any(abs(p[1] - year) <= 1 for p in other) or _pub_ok(article.get('published'), fam, year)
            why = ('article is about ' + ', '.join(f'{f or ""} {y}'.strip() for f, y in other[:3])) if other else 'no season/year stated'
            return {'verdict': 'candidate' if close else 'reject', 'reason': why, 'evidence': ev}
    if not named:
        # The campaign itself is confirmed (same label, same season and year in the headline) but the page never
        # names the credited model. Flag it as campaign-level evidence: a separate, unapplied tier.
        others = [m for m in KNOWN_MODELS if m not in group['models'] and f' {m} ' in ' ' + groups.fold(title + ' ' + lead[:600]) + ' ']
        ev['other_models_named'] = others[:3]
        ev['campaign_level'] = bool(kind in ('campaign', 'ambassador') and fam and not roundup and not others and t_brand and
                                    len(group.get('aliases') or []) < 2 and  # umbrella labels run several campaigns a season
                                    (not ctitle or ctitle in ' ' + groups.fold(title) + ' ') and
                                    any(f == fam and y == year for f, y, _ in seasons.mentions(title)))
        return {'verdict': 'candidate', 'reason': "none of the credited models is named", 'evidence': ev}
    return {'verdict': 'exact', 'reason': 'label, kind, period and model confirmed', 'evidence': ev}


def image_text(img):
    """Everything attached to an image, file name included: enough to link it to a label or reject it."""
    name = img['url'].split('?')[0].rsplit('/', 1)[-1]
    name = re.sub(r'\.\w+$', '', name)
    return ' '.join([img.get('alt') or '', img.get('caption') or '', re.sub(r'[-_]+', ' ', name)])


def image_caption(img, boiler=frozenset()):
    """The image's own alt text and caption (or credit): the only text that can say who is in it. File names are
    written for search engines and page titles describe the page, so neither attributes a model. Text in `boiler`
    (see page_boilerplate) is the page's, not this image's, and is left out."""
    parts = [strip_slugs(x) for x in (img.get('alt') or '', img.get('caption') or '')]
    return ' '.join(x for x in parts if x and groups.fold(x) not in boiler).strip()


_SLUG = re.compile(r'\S*[-_]\S*[-_]\S*')


_FILE_ALT = re.compile(r'(?i)^[a-z0-9 ]+?[a-z]\d{1,3}$')


def strip_slugs(text):
    """Drop file names that a CMS copies into the alt: slug tokens ("irina-shayk-bebe-2014-fall-ad-campaign0") or a
    whole alt that is a file name with its hyphens turned into spaces ("Rose saint laurent fall 2026 campaign02")."""
    t = re.sub(r'\s+', ' ', _SLUG.sub(' ', text or '')).strip()
    return '' if _FILE_ALT.match(t) else t


def page_boilerplate(article):
    """Alt and caption texts that describe the page rather than one picture: the page title, or a text repeated on
    three or more pictures (galleries that copy the headline into every alt)."""
    seen = {}
    for img in article['images']:
        for x in {(img.get('alt') or '').strip(), (img.get('caption') or '').strip()} - {''}:
            f = groups.fold(x)
            seen[f] = seen.get(f, 0) + 1
    title = groups.fold(article.get('title') or '')
    return frozenset(f for f, n in seen.items() if n >= 3 or (title and (f == title or f in title)))


MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
          'november', 'december']


def _other_date(group, text):
    """Why an image's own text points at another year or issue, or None."""
    years = {int(y) for y in re.findall(r'(?<!\d)((?:19[5-9]|20[0-3])\d)(?!\d)', text)}
    y = group['year']
    if years and y not in years and not (group.get('family') == 'FW' and y + 1 in years and len(years) == 1 and
                                        re.search(rf'{y}\s*[-/]\s*({y + 1}|{str(y + 1)[2:]})', text)):
        return 'names another year'
    if group['kind'] == 'cover' and group.get('title'):
        want = [m for m in MONTHS if m in groups.fold(group['title']).split()]
        have = [m for m in MONTHS if m in groups.fold(text).split()]
        if want and have and not set(want) & set(have):
            return 'names another issue'
    return None


PERSONAL = re.compile(r'\b(headshot|author|portrait|avatar|profile|staff|contributor|editor|unnamed|bio|team)\b')


def _person_name(label, text):
    """A one-word label that only appears as the first name of a person ("Aldo Fallai", "Max Mara" aside)."""
    if len(label.split()) != 1:
        return False
    hits = list(re.finditer(r'(?i)\b' + re.escape(label) + r'\b', text))
    return bool(hits) and all(re.match(r'\s+[A-Z][a-z]{2,}', text[m.end():]) for m in hits)


def pick_images(group, article, verdict, other_brands):
    """Images of the article that belong to this group, with the models each one names.

    Returns (kept, dropped) lists; each item carries 'talent' and 'why'.
    """
    brand = Brand(group['brand'], group.get('aliases', []))
    # A page whose title does not name the label (a model profile, an interview, a season round-up)
    # only mentions the campaign; its pictures are of something else unless they name the label.
    about = bool(brand.find(article['title'] or ''))
    gallery_ok = about and group['kind'] in ('campaign', 'ambassador') and not verdict['evidence'].get('roundup')
    kept, dropped, pending = [], [], []
    boiler = page_boilerplate(article)
    for img in article['images']:
        t = image_text(img)
        ft = groups.fold(t)
        mine = bool(brand.find(t))
        named = model_hits(group['models'], t)
        cap = image_caption(img, boiler)
        named_cap = model_hits(group['models'], cap)
        others = [b for b in other_brands if b.find(t) and not _person_name(b.name, t)]
        per = seasons.mentions(t)
        if others and not mine:
            dropped.append({**img, 'why': 'names another label'})
            continue
        if others and mine and not any(o.name in group.get('aliases', []) for o in others):
            dropped.append({**img, 'why': 'names several labels'})
            continue
        if verdict['evidence'].get('magazine') and not mine:
            dropped.append({**img, 'why': 'magazine page: picture not captioned with this label'})
            continue
        if per and group['kind'] != 'cover' and not any(y == group['year'] and seasons.matches(f, group.get('family')) for f, y, _ in per):
            dropped.append({**img, 'why': 'names another season'})
            continue
        other = _other_date(group, t)
        if not other and re.search(OFF_KIND.get(group['kind'], OFF_KIND['campaign']), t, re.I) and not (
                group['kind'] != 'runway' and re.search(KIND_WORDS['campaign'], t, re.I)):
            other = 'image shows a show, event or street photo, not this ' + group['kind']
        if other:
            dropped.append({**img, 'why': other})
            continue
        linked = mine or named or img.get('lead')
        if not linked:
            # In a single-campaign article (headline names the label, not a round-up) an untitled gallery picture is
            # that campaign. Only campaign articles qualify (cover and runway pages carry unrelated pictures), and
            # only images without their own alt text (an alt that does not name the label describes something else).
            if not (gallery_ok and not (img.get('alt') or '').strip() and not PERSONAL.search(ft)):
                dropped.append({**img, 'why': 'no link to this campaign in the image text'})
                continue
            pending.append(img)
            continue
        if not about and not mine:
            dropped.append({**img, 'why': 'article is not about this campaign and the image does not name the label'})
            continue
        if verdict['evidence'].get('roundup') and not (mine and (named or img.get('lead'))):
            dropped.append({**img, 'why': 'round-up article: image not tied to this campaign'})
            continue
        # A model is attributed only when the image's own caption or alt text names her. A page about one model
        # does not show that every picture on it is of her, and a file name is not a caption.
        if named_cap:
            talent, how = named_cap, 'image caption or alt text names the model'
        else:
            talent, how = [], 'models not identified individually'
        kept.append({**img, 'talent': talent, 'attribution': how, 'attribution_text': cap[:300] if named_cap else ''})
    # a lone untitled picture is usually an author photo or a teaser, not a campaign gallery
    if len(pending) >= 2:
        kept += [{**img, 'talent': [], 'attribution': 'untitled picture in the campaign article; models not identified individually'}
                 for img in pending]
    else:
        dropped += [{**img, 'why': 'single untitled picture'} for img in pending]
    return kept, dropped
