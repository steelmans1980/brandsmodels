// Data logic shared by the build (Node), the browser and the tests. Plain ES module, no dependencies.
//
// Terms used throughout:
//   credit      one record of data/campaigns.json: a brand or magazine, a kind of work, a year (or none), and the
//               models credited for it. Every credit has a persistent `id`.
//   appearance  one model's part in one credit.
//   identified appearance   the campaign, show or issue is pinned down: a season, a named campaign or issue, a source
//               that states the year, or a photo verified for this campaign that names her.
//   dated relationship      a year only: she worked with the label that year, but which campaign or show is not known.
//   undated relationship    the source names no year.

export const SITE = 'The Model Archive';
export const ORIGIN = 'https://brandsmodels.com';
export const KINDS = ['campaign', 'runway', 'cover', 'ambassador'];
export const KIND_LABEL = { campaign: 'Campaign', runway: 'Runway show', cover: 'Magazine cover', ambassador: 'Ambassador' };
export const KIND_PLURAL = { campaign: 'Campaigns', runway: 'Runway', cover: 'Magazine covers', ambassador: 'Ambassadorships' };
export const TYPE_LABEL = { designer: 'Fashion house / designer', brand: 'Brand / retailer', magazine: 'Magazine' };

const SEASON_ORDER = {
  'Full year': 0, Resort: 1, Cruise: 1, Spring: 2, 'Spring/Summer': 2, Summer: 3,
  'Pre-Fall': 4, Fall: 5, 'Fall/Winter': 5, Winter: 6, Holiday: 7
};
// Season families, so "Fall" and "Fall/Winter" of one year are the same appearance.
const FAMILY = { Spring: 'SS', 'Spring/Summer': 'SS', Summer: 'SS', Fall: 'FW', 'Fall/Winter': 'FW', Winter: 'FW',
  Resort: 'RES', Cruise: 'RES', 'Pre-Fall': 'PF', Holiday: 'HOL' };

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').replace(/ß/g, 'ss').replace(/[łŁ]/g, 'l')
  .replace(/[^a-z0-9]+/g, ' ').trim();
export const slug = s => norm(s).replace(/ /g, '-');
export const seasonRank = s => SEASON_ORDER[s] ?? 0;
export const seasonOf = c => (c.season && c.season !== 'Full year' ? c.season : '');
export const family = s => FAMILY[s] || '';
export const dated = c => c.year != null;
export const kindOf = c => c.kind || 'campaign';
export const label = c => dated(c) ? (seasonOf(c) ? seasonOf(c) + ' ' : '') + c.year : 'Year not recorded';
export const plural = (n, w, ws) => `${Number(n).toLocaleString('en')} ${n === 1 ? w : (ws || w + 's')}`;
export const range = (a, b) => a == null ? 'year not recorded' : a === b ? String(a) : `${a}–${b}`;

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\bissue\b|\bno\.? ?\d/i;

export const byNewest = (a, b) => (dated(b) - dated(a)) || ((b.year || 0) - (a.year || 0)) ||
  seasonRank(b.season) - seasonRank(a.season) || a.brand.localeCompare(b.brand) || a.id.localeCompare(b.id);

/** Photos of a credit that show a particular model: only those attributed to her (caption, alt or human review). */
export const photosOf = (c, person) => person ? c.images.filter(i => i.talent.includes(person)) : c.images;
/** The credit's other photos on her page: attributed to other people, or models not identified individually. */
export const otherPhotos = (c, person) => c.images.filter(i => !i.talent.includes(person));

/**
 * How specifically a credit identifies one model's appearance: 'identified' | 'dated' | 'undated'.
 * A year alone never makes an appearance identified.
 */
export function appearanceClass(c, person) {
  if (!dated(c)) return 'undated';
  const kind = kindOf(c);
  if (kind === 'cover' && MONTH.test(c.title || '')) return 'identified';
  if (kind !== 'cover' && (seasonOf(c) || c.title)) return 'identified';
  if (c.yearFrom === 'source states the year') return 'identified';
  if (person && c.images.some(i => i.match === 'exact' && i.talent.includes(person))) return 'identified';
  return 'dated';
}
export const CLASS_LABEL = { identified: 'Identified appearance', dated: 'Dated relationship', undated: 'Undated relationship' };
export const CLASS_HELP = {
  identified: 'The campaign, show or issue is pinned down by its season, title or a verified source.',
  dated: 'The source gives a year only: she worked with this label that year, but which campaign or show is not recorded.',
  undated: 'The source names a working relationship but no year.'
};

/**
 * The key that makes two credits the same appearance for one model. Identified appearances: label, kind, year,
 * season family and title. Dated relationships: label, kind and year (several year-only records of one label are one).
 */
export function appearanceKey(c, person, cls = appearanceClass(c, person)) {
  const base = [slug(person), slug(c.brand), kindOf(c), c.year ?? ''];
  if (cls === 'identified') return [...base, family(c.season), norm(c.title || '')].join('|');
  return base.join('|');
}

// ---------- overlay: curated additions and corrections that survive quarterly imports ----------

/**
 * Apply data/overlay.json entries in order. Entry ops:
 *   {op:'add', record:{id, brand, ...}}          a new credit (its id must be new)
 *   {op:'patch', id, set:{...}, unset:[...]}     change fields of an existing credit
 *   {op:'remove', id}                            hide a credit
 *   {op:'rename-model', from, to}                a model's name changed; old pages redirect
 * Throws on an unknown id so a refresh that lost ids is caught at build time.
 */
export function applyOverlay(raw, overlay) {
  const campaigns = raw.campaigns.map(c => ({ ...c }));
  const at = new Map(campaigns.map((c, i) => [c.id, i]));
  const removed = new Set();
  const renames = [];
  for (const [n, e] of (overlay?.entries || []).entries()) {
    const where = `overlay entry ${n + 1} (${e.op}${e.id ? ' ' + e.id : ''})`;
    if (e.op === 'add') {
      if (!e.record?.id || at.has(e.record.id)) throw new Error(`${where}: an added record needs a new unique id`);
      at.set(e.record.id, campaigns.length);
      campaigns.push({ ...e.record, curated: true });
    } else if (e.op === 'patch' || e.op === 'remove') {
      if (!at.has(e.id)) throw new Error(`${where}: no credit with this id in the data`);
      const c = campaigns[at.get(e.id)];
      if (e.op === 'remove') { removed.add(e.id); continue; }
      Object.assign(c, e.set || {});
      for (const k of e.unset || []) delete c[k];
      c.curated = true;
    } else if (e.op === 'rename-model') {
      renames.push({ from: e.from, to: e.to });
      for (const c of campaigns) {
        c.talent = (c.talent || []).map(t => t === e.from ? e.to : t);
        c.images = (c.images || []).map(i => ({ ...i, talent: (i.talent || []).map(t => t === e.from ? e.to : t) }));
      }
    } else throw new Error(`${where}: unknown op`);
  }
  return { ...raw, campaigns: campaigns.filter(c => !removed.has(c.id)), renames };
}

// ---------- index ----------

export function buildIndex(raw) {
  const campaigns = raw.campaigns.map(c => ({
    ...c, year: c.year ?? null, kind: kindOf(c), talent: c.talent || [], sources: c.sources || [],
    images: (c.images || []).map(i => ({ ...i, talent: i.talent || [] }))
  }));
  campaigns.sort(byNewest);
  const byId = new Map(campaigns.map(c => [c.id, c]));
  const brands = new Map();
  for (const [name, info] of Object.entries(raw.brands || {})) brands.set(slug(name), { name, slug: slug(name), ...info, campaigns: [] });
  const people = raw.models || {};
  const models = new Map();
  for (const c of campaigns) {
    const bs = slug(c.brand);
    if (!brands.has(bs)) brands.set(bs, { name: c.brand, slug: bs, campaigns: [] });
    brands.get(bs).campaigns.push(c);
    for (const t of c.talent) {
      const ms = slug(t);
      if (!models.has(ms)) models.set(ms, { name: t, slug: ms, ...(people[t] || {}), campaigns: [] });
      models.get(ms).campaigns.push(c);
    }
  }
  for (const [k, b] of brands) if (!b.campaigns.length) brands.delete(k);
  for (const x of [...brands.values(), ...models.values()]) {
    const ys = x.campaigns.filter(dated).map(c => c.year);
    x.first = ys.length ? Math.min(...ys) : null;
    x.last = ys.length ? Math.max(...ys) : null;
  }
  for (const b of brands.values()) b.isMagazine = b.type === 'magazine';
  return { updated: raw.updated, campaigns, byId, brands, models, renames: raw.renames || [] };
}

export const brandPath = b => `/${b.isMagazine ? 'magazine' : 'brand'}/${b.slug}/`;
export const modelPath = m => `/model/${typeof m === 'string' ? slug(m) : m.slug}/`;

/** One model's appearances, each with its class, deduplicated by appearance key (records and photos merged). */
export function appearancesOf(m) {
  const out = new Map();
  for (const c of m.campaigns) {
    const cls = appearanceClass(c, m.name);
    const key = appearanceKey(c, m.name, cls);
    if (!out.has(key)) out.set(key, { key, cls, kind: c.kind, brand: c.brand, year: c.year, credits: [] });
    out.get(key).credits.push(c);
  }
  // a dated relationship adds nothing when an identified appearance of the same label, kind and year exists
  const identifiedLKY = new Set([...out.values()].filter(a => a.cls === 'identified').map(a => [slug(a.brand), a.kind, a.year].join('|')));
  for (const [k, a] of out) if (a.cls === 'dated' && identifiedLKY.has([slug(a.brand), a.kind, a.year].join('|'))) a.coveredBy = true;
  return [...out.values()];
}

/** The earliest dated appearance of a model in this archive (not necessarily the start of her career). */
export function earliest(m) {
  const ds = m.campaigns.filter(dated);
  if (!ds.length) return null;
  const y = Math.min(...ds.map(c => c.year));
  const cs = ds.filter(c => c.year === y).sort((a, b) => seasonRank(a.season) - seasonRank(b.season));
  return { year: y, credit: cs[0], count: cs.length };
}

// ---------- rankings: archive visibility, not popularity ----------

/**
 * Distinct documented appearances per model and year, by kind. Undated relationships are excluded; a dated
 * relationship counts only when no identified appearance covers the same label, kind and year. Several records
 * or photos of one appearance count once.
 * Returns {years: {Y: {modelSlug: [campaign, runway, cover, ambassador]}}, names: {slug: name}}.
 */
export function rankingTable(db) {
  const years = {};
  const names = {};
  for (const m of db.models.values()) {
    for (const a of appearancesOf(m)) {
      if (a.cls === 'undated' || a.coveredBy) continue;
      const y = (years[a.year] ||= {});
      const row = (y[m.slug] ||= [0, 0, 0, 0]);
      row[KINDS.indexOf(a.kind)] += 1;
      names[m.slug] = m.name;
    }
  }
  return { years, names, kinds: KINDS };
}

/** Rank models over a set of years from a ranking table. Ties are broken by name. */
export function rankModels(table, yearsWanted, { kind = null, limit = 50 } = {}) {
  const tot = new Map();
  for (const y of yearsWanted) {
    for (const [s, row] of Object.entries(table.years[y] || {})) {
      const t = tot.get(s) || [0, 0, 0, 0];
      row.forEach((n, i) => { t[i] += n; });
      tot.set(s, t);
    }
  }
  const ki = kind ? table.kinds.indexOf(kind) : -1;
  return [...tot].map(([s, row]) => ({ slug: s, name: table.names[s], byKind: row, total: ki >= 0 ? row[ki] : row.reduce((a, b) => a + b, 0) }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Periods offered by the ranking selector, newest first. */
export function periods(table, now = new Date().getFullYear()) {
  const ys = Object.keys(table.years).map(Number).sort((a, b) => b - a);
  const last = ys[0] ?? now;
  const out = [{ id: 'all', label: 'All years', years: ys },
    { id: `last5`, label: `${last - 4}–${last}`, years: ys.filter(y => y > last - 5) }];
  const decades = [...new Set(ys.map(y => Math.floor(y / 10) * 10))];
  for (const d of decades) out.push({ id: `${d}s`, label: `${d}s`, years: ys.filter(y => y >= d && y < d + 10) });
  for (const y of ys) out.push({ id: String(y), label: String(y), years: [y] });
  return out;
}

// ---------- combined pages: only with enough verified content ----------

/** Model × label pages: at least 3 dated appearances with the label, at least one identified. */
export function comboPages(db) {
  const out = [];
  for (const m of db.models.values()) {
    const byBrand = new Map();
    for (const a of appearancesOf(m)) {
      if (a.cls === 'undated' || a.coveredBy) continue;
      const k = slug(a.brand);
      if (!byBrand.has(k)) byBrand.set(k, []);
      byBrand.get(k).push(a);
    }
    for (const [bs, as] of byBrand) {
      if (as.length >= 3 && as.some(a => a.cls === 'identified')) out.push({ model: m, brand: db.brands.get(bs), appearances: as });
    }
  }
  return out;
}
/** A model's covers page: at least 3 dated cover appearances. */
export function coverPages(db) {
  const out = [];
  for (const m of db.models.values()) {
    const as = appearancesOf(m).filter(a => a.kind === 'cover' && a.cls !== 'undated' && !a.coveredBy);
    if (as.length >= 3) out.push({ model: m, appearances: as });
  }
  return out;
}

/** Whether a page has enough substance to be indexed and listed in the sitemap. */
export function modelIndexable(m) {
  return m.campaigns.some(dated) || m.campaigns.some(c => photosOf(c, m.name).length);
}
export function brandIndexable(b) {
  return b.campaigns.length >= 2 || b.campaigns.some(dated);
}

/** A saved appearance's id: credit id and model slug. Survives data refreshes because credit ids are persistent. */
export const savedId = (c, person) => `${c.id}:${slug(person)}`;

/** For every label, the models with the most distinct counted appearances with it: {brandSlug: [{slug,name,total}]}. */
export function topByBrand(db, limit = 12) {
  const per = new Map();
  for (const m of db.models.values()) {
    const n = new Map();
    for (const a of appearancesOf(m)) {
      if (a.cls === 'undated' || a.coveredBy) continue;
      const b = slug(a.brand);
      n.set(b, (n.get(b) || 0) + 1);
    }
    for (const [b, total] of n) {
      if (!per.has(b)) per.set(b, []);
      per.get(b).push({ slug: m.slug, name: m.name, total });
    }
  }
  const out = {};
  for (const [b, rows] of per) out[b] = rows.sort((x, y) => y.total - x.total || x.name.localeCompare(y.name)).slice(0, limit);
  return out;
}
