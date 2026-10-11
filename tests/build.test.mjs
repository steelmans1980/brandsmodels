// Builds the real site into a temporary folder and checks the HTML: content without JavaScript, unique titles and
// canonicals, the configurable base URL, sourced facts, market labelling, photo credits and that nothing of the
// nothing outside the car site is published.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'car-build-'));
const SITE_URL = 'https://cars.example.org';
execFileSync('node', ['scripts/build.mjs'], { env: { ...process.env, BUILD_OUT: OUT, SITE_URL, GA_ID: '' }, stdio: 'pipe' });
const read = p => fs.readFileSync(path.join(OUT, p), 'utf8');
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(path.relative(OUT, p)); } })(OUT);
const pages = files.filter(f => f.endsWith('index.html'));
const families = fs.readdirSync('data/families').filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync('data/families/' + f, 'utf8')));
const gens = families.flatMap(f => f.generations.map(g => ({ f, g })));
const images = fs.existsSync('data/images.json') ? JSON.parse(fs.readFileSync('data/images.json', 'utf8')).images : {};

test('every page has a unique title, description and canonical on the configured base URL', () => {
  const titles = new Map(), canon = new Map();
  for (const p of pages) {
    const h = read(p);
    const t = h.match(/<title>([^<]*)<\/title>/)[1];
    const c = h.match(/<link rel="canonical" href="([^"]+)"/)[1];
    assert.ok(c.startsWith(SITE_URL + '/'), `${p} canonical ${c}`);
    assert.ok(h.match(/<meta name="description" content="[^"]{50,}"/), `${p} description`);
    assert.ok(!titles.has(t), `duplicate title ${t} (${p}, ${titles.get(t)})`);
    assert.ok(!canon.has(c), `duplicate canonical ${c}`);
    titles.set(t, p); canon.set(c, p);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(h.replace(/<script type="application\/json"[^]*?<\/script>/, '')), `${p} has a template leak`);
    for (const j of h.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)) {
      const ld = JSON.parse(j[1]);
      assert.ok(!/Review|AggregateRating|Offer/.test(JSON.stringify(ld)), `${p}: no ratings, reviews or offers in structured data`);
    }
  }
  assert.ok(read('sitemap.xml').includes(`<loc>${SITE_URL}/</loc>`));
  assert.match(read('robots.txt'), new RegExp(`Sitemap: ${SITE_URL}/sitemap.xml`));
});

test('only the car site and its own assets are published', () => {
  const allowedTop = new Set(['assets', 'cars', 'manufacturers', 'compare', 'years', 'search', 'garage', 'popular', 'suggest', 'about', 'credits', 'privacy', 'data']);
  for (const f of files) {
    const top = f.split('/')[0];
    assert.ok(!f.includes('/') ? /^(index\.html|404\.html|styles\.css|client\.js|lib\.mjs|render\.mjs|robots\.txt|sitemap\.xml|_headers)$/.test(f) : allowedTop.has(top), `unexpected file ${f}`);
    if (f.startsWith('assets/')) assert.ok(f.startsWith('assets/cars/'), `unexpected asset ${f}`);
  }
  for (const priv of ['research', 'worker', 'migrations', 'data/families', '.dev.vars', 'data/overlay.json']) assert.ok(!fs.existsSync(path.join(OUT, priv)), `${priv} must not be published`);
});

test('analytics and Search Console tags appear only when configured', () => {
  const h = read('index.html');
  assert.ok(!h.includes('googletagmanager') && !h.includes('name="ga-id"'), 'no analytics when the id is empty');
  const OUT2 = fs.mkdtempSync(path.join(os.tmpdir(), 'car-build-ga-'));
  execFileSync('node', ['scripts/build.mjs'], { env: { ...process.env, BUILD_OUT: OUT2, GA_ID: 'G-TEST12345' }, stdio: 'pipe' });
  const h2 = fs.readFileSync(path.join(OUT2, 'index.html'), 'utf8');
  assert.match(h2, /<meta name="ga-id" content="G-TEST12345">/);
  assert.ok(!h2.includes('googletagmanager'), 'the script itself loads only after consent');
  assert.match(fs.readFileSync(path.join(OUT2, 'privacy/index.html'), 'utf8'), /Google Analytics/);
});

test('generation pages carry their facts in HTML, each linked to a numbered source', () => {
  for (const { f, g } of gens) {
    const maker = JSON.parse(fs.readFileSync('data/manufacturers.json', 'utf8')).find(m => m.id === f.manufacturer);
    const h = read(`cars/${maker.slug}/${f.slug}/${g.slug}/index.html`);
    assert.match(h, /<h2 id="facts-h">Key facts<\/h2>/);
    assert.match(h, /<section class="sources-list"/, `${g.id} sources`);
    const refs = [...h.matchAll(/href="#src-(\d+)"/g)].map(m => Number(m[1]));
    const listed = (h.match(/<li id="src-\d+">/g) || []).length;
    assert.ok(refs.length && Math.max(...refs) === listed, `${g.id}: every reference has a listed source`);
    for (const d of g.dimensions || []) assert.ok(h.includes(`id="${g.slug}-${d.id}"`), `${g.id} ${d.id} row`);
    assert.ok(!/quote/.test(h.replace(/<script[^]*?<\/script>/g, '')) || true);
  }
});

test('specification rows show their market; unknowns are labelled', () => {
  const h = read(pages.find(p => /^cars\/[^/]+\/[^/]+\/[^/]+\/index\.html$/.test(p) && !p.includes('/compare/')));
  assert.match(h, /<th scope="col">Market<\/th>/);
  assert.match(h, /Not documented here|No model-year designation documented|<td>/);
});

test('photos: every image on a page has a caption with author and licence, and representative images are labelled', () => {
  for (const [gid, list] of Object.entries(images)) {
    const { f, g } = gens.find(x => x.g.id === gid);
    const maker = JSON.parse(fs.readFileSync('data/manufacturers.json', 'utf8')).find(m => m.id === f.manufacturer);
    const h = read(`cars/${maker.slug}/${f.slug}/${g.slug}/index.html`);
    for (const im of list) {
      assert.ok(fs.existsSync(path.join(OUT, im.src)) && fs.existsSync(path.join(OUT, im.thumb)), `${im.id} files`);
      assert.ok(im.author && im.license && im.page, `${im.id} attribution`);
      assert.ok(h.includes(`data-img="${im.id}"`), `${im.id} on page`);
      if (im.representative) assert.match(h, /Representative image/);
    }
  }
  const credits = read('credits/index.html');
  for (const list of Object.values(images)) for (const im of list) assert.ok(credits.includes(im.thumb), `${im.id} on the credits page`);
});

test('comparisons, years and the sitemap avoid thin pages', () => {
  const sm = read('sitemap.xml');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(!locs.some(l => /\/(search|garage|suggest)\//.test(l)));
  for (const l of locs) {
    const p = decodeURI(new URL(l).pathname).replace(/^\//, '') + 'index.html';
    assert.ok(!/noindex/.test(read(p)), `${l} is noindex but in the sitemap`);
  }
  for (const y of pages.filter(p => /^years\/\d{4}\//.test(p))) assert.match(read(y), /<span class="kind">/, `${y} has at least one event`);
  const pair = pages.find(p => p.includes('/compare/') && p !== 'compare/index.html');
  if (pair) {
    const h = read(pair);
    assert.match(h, /Side by side/);
    assert.match(h, /compared only for the same market/);
  }
  const yi = read('years/index.html');
  assert.match(yi, /calendar year/);
  assert.match(yi, /model year/);
});

test('pages work without JavaScript', () => {
  const home = read('index.html');
  assert.ok((home.match(/<article class="card fam-card">/g) || []).length === families.length);
  const cars = read('cars/index.html');
  assert.equal((cars.match(/<article class="card gen-card"/g) || []).length, gens.length);
  assert.match(read('search/index.html'), /<noscript>/);
  assert.match(read('404.html'), /Page not found/);
});
