"""Season names and the season/year mentions found in article text.

Families: SS (spring/summer), FW (fall/autumn/winter), RES (resort/cruise), PF (pre-fall), HOL (holiday).
"""
import re

FAMILY_OF_LABEL = {
    'Spring/Summer': 'SS', 'Spring': 'SS', 'Summer': 'SS',
    'Fall/Winter': 'FW', 'Fall': 'FW', 'Autumn': 'FW', 'Winter': 'FW', 'Autumn/Winter': 'FW',
    'Holiday': 'HOL', 'Resort': 'RES', 'Cruise': 'RES', 'Pre-Fall': 'PF',
}
# Families that press articles commonly use interchangeably for one campaign.
COMPATIBLE = {('HOL', 'FW'), ('FW', 'HOL'), ('PF', 'FW'), ('FW', 'PF'), ('RES', 'SS'), ('SS', 'RES')}

WORD = {
    'spring': 'SS', 'summer': 'SS', 'ss': 'SS', 's/s': 'SS', 'pe': 'SS',
    'fall': 'FW', 'autumn': 'FW', 'winter': 'FW', 'fw': 'FW', 'f/w': 'FW', 'aw': 'FW', 'a/w': 'FW', 'ah': 'FW',
    'holiday': 'HOL', 'holidays': 'HOL', 'christmas': 'HOL', 'resort': 'RES', 'cruise': 'RES',
    'pre-fall': 'PF', 'pre fall': 'PF', 'prefall': 'PF',
}

_S = r'(pre[- ]?fall|spring|summer|fall|autumn|winter|holidays?|christmas|resort|cruise)'
_PATTERNS = [
    # Fall/Winter 2015, Autumn-Winter 2015/16, Spring Summer '16, Fall 2015
    (re.compile(r'(?i)\b' + _S + r'(?:\s*(?:/|-|–|&|and)\s*' + _S + r'|\s+' + _S + r')?[\s,]+(?:of\s+)?((?:19|20)\d\d|[\'’]\d\d)\b'), 'word'),
    # 2015 Fall/Winter, 2016 spring
    (re.compile(r'(?i)\b((?:19|20)\d\d)\s+' + _S + r'\b'), 'year-first'),
    # FW15, F/W 2015, AW 15, SS16, S/S'16
    (re.compile(r'\b(SS|S/S|FW|F/W|AW|A/W|PF|PE|AH)\s?[\'’]?((?:19|20)\d\d|\d\d)\b'), 'abbr'),
]


def family(label):
    return FAMILY_OF_LABEL.get(label) if label else None


def _year(tok):
    tok = tok.strip("'’")
    y = int(tok)
    if y < 100:
        y += 2000 if y < 40 else 1900
    return y


def mentions(text):
    """All season/year mentions in text: list of (family, year, position)."""
    out, taken = [], []
    for rx, kind in _PATTERNS:
        for m in rx.finditer(text):
            if any(m.start() < e and m.end() > s for s, e in taken):
                continue
            try:
                if kind == 'word':
                    fam = WORD[m.group(1).lower().replace(' ', '-') if 'pre' in m.group(1).lower() else m.group(1).lower()]
                    y = _year(m.group(4))
                elif kind == 'year-first':
                    y = int(m.group(1))
                    w = m.group(2).lower()
                    fam = WORD['pre-fall' if 'pre' in w else w]
                else:
                    fam = WORD[m.group(1).lower()]
                    y = _year(m.group(2))
            except (KeyError, ValueError):
                continue
            if 1950 <= y <= 2035:
                out.append((fam, y, m.start()))
                taken.append((m.start(), m.end()))
    return sorted(out, key=lambda t: t[2])


def years(text):
    return [int(y) for y in re.findall(r'(?<!\d)((?:19[5-9]|20[0-3])\d)(?!\d)', text)]


def matches(fam_a, fam_b):
    if fam_a is None or fam_b is None:
        return True
    return fam_a == fam_b or (fam_a, fam_b) in COMPATIBLE


def query_words(fam):
    """Season words for a search query (the most common press spelling first)."""
    return {'SS': ['Spring', 'Spring/Summer', 'SS'], 'FW': ['Fall', 'Fall/Winter', 'Autumn/Winter'],
            'HOL': ['Holiday'], 'RES': ['Resort', 'Cruise'], 'PF': ['Pre-Fall']}.get(fam, [''])
