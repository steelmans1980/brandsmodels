#!/usr/bin/env node
// Builds the public site into public/ from data/manufacturers.json, data/families/*.json and data/overlay.json:
// one HTML page per manufacturer, model family, generation, consecutive-generation comparison and year, plus the
// sitemap, robots.txt, headers and the small JSON files the browser needs. Only public/ is served.
//
//   SITE_URL=https://example.com node scripts/build.mjs   public base URL for canonical links and the sitemap
//                                                         (default: site.config.json → url)
//   BUILD_OUT=dir                                         write somewhere other than public/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../site/lib.mjs';
import * as R from '../site/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.BUILD_OUT || 'public');
const t0 = Date.now();
const readJson = p => JSON.parse(fs.readFileSync(path.resolve(ROOT, p), 'utf8'));
const DATA = process.env.DATA_DIR || 'data';   // tests point this at fixtures

const config = readJson('site.config.json');
const SITE_URL = (process.env.SITE_URL || config.url).replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(SITE_URL)) { console.error(`SITE_URL must be an origin like https://example.com (got ${SITE_URL})`); process.exit(1); }
R.configure({ url: SITE_URL });

const manufacturers = readJson(`${DATA}/manufacturers.json`);
const famDir = path.resolve(ROOT, DATA, 'families');
const families = fs.readdirSync(famDir).filter(f => f.endsWith('.json')).sort().map(f => readJson(path.join(famDir, f)));
const overlay = fs.existsSync(path.resolve(ROOT, DATA, 'overlay.json')) ? readJson(`${DATA}/overlay.json`) : { entries: [] };
// Photos reviewed by scripts/research/images.mjs, keyed by generation id.
const photos = fs.existsSync(path.resolve(ROOT, DATA, 'images.json')) ? readJson(`${DATA}/images.json`).images : {};
for (const f of families) for (const g of f.generations) g.images = photos[g.id] || [];
for (const gid of Object.keys(photos)) if (!families.some(f => f.generations.some(g => g.id === gid))) { console.error(`data/images.json: unknown generation ${gid}`); process.exit(1); }

// Structural checks the pages depend on (the full source check is scripts/check-data.mjs).
const fail = m => { console.error(m); process.exit(1); };
const seen = new Set();
for (const f of families) {
  if (seen.has(f.id)) fail(`duplicate family id ${f.id}`); seen.add(f.id);
  for (const g of f.generations) { if (seen.has(g.id)) fail(`duplicate generation id ${g.id}`); seen.add(g.id); }
}
let merged;
try { merged = L.applyOverlay(families, overlay); } catch (e) { fail(`data/overlay.json: ${e.message}`); }
const accessed = families.flatMap(f => Object.values(f.sources).map(s => s.accessed)).filter(Boolean).sort();
const updated = process.env.DATA_DATE || accessed.at(-1) || new Date().toISOString().slice(0, 10);
const db = L.buildIndex(manufacturers, merged, { updated, currentYear: Number(updated.slice(0, 4)) });

const stats = {
  families: db.families.size, generations: db.gens.size,
  revisions: [...db.gens.values()].reduce((a, g) => a + (g.revisions || []).length, 0),
  facts: L.countFacts(merged.map(f => f.generations)),
  sources: new Set(merged.flatMap(f => Object.values(f.sources).map(s => s.url))).size,
  images: [...db.gens.values()].reduce((a, g) => a + (g.images || []).length, 0)
};

// Consecutive-generation comparisons, with a one-line summary built only from sourced data.
const pairs = [...db.families.values()].flatMap(f => f.pairs);
for (const p of pairs) {
  const bits = [];
  const n = (p.next.changes || []).filter(c => !c.vs || c.vs === p.prev.id).length;
  const cd = L.commonDims([p.prev, p.next]);
  const len = cd?.values.find(v => v.key === 'length');
  if (len) bits.push(`${len.mm[1] >= len.mm[0] ? '+' : '−'}${L.num(Math.abs(len.mm[1] - len.mm[0]))} mm in length (${cd.market === 'unstated' ? 'market not stated' : L.MARKET_LABEL[cd.market]})`);
  const newFuels = L.fuelsOf(p.next).filter(x => !L.fuelsOf(p.prev).includes(x) && p.prev.powertrains?.length);
  if (newFuels.length) bits.push(`adds ${newFuels.map(x => L.FUEL_LABEL[x].toLowerCase()).join(' and ')}`);
  if (n) bits.push(L.plural(n, 'sourced change'));
  p.summary = bits.length ? bits.join(' · ') : 'Side-by-side comparison of the documented specifications';
  p.weight = n + (len ? 2 : 0) + newFuels.length + ((p.next.images || []).length ? 3 : 0);
}
const featured = [...pairs].sort((a, b) => b.weight - a.weight || (L.startYear(b.next) ?? 0) - (L.startYear(a.next) ?? 0));

// ---- output folder
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const write = (rel, body) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};
const page = ({ path: p, html }) => write(p.endsWith('/') ? p + 'index.html' : p, html);
function linkTree(from, to) {
  if (!fs.existsSync(from)) return;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); linkTree(a, b); }
    else { try { fs.linkSync(a, b); } catch { fs.copyFileSync(a, b); } }
  }
}
// Only the photos the pages use are published.
const usedImages = new Set([...db.gens.values()].flatMap(g => (g.images || []).flatMap(i => [i.src, i.thumb].filter(Boolean))));
for (const rel of usedImages) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) fail(`missing image ${rel}`);
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  try { fs.linkSync(from, path.join(OUT, rel)); } catch { fs.copyFileSync(from, path.join(OUT, rel)); }
}
fs.copyFileSync(path.join(ROOT, 'styles.css'), path.join(OUT, 'styles.css'));
for (const f of ['client.js', 'lib.mjs', 'render.mjs']) fs.copyFileSync(path.join(ROOT, 'site', f), path.join(OUT, f));

// ---- pages
const sitemap = [];
const add = (rendered, indexable = true) => { page(rendered); if (indexable) sitemap.push(rendered.path); };
add(R.homePage(db, { stats, featured }));
add(R.makersPage(db));
add(R.carsPage(db));
add(R.comparePage(db));
add(R.aboutPage(db, stats));
add(R.creditsPage(db));
add(R.privacyPage(db));
add(R.popularPage(db));
add(R.garagePage(db), false);
add(R.suggestPage(db), false);
add(R.searchPage(db), false);
page(R.notFoundPage(db));
for (const m of db.makers.values()) if (m.families.length) add(R.makerPage(db, m));
for (const f of db.families.values()) add(R.familyPage(db, f));
for (const g of db.gens.values()) add(R.generationPage(db, g));
for (const p of pairs) add(R.pairPage(db, p));
const events = L.yearEvents(db);
const years = [...events.keys()].sort((a, b) => a - b);
add(R.yearsPage(db, years));
for (const y of years) add(R.yearPage(db, y, events.get(y), years));

// ---- data for the browser: comparison and search (quotes and research notes stay out)
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'quote' || k === 'quotes' || k === 'evidence' || k === 'family' || k === 'notes' || k === 'commons') ? undefined : v));
write('data/compare.json', JSON.stringify({
  families: Object.fromEntries([...db.families.values()].map(f => [f.id, { id: f.id, name: f.name, path: f.path, maker: { name: f.maker.name, slug: f.maker.slug }, sources: f.sources, lines: f.lines }])),
  gens: [...db.gens.values()].map(g => ({ ...strip(g), familyId: g.family.id }))
}));
write('data/search-index.json', JSON.stringify({
  makers: [...db.makers.values()].filter(m => m.families.length).map(m => ({ n: m.name, u: L.makerPath(m) })),
  families: [...db.families.values()].map(f => ({ id: f.id, n: f.name, m: f.maker.name, u: f.path, alt: [...new Set(f.generations.flatMap(g => (g.names || []).map(x => x.value)))] })),
  gens: [...db.gens.values()].map(g => ({ id: g.id, n: L.genTitle(g.family, g), f: g.family.name, m: g.family.maker.name, u: g.path, name: g.name,
    codes: L.codesOf(g), alt: (g.names || []).map(x => x.value), p: L.period(g), y0: L.yearOf(g.dates?.productionStart), y1: g.ongoing ? db.currentYear : L.yearOf(g.dates?.productionEnd),
    my: (g.dates?.modelYears || []).map(m => [m.market, m.from, m.to ?? null]), img: (g.images || [])[0]?.thumb || (g.images || [])[0]?.src || null }))
}));

// ---- headers, robots, sitemap. Pages of the earlier site at this address are not redirected (they 404).
write('_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  X-Frame-Options: SAMEORIGIN
/assets/*
  Cache-Control: public, max-age=604800
/data/*
  Cache-Control: public, max-age=3600
`);
write('robots.txt', `User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /search/\nDisallow: /garage/\nDisallow: /suggest/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map(p => `  <url><loc>${SITE_URL}${encodeURI(p)}</loc><lastmod>${updated}</lastmod></url>`).join('\n')}\n</urlset>\n`);

console.log(JSON.stringify({ siteUrl: SITE_URL, ...stats, pairs: pairs.length, years: years.length, sitemapUrls: sitemap.length, overlayEntries: (overlay.entries || []).length, seconds: ((Date.now() - t0) / 1000).toFixed(1) }));
