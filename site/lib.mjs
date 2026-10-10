// Car data logic shared by the build (Node), the browser and the tests. Plain ES module, no dependencies.
//
// Terms (see data/SCHEMA.md):
//   family      a model family, e.g. Audi Q7. A family has one or more lines (Nissan sells the X-Trail and the Rogue).
//   generation  one generation of a family, e.g. the Q7 Typ 4L. Generations are ordered per line.
//   revision    a facelift, update or rename within a generation.
//   fact        a value with its source key (`src`) and the quote that states it.
// Specifications are never merged across markets: every dimension, capacity and powertrain record keeps its market.

export const SITE = 'The Car Archive';

export const MARKET_LABEL = {
  global: 'All markets', EU: 'Europe', UK: 'United Kingdom', US: 'United States', CA: 'Canada', NA: 'North America',
  MX: 'Mexico', BR: 'Brazil', CN: 'China', JP: 'Japan', KR: 'South Korea', IN: 'India', AU: 'Australia', NZ: 'New Zealand',
  RU: 'Russia', ZA: 'South Africa', ME: 'Middle East', ASEAN: 'Southeast Asia', TW: 'Taiwan', unstated: 'market not stated'
};
export const FUELS = ['petrol', 'diesel', 'mild hybrid', 'hybrid', 'plug-in hybrid', 'electric', 'hydrogen', 'LPG', 'flex-fuel'];
export const FUEL_LABEL = { petrol: 'Petrol', diesel: 'Diesel', 'mild hybrid': 'Mild hybrid', hybrid: 'Hybrid', 'plug-in hybrid': 'Plug-in hybrid',
  electric: 'Electric', hydrogen: 'Hydrogen fuel cell', LPG: 'LPG', 'flex-fuel': 'Flex-fuel' };
export const DRIVE_LABEL = { FWD: 'Front-wheel drive', RWD: 'Rear-wheel drive', AWD: 'All-wheel drive', '4WD': 'Four-wheel drive (low range)' };
export const BODY_GROUPS = ['SUV', 'Long wheelbase', 'Coupé SUV', '3-door', 'Other'];
export const REV_LABEL = { facelift: 'Facelift', update: 'Update', rename: 'Renamed', special: 'Special version' };
export const TOPIC_LABEL = { design: 'Design', dimensions: 'Dimensions', weight: 'Weight', powertrain: 'Powertrain', drivetrain: 'Drivetrain',
  chassis: 'Chassis', interior: 'Interior', technology: 'Technology', 'safety-equipment': 'Safety equipment', other: 'Other' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
export const slug = s => norm(s).replace(/ /g, '-');
/** "a, b and c" */
export const andList = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
/** Fuel name inside a sentence: lower case except acronyms (LPG). */
export const fuelWord = f => /^[A-Z]+$/.test(FUEL_LABEL[f]) ? FUEL_LABEL[f] : FUEL_LABEL[f].toLowerCase();
export const plural = (n, w, ws) => `${Number(n).toLocaleString('en')} ${n === 1 ? w : (ws || w + 's')}`;
export const num = (n, d = 0) => Number(n).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------- dates ----------
export const yearOf = f => f?.value ? Number(String(f.value).slice(0, 4)) : null;
export function fmtDate(v) {
  if (!v) return '';
  const [y, m, d] = String(v).split('-').map(Number);
  if (d) return `${d} ${MONTHS[m - 1]} ${y}`;
  if (m) return `${MONTHS[m - 1]} ${y}`;
  return String(y);
}
export const startYear = g => yearOf(g.dates?.productionStart) ?? yearOf(g.dates?.salesStart?.[0]) ?? yearOf(g.dates?.revealed);
export const endYear = g => g.ongoing ? null : yearOf(g.dates?.productionEnd);
/** "2005–2015", "2018–present", or a statement that the dates are not documented. Production years, not model years. */
export function period(g) {
  const s = yearOf(g.dates?.productionStart), e = endYear(g);
  if (s == null) return g.ongoing ? 'In production' : 'Production dates not documented';
  if (g.ongoing) return `${s}–present`;
  if (e == null) return `${s}–(end not documented)`;
  return s === e ? String(s) : `${s}–${e}`;
}

// ---------- names ----------
export const codesOf = g => (g.codes || []).map(c => c.value);
export const shortName = g => codesOf(g)[0] || g.name;
/**
 * The name a generation was sold under: its model line(s) when a family has several (Nissan X-Trail / Rogue), else its
 * worldwide name when documented (Mercedes-Benz M-Class / GLE), else the family's model name.
 */
export function carName(fam, g) {
  const make = fam.maker?.name || '';
  const model = make && fam.name.startsWith(make + ' ') ? fam.name.slice(make.length + 1) : fam.name;
  let name = model;
  if ((fam.lines || []).length > 1) name = g.lines.map(l => fam.lines.find(x => x.id === l)?.name || l).join(' / ');
  else {
    const global = [...new Set((g.names || []).filter(n => (n.markets || []).includes('global')).map(n => n.value))];
    if (global.length) name = global.join(' / ');
  }
  return make ? `${make} ${name}` : name;
}
/** "Audi Q7 (4L)" or "Volvo XC90, first generation" when no code is documented. */
export const genTitle = (fam, g) => codesOf(g).length ? `${carName(fam, g)} (${codesOf(g)[0]})` : `${carName(fam, g)}, ${g.name.toLowerCase()}`;
export const marketList = ms => (ms || []).map(m => MARKET_LABEL[m] || m).join(', ');

// ---------- classification for filters ----------
export function bodyGroup(value) {
  const v = String(value).toLowerCase();
  if (/coup/.test(v)) return 'Coupé SUV';
  if (/3-door|three-door|3 door/.test(v)) return '3-door';
  if (/long|lwb|allspace|extended/.test(v)) return 'Long wheelbase';
  if (/suv|crossover|5-door|five-door|wagon|estate/.test(v)) return 'SUV';
  return 'Other';
}
export const bodyGroupsOf = g => [...new Set((g.bodyStyles || []).map(b => bodyGroup(b.value)))];
export const fuelsOf = g => FUELS.filter(f => (g.powertrains || []).some(p => p.fuel === f));
export const seatsOf = g => [...new Set(g.seating?.options || [])].sort((a, b) => a - b);
export const drivesOf = g => [...new Set([...(g.drivetrains || []).map(d => d.value), ...(g.powertrains || []).map(p => p.drivetrain).filter(Boolean)])];

// ---------- units: always show the source unit first, conversions in brackets ----------
export const MM_PER_IN = 25.4, KW_PER_PS = 0.73549875, KW_PER_HP = 0.745699872, NM_PER_LBFT = 1.3558179483, L_PER_CUFT = 28.316846592;
export const toMm = (v, unit) => unit === 'in' ? v * MM_PER_IN : v;
export const fmtLength = (v, unit) => unit === 'in' ? `${num(v, 1)} in (${num(v * MM_PER_IN)} mm)` : `${num(v)} mm (${num(v / MM_PER_IN, 1)} in)`;
export function fmtPower(p) {
  if (!p) return '';
  if (p.unit === 'kW') return `${num(p.value)} kW (${num(p.value / KW_PER_PS)} PS)`;
  if (p.unit === 'PS') return `${num(p.value)} PS (${num(p.value * KW_PER_PS)} kW)`;
  return `${num(p.value)} hp (${num(p.value * KW_PER_HP)} kW)`;
}
export const powerKw = p => !p ? null : p.unit === 'kW' ? p.value : p.unit === 'PS' ? p.value * KW_PER_PS : p.value * KW_PER_HP;
export const fmtTorque = t => !t ? '' : t.unit === 'Nm' ? `${num(t.value)} Nm (${num(t.value / NM_PER_LBFT)} lb-ft)` : `${num(t.value)} lb-ft (${num(t.value * NM_PER_LBFT)} Nm)`;
export const fmtCargo = k => k.unit === 'L' ? `${num(k.value)} L` : `${num(k.value, 1)} cu ft (${num(k.value * L_PER_CUFT)} L converted)`;
export const STANDARD_HELP = {
  VDA: 'VDA (ISO 3832) fills the space with 1-litre blocks; it usually gives smaller figures than SAE.',
  'ISO 3832': 'ISO 3832 (VDA) fills the space with 1-litre blocks; it usually gives smaller figures than SAE.',
  SAE: 'SAE J1100 is the North American method; its figures are usually larger than VDA figures for the same car.',
  DIN: 'Measured to a DIN method as stated by the manufacturer; European methods usually give smaller figures than SAE.',
  'not stated': 'The source does not say how the volume was measured.'
};

// ---------- overlay: reviewed corrections applied on top of the family files, kept across imports ----------
function findItem(gen, itemId) {
  const lists = ['bodyStyles', 'dimensions', 'cargo', 'powertrains', 'changes', 'revisions'];
  for (const l of lists) {
    const arr = gen[l] || [];
    const i = arr.findIndex(x => x.id === itemId);
    if (i >= 0) return { list: arr, index: i, item: arr[i] };
  }
  for (const r of gen.revisions || []) {
    const i = (r.changes || []).findIndex(x => x.id === itemId);
    if (i >= 0) return { list: r.changes, index: i, item: r.changes[i] };
  }
  return null;
}
function setPath(obj, field, value) {
  const keys = String(field).split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {});
  o[keys.at(-1)] = value;
}
/** Applies data/overlay.json entries in order. Throws on a target that does not exist, so a broken correction stops the build. */
export function applyOverlay(families, overlay) {
  const fams = structuredClone(families);
  const byFam = new Map(fams.map(f => [f.id, f]));
  const byGen = new Map();
  for (const f of fams) for (const g of f.generations) byGen.set(g.id, { f, g });
  (overlay?.entries || []).forEach((e, n) => {
    const [base, itemId] = String(e.target || '').split('#');
    const fam = byFam.get(base), gen = byGen.get(base);
    const f = fam || gen?.f;
    if (!f) throw new Error(`overlay entry ${n + 1}: unknown target ${e.target}`);
    const key = `ov${n + 1}`;
    if (e.source) f.sources[key] = { ...e.source, overlay: true };
    const fix = v => JSON.parse(JSON.stringify(v ?? null).replaceAll('"$source"', JSON.stringify(key)));
    const host = itemId ? (gen && findItem(gen.g, itemId)) : { item: fam || gen.g };
    if (!host) throw new Error(`overlay entry ${n + 1}: unknown item ${e.target}`);
    if (e.op === 'set') setPath(host.item, e.field, fix(e.value));
    else if (e.op === 'add') {
      const list = (host.item[e.list] ??= []);
      if (list.some(x => x.id && x.id === e.item?.id)) throw new Error(`overlay entry ${n + 1}: ${e.item.id} already exists in ${e.list}`);
      list.push(fix(e.item));
    } else if (e.op === 'remove') {
      if (!itemId) throw new Error(`overlay entry ${n + 1}: remove needs an item id`);
      host.list.splice(host.index, 1);
    } else throw new Error(`overlay entry ${n + 1}: unknown op ${e.op}`);
  });
  return fams;
}

// ---------- index ----------
export function buildIndex(manufacturers, families, { updated, currentYear } = {}) {
  const makers = new Map(manufacturers.map(m => [m.id, { ...m, families: [] }]));
  const fams = new Map(), gens = new Map();
  for (const f of [...families].sort((a, b) => a.name.localeCompare(b.name))) {
    const maker = makers.get(f.manufacturer);
    if (!maker) throw new Error(`${f.id}: unknown manufacturer ${f.manufacturer}`);
    const fam = { ...f, maker, path: `/cars/${maker.slug}/${f.slug}/` };
    fam.generations = [...f.generations].sort((a, b) => (startYear(a) ?? 9999) - (startYear(b) ?? 9999) || a.ordinal - b.ordinal)
      .map(g => ({ ...g, family: fam, path: `${fam.path}${g.slug}/` }));
    for (const g of fam.generations) gens.set(g.id, g);
    maker.families.push(fam);
    fams.set(f.id, fam);
  }
  const db = { makers, families: fams, gens, updated, currentYear: currentYear ?? new Date().getUTCFullYear() };
  for (const fam of fams.values()) fam.pairs = adjacentPairs(fam);
  return db;
}
export const makerPath = m => `/manufacturers/${m.slug}/`;
export const comparePath = (a, b) => `${a.family.path}compare/${a.slug}-vs-${b.slug}/`;
export const revisionAnchor = r => `rev-${r.slug}`;

/** Generations in order within each line, and the predecessor → successor pairs (shared generations counted once). */
export function lineGens(fam, lineId) {
  return fam.generations.filter(g => g.lines.includes(lineId)).sort((a, b) => a.ordinal - b.ordinal || (startYear(a) ?? 0) - (startYear(b) ?? 0));
}
export function adjacentPairs(fam) {
  const seen = new Set(), pairs = [];
  for (const line of fam.lines) {
    const gs = lineGens(fam, line.id);
    for (let i = 1; i < gs.length; i++) {
      const k = gs[i - 1].id + '>' + gs[i].id;
      if (!seen.has(k)) { seen.add(k); pairs.push({ prev: gs[i - 1], next: gs[i], line }); }
    }
  }
  return pairs;
}
export const predecessors = g => g.family.pairs.filter(p => p.next === g).map(p => p.prev);
export const successors = g => g.family.pairs.filter(p => p.prev === g).map(p => p.next);

// ---------- comparison: like-for-like only ----------
const VARIANT = /coup|long|lwb|allspace|extended|3-door|three-door|short/i;
const isBase = d => !VARIANT.test(d.version || '');
/**
 * Dimension records that can fairly be compared across generations: the same market (or all "not stated") and the
 * standard body for every generation, with at least one measurement present in all of them. Returns null otherwise —
 * pages then say so instead of comparing figures from different markets or bodies.
 */
export function commonDims(gens) {
  const markets = new Set(gens.flatMap(g => (g.dimensions || []).filter(isBase).map(d => d.market)));
  let best = null;
  for (const m of markets) {
    const picks = gens.map(g => {
      const rs = (g.dimensions || []).filter(d => d.market === m && isBase(d));
      // the launch version of each generation: prefer records not labelled as facelift/update
      return rs.sort((x, y) => Number(/facelift|update|lci|late|revis/i.test(x.version || '')) - Number(/facelift|update|lci|late|revis/i.test(y.version || '')))[0];
    });
    if (picks.some(p => !p)) continue;
    const shared = ['length', 'width', 'height', 'wheelbase'].filter(k => picks.every(p => p[k] != null));
    if (!shared.length) continue;
    const score = shared.length * 10 + (m !== 'unstated' ? 5 : 0) + (m === 'EU' || m === 'US' ? 1 : 0);
    if (!best || score > best.score) best = { market: m, records: picks, shared, score };
  }
  if (!best) return null;
  best.values = best.shared.map(k => ({ key: k, mm: best.records.map(r => toMm(r[k], r.unit)) }));
  return best;
}
export const comparableDims = (a, b) => commonDims([a, b]);
/** Differences derived from the sourced lists (body styles, seating, drivetrains, fuels). Each states what it compares. */
export function derivedChanges(a, b) {
  const out = [];
  const add = (topic, text) => out.push({ topic, text });
  const fa = fuelsOf(a), fb = fuelsOf(b);
  const newF = fb.filter(f => !fa.includes(f)), goneF = fa.filter(f => !fb.includes(f));
  if (a.powertrains?.length && b.powertrains?.length) {
    if (newF.length) add('powertrain', `Powertrain types documented for the ${shortName(b)} but not the ${shortName(a)}: ${andList(newF.map(fuelWord))}.`);
    if (goneF.length) add('powertrain', `Documented for the ${shortName(a)} but not the ${shortName(b)}: ${andList(goneF.map(fuelWord))}.`);
  }
  const sa = seatsOf(a), sb = seatsOf(b);
  if (sa.length && sb.length && sa.join() !== sb.join()) add('interior', `Seating configurations: ${sa.join(' or ')} seats (${shortName(a)}) → ${sb.join(' or ')} seats (${shortName(b)}).`);
  const ba = bodyGroupsOf(a), bb = bodyGroupsOf(b);
  const newB = bb.filter(x => !ba.includes(x));
  if (ba.length && newB.length) add('design', `Body styles documented for the ${shortName(b)} only: ${newB.join(', ')}.`);
  return out;
}
/** Fields shown side by side on the comparison page, in order. */
export const COMPARE_FIELDS = ['production', 'revealed', 'modelYears', 'codes', 'platform', 'bodyStyles', 'seating', 'drivetrains', 'fuels', 'dimensions', 'cargo', 'power'];

/** The documented version with the highest output, labelled with its market — never a universal figure. */
export function topPower(g) {
  return [...(g.powertrains || [])].filter(p => p.power).sort((x, y) => powerKw(y.power) - powerKw(x.power))[0] || null;
}

// ---------- years ----------
/** Calendar-year events (reveals, production starts and ends, revisions), keyed by year. Model years are separate. */
export function yearEvents(db) {
  const ev = new Map();
  const add = (y, e) => { if (y == null) return; if (!ev.has(y)) ev.set(y, []); ev.get(y).push(e); };
  for (const g of db.gens.values()) {
    const d = g.dates || {};
    add(yearOf(d.revealed), { type: 'revealed', g, fact: d.revealed });
    add(yearOf(d.productionStart), { type: 'production-start', g, fact: d.productionStart });
    if (!g.ongoing) add(yearOf(d.productionEnd), { type: 'production-end', g, fact: d.productionEnd });
    for (const r of g.revisions || []) {
      const f = r.dates?.revealed || r.dates?.productionStart;
      add(yearOf(f), { type: 'revision', g, r, fact: f });
    }
  }
  return ev;
}
export function inProduction(db, y) {
  return [...db.gens.values()].filter(g => {
    const s = yearOf(g.dates?.productionStart); if (s == null || s > y) return false;
    const e = g.ongoing ? db.currentYear : yearOf(g.dates?.productionEnd);
    return e != null && e >= y;
  });
}
/** Generations sold as model year y in a market that uses model years. */
export function modelYearGens(db, y) {
  const out = [];
  for (const g of db.gens.values()) for (const m of g.dates?.modelYears || []) {
    // an open-ended range runs to the present only while the generation is in production
    const to = m.to ?? (g.ongoing ? db.currentYear + 1 : (endYear(g) ?? m.from) + 1);
    if (m.from <= y && to >= y && (m.to != null || g.ongoing || endYear(g) != null)) out.push({ g, m });
  }
  return out;
}

/** "2016–2021", "2020–present", or "2007–(end not documented)" for a generation that has ended. */
export const myRange = (g, m) => `${m.from}–${m.to ?? (g.ongoing ? 'present' : '(end not documented)')}`;

// ---------- facts ----------
export function countFacts(o) {
  if (Array.isArray(o)) return o.reduce((a, x) => a + countFacts(x), 0);
  if (!o || typeof o !== 'object') return 0;
  let n = o.src ? 1 : 0;
  for (const [k, v] of Object.entries(o)) if (k !== 'family' && k !== 'maker' && v && typeof v === 'object') n += countFacts(v);
  return n;
}

// ---------- browser store keys ----------
export const garageId = (type, id) => `${type}:${id}`;
