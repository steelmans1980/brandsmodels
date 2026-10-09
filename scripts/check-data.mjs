// Checks the car data (data/manufacturers.json, data/families/*.json) against data/SCHEMA.md:
// structure, ids, vocabularies, and that every quoted fact is really in its source and states the value used.
//   node scripts/check-data.mjs                     all families
//   node scripts/check-data.mjs data/families/x.json one file
//   --offline   use cached source text only (no network); sources not cached are reported, not fetched
//   --json      print a machine-readable report
import fs from 'node:fs';
import path from 'node:path';
import { sourceText, norm } from './research/text.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const files = args.filter(a => a.endsWith('.json'));
const famFiles = files.length ? files : fs.readdirSync(path.join(ROOT, 'data/families')).filter(f => f.endsWith('.json')).map(f => path.join(ROOT, 'data/families', f));

export const MARKETS = new Set(['global', 'EU', 'UK', 'US', 'CA', 'NA', 'MX', 'BR', 'CN', 'JP', 'KR', 'IN', 'AU', 'NZ', 'RU', 'ZA', 'ME', 'ASEAN', 'TW', 'unstated']);
export const FUELS = new Set(['petrol', 'diesel', 'mild hybrid', 'hybrid', 'plug-in hybrid', 'electric', 'hydrogen', 'LPG', 'flex-fuel']);
export const DRIVES = new Set(['FWD', 'RWD', 'AWD', '4WD']);
const SRC_TYPES = new Set(['manufacturer', 'press', 'secondary']);
const TOPICS = new Set(['design', 'dimensions', 'weight', 'powertrain', 'drivetrain', 'chassis', 'interior', 'technology', 'safety-equipment', 'other']);
const REV_KINDS = new Set(['facelift', 'update', 'rename', 'special']);
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const GEN_KEYS = new Set(['id', 'slug', 'ordinal', 'lines', 'name', 'codes', 'names', 'dates', 'ongoing', 'platform', 'assembly', 'bodyStyles', 'seating', 'drivetrains', 'dimensions', 'cargo', 'powertrains', 'changes', 'revisions', 'commons', 'notes', 'images']);

const manufacturers = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/manufacturers.json'), 'utf8'));
const makerIds = new Set(manufacturers.map(m => m.id));
const report = { files: [], errors: 0, warnings: 0, facts: 0, quotesChecked: 0, sources: new Map() };

// A number appears in the (normalised) quote as a whole number: 5085 matches "5,085 mm" but not "50851".
// Integers also match a written ".0" (183 matches "183.0 in").
const hasNumber = (q, n) => new RegExp(`(^|[^0-9.])${String(n).replace('.', '\\.')}${Number.isInteger(n) ? '(\\.0+)?' : ''}(?![0-9]|\\.[0-9])`).test(q);

function checkFamily(file) {
  const out = { file: path.relative(ROOT, file), errors: [], warnings: [], facts: 0 };
  const err = m => out.errors.push(m), warn = m => out.warnings.push(m);
  let f;
  try { f = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { err(`invalid JSON: ${e.message}`); return out; }
  if (!ID.test(f.id || '')) err(`family id "${f.id}"`);
  if (path.basename(file) !== `${f.id}.json`) err(`file name should be ${f.id}.json`);
  if (!ID.test(f.slug || '')) err('family slug');
  if (!makerIds.has(f.manufacturer)) err(`unknown manufacturer ${f.manufacturer}`);
  if (!f.name) err('family name');
  const lines = new Set((f.lines || []).map(l => l.id));
  if (!lines.size) err('no lines');
  const sources = f.sources || {};
  for (const [k, s] of Object.entries(sources)) {
    if (!s.url || !/^https?:\/\//.test(s.url)) err(`source ${k}: url`);
    if (/wikipedia\.org/.test(s.url) && !/[?&]oldid=\d+/.test(s.url)) err(`source ${k}: Wikipedia sources must be oldid permalinks`);
    if (!s.title || !s.publisher) err(`source ${k}: title and publisher`);
    if (!SRC_TYPES.has(s.type)) err(`source ${k}: type "${s.type}"`);
  }
  const used = new Set();

  // Checks one fact: source exists, each quote is in the source, and the listed values appear in the quotes.
  function fact(where, o, { numbers = [], words = [] } = {}) {
    if (!o || typeof o !== 'object') return;
    out.facts++;
    if (!o.src) return err(`${where}: no src`);
    const s = sources[o.src];
    if (!s) return err(`${where}: unknown src "${o.src}"`);
    used.add(o.src);
    const quotes = o.quotes || (o.quote ? [o.quote] : []);
    if (!quotes.length || quotes.some(q => typeof q !== 'string' || q.trim().length < 3)) return err(`${where}: missing quote`);
    let text = null;
    const cache = report.sources;
    if (cache.has(s.url)) text = cache.get(s.url);
    else {
      try { text = OFFLINE ? sourceTextCached(s.url) : sourceText(s.url); } catch (e) { text = { error: e.message }; }
      cache.set(s.url, text);
    }
    if (text?.error || text == null) return warn(`${where}: source ${o.src} unreadable (${text?.error || 'not cached'}) — quote not verified`);
    const nt = typeof text === 'string' ? norm(text) : text.n;
    for (const q of quotes) {
      report.quotesChecked++;
      if (!nt.includes(norm(q))) err(`${where}: quote not found in ${o.src}: "${q.slice(0, 90)}"`);
    }
    const nq = norm(quotes.join(' | '));
    for (const n of numbers) if (n != null && !hasNumber(nq, n)) err(`${where}: value ${n} is not in the quote`);
    for (const w of words) if (w && !nq.includes(norm(w))) err(`${where}: "${w}" is not in the quote`);
  }
  const year = d => d ? Number(String(d.value ?? d).slice(0, 4)) : null;
  const dateFact = (where, d) => {
    if (!d) return;
    if (!DATE.test(d.value || '')) err(`${where}: date "${d.value}"`);
    if (d.market && !MARKETS.has(d.market)) err(`${where}: market ${d.market}`);
    fact(where, d, { numbers: [year(d)] });
  };
  const markets = (where, ms) => { for (const m of ms || []) if (!MARKETS.has(m)) err(`${where}: market "${m}"`); };

  const genIds = new Set(), slugs = new Set();
  for (const g of f.generations || []) {
    const W = g.id || '(generation)';
    if (g.id !== `${f.id}-${g.slug}`) err(`${W}: id must be ${f.id}-${g.slug}`);
    if (genIds.has(g.id)) err(`${W}: duplicate id`); genIds.add(g.id);
    if (slugs.has(g.slug)) err(`${W}: duplicate slug`); slugs.add(g.slug);
    if (!ID.test(g.slug || '')) err(`${W}: slug`);
    if (!Number.isInteger(g.ordinal)) err(`${W}: ordinal`);
    if (!g.name) err(`${W}: name`);
    if (!g.lines?.length || g.lines.some(l => !lines.has(l))) err(`${W}: lines`);
    for (const k of Object.keys(g)) if (!GEN_KEYS.has(k)) warn(`${W}: unknown field ${k}`);
    const itemIds = new Set();
    const item = (where, it) => { if (!ID.test(it.id || '')) err(`${where}: item id "${it.id}"`); else if (itemIds.has(it.id)) err(`${where}: duplicate item id ${it.id}`); itemIds.add(it.id); };
    for (const c of g.codes || []) fact(`${W} code`, c, { words: [c.value] });
    for (const n of g.names || []) { markets(`${W} name`, n.markets); fact(`${W} name ${n.value}`, n, { words: [n.value] }); }
    const d = g.dates || {};
    dateFact(`${W} revealed`, d.revealed); dateFact(`${W} productionStart`, d.productionStart); dateFact(`${W} productionEnd`, d.productionEnd);
    for (const s of d.salesStart || []) dateFact(`${W} salesStart`, s);
    for (const m of d.modelYears || []) { markets(`${W} modelYears`, [m.market]); fact(`${W} modelYears ${m.market}`, m, { numbers: [m.from, m.to] }); }
    if (g.ongoing && d.productionEnd) err(`${W}: ongoing but has productionEnd`);
    if (d.productionStart && d.productionEnd && d.productionEnd.value < d.productionStart.value) err(`${W}: production ends before it starts`);
    if (g.platform) fact(`${W} platform`, g.platform);
    for (const a of g.assembly || []) fact(`${W} assembly`, a);
    for (const b of g.bodyStyles || []) { item(`${W} bodyStyle`, b); markets(`${W} ${b.id}`, b.markets); fact(`${W} ${b.id}`, b); }
    if (g.seating) { if (!Array.isArray(g.seating.options) || !g.seating.options.every(Number.isInteger)) err(`${W}: seating.options`); fact(`${W} seating`, g.seating, { numbers: g.seating.options }); }
    for (const dr of g.drivetrains || []) { if (!DRIVES.has(dr.value)) err(`${W}: drivetrain "${dr.value}"`); markets(`${W} drivetrain`, dr.markets); fact(`${W} drivetrain ${dr.value}`, dr); }
    for (const x of g.dimensions || []) {
      item(`${W} dimensions`, x); markets(`${W} ${x.id}`, [x.market]);
      if (!['mm', 'in'].includes(x.unit)) err(`${W} ${x.id}: unit`);
      const vals = ['length', 'width', 'height', 'wheelbase'].map(k => x[k]).filter(v => v != null);
      if (!vals.length) err(`${W} ${x.id}: no values`);
      if (x.unit === 'mm' && vals.some(v => v < 1000 || v > 6000)) err(`${W} ${x.id}: implausible mm value`);
      fact(`${W} ${x.id}`, x, { numbers: vals });
    }
    for (const k of g.cargo || []) {
      item(`${W} cargo`, k); markets(`${W} ${k.id}`, [k.market]);
      if (!['L', 'cu ft'].includes(k.unit)) err(`${W} ${k.id}: unit`);
      if (!['3rd row', '2nd row', '1st row', 'unstated'].includes(k.behind)) err(`${W} ${k.id}: behind`);
      if (!k.standard) err(`${W} ${k.id}: standard (use "not stated")`);
      fact(`${W} ${k.id}`, k, { numbers: [k.value] });
    }
    for (const p of g.powertrains || []) {
      item(`${W} powertrain`, p); markets(`${W} ${p.id}`, [p.market]);
      if (!FUELS.has(p.fuel)) err(`${W} ${p.id}: fuel "${p.fuel}"`);
      if (p.drivetrain && !DRIVES.has(p.drivetrain)) err(`${W} ${p.id}: drivetrain "${p.drivetrain}"`);
      if (p.power && !['kW', 'PS', 'hp'].includes(p.power.unit)) err(`${W} ${p.id}: power unit`);
      if (p.torque && !['Nm', 'lb-ft'].includes(p.torque.unit)) err(`${W} ${p.id}: torque unit`);
      fact(`${W} ${p.id}`, p, { numbers: [p.power?.value, p.torque?.value, p.displacement] });
    }
    const changes = (where, list) => { for (const c of list || []) { item(where, c); if (c.vs && !(f.generations || []).some(x => x.id === c.vs)) err(`${where} ${c.id}: vs "${c.vs}" is not a generation of this family`); if (!TOPICS.has(c.topic)) err(`${where} ${c.id}: topic "${c.topic}"`); if (!c.text) err(`${where} ${c.id}: text`); fact(`${where} ${c.id}`, c); } };
    changes(`${W} changes`, g.changes);
    if (g.ordinal === 1 && g.changes?.length) warn(`${W}: first generation has "changes"`);
    for (const r of g.revisions || []) {
      item(`${W} revision`, r);
      if (!ID.test(r.slug || '')) err(`${W} ${r.id}: slug`);
      if (!REV_KINDS.has(r.kind)) err(`${W} ${r.id}: kind`);
      for (const [k, v] of Object.entries(r.dates || {})) dateFact(`${W} ${r.id} ${k}`, v);
      for (const n of r.names || []) { markets(`${W} ${r.id} name`, n.markets); fact(`${W} ${r.id} name`, n, { words: [n.value] }); }
      changes(`${W} ${r.id}`, r.changes);
      if (!r.dates?.revealed && !r.dates?.productionStart) warn(`${W} ${r.id}: no date`);
    }
    if (!g.dates?.productionStart) warn(`${W}: no production start`);
    if (!g.dimensions?.length) warn(`${W}: no dimensions`);
    if (!g.commons?.generation) warn(`${W}: no Commons category`);
  }
  for (const k of Object.keys(sources)) if (!used.has(k)) warn(`source ${k} is not used`);
  return out;
}

function sourceTextCached(url) {
  // sourceText reads the cache first; with --offline, refuse to fetch.
  const real = sourceText;
  try { return real(url, { cacheOnly: true }); } catch { return null; }
}

for (const file of famFiles) {
  const r = checkFamily(file);
  report.files.push(r); report.errors += r.errors.length; report.warnings += r.warnings.length; report.facts += r.facts;
}
if (args.includes('--json')) console.log(JSON.stringify({ ...report, sources: undefined }, null, 1));
else {
  for (const r of report.files) {
    console.log(`\n${r.file}: ${r.facts} facts, ${r.errors.length} errors, ${r.warnings.length} warnings`);
    for (const e of r.errors) console.log('  ERROR ' + e);
    for (const w of r.warnings) console.log('  warn  ' + w);
  }
  console.log(`\n${report.files.length} files · ${report.facts} facts · ${report.quotesChecked} quotes checked · ${report.errors} errors · ${report.warnings} warnings`);
}
process.exit(report.errors ? 1 : 0);
