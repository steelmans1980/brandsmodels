// Builds the real site into a temporary folder and checks the HTML: content without JavaScript, unique titles and
// canonicals, sitemap, photo attribution, labelled fallbacks and the identified/dated/undated distinction.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-build-'));
execFileSync('node', ['scripts/build.mjs'], { env: { ...process.env, BUILD_OUT: path.relative(process.cwd(), OUT) }, stdio: 'pipe' });
const read = p => fs.readFileSync(path.join(OUT, p), 'utf8');
const pages = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory() && e.name !== 'assets') walk(p); else if (e.name === 'index.html') pages.push(path.relative(OUT, p)); } })(OUT);
const data = JSON.parse(fs.readFileSync('data/campaigns.json', 'utf8'));
const byId = new Map(data.campaigns.map(c => [c.id, c]));

test('every page has a unique title, description and canonical URL, and no template leaks', () => {
  const titles = new Map(), canon = new Map();
  for (const p of pages) {
    const h = read(p);
    const t = h.match(/<title>([^<]*)<\/title>/)[1];
    const c = h.match(/<link rel="canonical" href="([^"]+)"/)[1];
    assert.ok(h.match(/<meta name="description" content="[^"]{40,}"/), `${p} description`);
    assert.ok(!titles.has(t), `duplicate title ${t} (${p}, ${titles.get(t)})`);
    assert.ok(!canon.has(c), `duplicate canonical ${c}`);
    titles.set(t, p); canon.set(c, p);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(h.replace(/<script type="application\/json"[^]*?<\/script>/, '')), `${p} has a template leak`);
    for (const j of h.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)) JSON.parse(j[1]);
  }
  assert.ok(pages.length > 2000);
});

test('model pages carry their timeline in HTML, with sources, classes and the earliest-record wording', () => {
  const h = read('model/kendall-jenner/index.html');
  assert.match(h, /<h1>Kendall Jenner<\/h1>/);
  assert.match(h, /Earliest documented appearance in this archive: <a href="#r[a-z2-7]{9}">\d{4}, /);
  assert.match(h, /not necessarily the start of her career/);
  assert.match(h, /class="cls cls-identified"/);
  assert.match(h, /data-filter="campaign"/);
  assert.match(h, /rel="noopener noreferrer nofollow" target="_blank">/);
  assert.match(h, /"@type":"Person"/);
  assert.ok(!/"@type":"(Review|AggregateRating)"/.test(h));
});

test('a photo is shown as a model only when it is attributed to her', () => {
  let checked = 0;
  for (const p of pages.filter(x => /^model\/[^/]+\/index\.html$/.test(x))) {
    const h = read(p);
    for (const g of h.matchAll(/<div class="gallery" data-person="([^"]+)">([^]*?)<\/div>/g)) {
      const person = g[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      for (const m of g[2].matchAll(/data-c="([^"]+)" data-i="(\d+)"/g)) {
        const img = byId.get(m[1]).images[Number(m[2])];
        assert.ok(img.talent?.includes(person), `${p}: ${img.src} is not attributed to ${person}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 400, `checked ${checked}`);
});

test('fallback portraits and press photos are labelled; other campaign photos stay available', () => {
  const h = read('model/candice-swanepoel/index.html');
  assert.match(h, /<span class="ptag">Model portrait<\/span>/);
  assert.match(h, /Portrait, not a campaign photo/);
  assert.match(h, /Other campaign photos \(\d+\)<\/button> — not identified as Candice Swanepoel/);
  const tf = read('model/aluel-makuach/index.html');
  const pd = JSON.parse(tf.match(/<script type="application\/json" id="page-data">([^]*?)<\/script>/)[1]);
  assert.ok(Object.values(pd.credits).some(c => c.images.some(i => i.talent.includes('Liu Wen'))), 'per-image attribution travels to the viewer');
});

test('undated relationships are listed apart and not counted', () => {
  const h = read('model/kate-moss/index.html');
  assert.match(h, /<h2>Undated relationships<\/h2>/);
  assert.match(h, /not counted in rankings/);
});

test('sitemap lists indexable pages only; robots and redirects are in place', () => {
  const sm = read('sitemap.xml');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(locs.length > 1500);
  for (const l of locs.slice(0, 400)) {
    const p = decodeURI(new URL(l).pathname).replace(/^\//, '') + 'index.html';
    assert.ok(!/noindex/.test(read(p === 'index.html' ? 'index.html' : p)), `${l} is noindex but in the sitemap`);
  }
  assert.ok(!locs.some(l => /\/(search|favourites|suggest)\//.test(l)));
  assert.match(read('robots.txt'), /Disallow: \/api\//);
  assert.match(read('_redirects'), /^\/brand\/vogue\/ \/magazine\/vogue\/ 301$/m);
  assert.ok(!fs.existsSync(path.join(OUT, 'pipeline')) && !fs.existsSync(path.join(OUT, 'worker')) && !fs.existsSync(path.join(OUT, 'migrations')));
});

test('combined pages exist only with enough verified content', () => {
  const combos = pages.filter(p => /^model\/[^/]+\/[^/]+\/index\.html$/.test(p) && !p.includes('/covers/'));
  assert.ok(combos.length > 20 && combos.length < 200, `${combos.length}`);
  for (const p of combos.slice(0, 30)) assert.ok((read(p).match(/class="entry/g) || []).length >= 3, p);
});

test('rankings data and the most-featured page agree on the method', () => {
  const r = JSON.parse(read('data/rankings.json'));
  assert.deepEqual(r.kinds, ['campaign', 'runway', 'cover', 'ambassador']);
  const h = read('most-featured/index.html');
  assert.match(h, /reflects what this archive documents/);
  assert.match(h, /never combined/);
});
