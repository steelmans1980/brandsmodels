#!/usr/bin/env node
// Builds the public site into public/: one HTML page per model, label, magazine, year and combined page, plus the
// sitemap, robots.txt, redirects, headers and the small JSON files the browser needs. Only public/ is served.
//
//   node scripts/build.mjs            full build (copies assets as hard links where possible)
//   node scripts/build.mjs --check    build into a temporary folder and report counts only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../site/lib.mjs';
import * as R from '../site/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, process.env.BUILD_OUT || 'public');
const OWNER_EMAIL = 'marwan@gedeon.org';
const t0 = Date.now();

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/campaigns.json'), 'utf8'));
const overlayPath = path.join(ROOT, 'data/overlay.json');
const overlay = fs.existsSync(overlayPath) ? JSON.parse(fs.readFileSync(overlayPath, 'utf8')) : { entries: [] };

const missing = raw.campaigns.filter(c => !c.id);
if (missing.length) {
  console.error(`${missing.length} credits have no id. Run: node scripts/assign-ids.mjs --previous <last published campaigns.json>`);
  process.exit(1);
}
const ids = new Set();
for (const c of raw.campaigns) { if (ids.has(c.id)) { console.error(`duplicate id ${c.id}`); process.exit(1); } ids.add(c.id); }

const merged = L.applyOverlay(raw, overlay);
const db = L.buildIndex(merged);
const table = L.rankingTable(db);
const years = [...new Set(db.campaigns.filter(L.dated).map(c => c.year))].sort((a, b) => b - a);
const periodList = L.periods(table);
const combosList = L.comboPages(db);
const coversList = L.coverPages(db);
const combos = new Map();
for (const x of combosList) { if (!combos.has(x.model.slug)) combos.set(x.model.slug, []); combos.get(x.model.slug).push(x); }
const comboKeys = new Set(combosList.map(x => `${x.model.slug}|${x.brand.slug}`));
const covers = new Set(coversList.map(x => x.model.slug));
const topBrand = L.topByBrand(db);

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
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); linkTree(a, b); }
    else { try { fs.linkSync(a, b); } catch { fs.copyFileSync(a, b); } }
  }
}
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
linkTree(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
fs.copyFileSync(path.join(ROOT, 'styles.css'), path.join(OUT, 'styles.css'));
fs.copyFileSync(path.join(ROOT, 'site/client.js'), path.join(OUT, 'client.js'));
fs.copyFileSync(path.join(ROOT, 'site/lib.mjs'), path.join(OUT, 'lib.mjs'));

// ---- pages
const sitemap = [];
const add = (rendered, indexable = true) => { page(rendered); if (indexable) sitemap.push(rendered.path); };
add(R.homePage(db, table, years));
add(R.modelsDirectory(db));
add(R.brandsDirectory(db, false));
add(R.brandsDirectory(db, true));
add(R.yearsDirectory(db, years));
add(R.featuredPage(db, table, periodList));
add(R.fanPage(db));
add(R.aboutPage(db));
add(R.privacyPage(db, OWNER_EMAIL));
add(R.favouritesPage(db), false);
add(R.suggestPage(db), false);
add(R.searchPage(db), false);
page(R.notFoundPage(db));
let nModels = 0, nModelsIndexed = 0;
for (const m of db.models.values()) {
  const indexable = L.modelIndexable(m);
  add(R.modelPage(db, m, { combos, covers, indexable }), indexable);
  nModels++; if (indexable) nModelsIndexed++;
}
for (const x of combosList) add(R.comboPage(db, x));
for (const x of coversList) add(R.coversPage(db, x));
let nBrands = 0, nBrandsIndexed = 0;
for (const b of db.brands.values()) {
  const indexable = L.brandIndexable(b);
  add(R.brandPage(db, b, { top: topBrand[b.slug] || [], combos: comboKeys, indexable }), indexable);
  nBrands++; if (indexable) nBrandsIndexed++;
}
for (const y of years) add(R.yearPage(db, y, { table, years }));

// ---- data for the browser
write('data/rankings.json', JSON.stringify({ ...table, periods: periodList.map(p => ({ id: p.id, label: p.label, years: p.years })) }));
write('data/search-index.json', JSON.stringify({
  models: [...db.models.values()].map(m => [m.name, m.slug, m.campaigns.length, m.first, m.last]),
  brands: [...db.brands.values()].map(b => [b.name, b.slug, b.isMagazine ? 1 : 0, b.aliases || [], b.campaigns.length]),
  combos: [...comboKeys], covers: [...covers]
}));
write('data/campaigns.json', JSON.stringify({ updated: merged.updated, brands: merged.brands, models: merged.models, campaigns: merged.campaigns }));

// ---- redirects, headers, robots, sitemap
const redirects = [];
for (const b of db.brands.values()) if (b.isMagazine) redirects.push(`/brand/${b.slug}/ /magazine/${b.slug}/ 301`, `/brand/${b.slug} /magazine/${b.slug}/ 301`);
for (const r of db.renames) redirects.push(`/model/${L.slug(r.from)}/* /model/${L.slug(r.to)}/:splat 301`);
redirects.push('/index.html / 301', '/brands/magazine /magazines/ 301');
write('_redirects', redirects.join('\n') + '\n');
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
write('robots.txt', `User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /search/\nDisallow: /favourites/\nDisallow: /suggest/\n\nSitemap: ${L.ORIGIN}/sitemap.xml\n`);
const today = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map(p => `  <url><loc>${L.ORIGIN}${encodeURI(p)}</loc><lastmod>${merged.updated || today}</lastmod></url>`).join('\n')}\n</urlset>\n`);

const summary = { pages: { models: nModels, modelsIndexed: nModelsIndexed, brands: nBrands, brandsIndexed: nBrandsIndexed, combos: combosList.length, covers: coversList.length, years: years.length }, sitemapUrls: sitemap.length, overlayEntries: (overlay.entries || []).length, seconds: ((Date.now() - t0) / 1000).toFixed(1) };
console.log(JSON.stringify(summary));
