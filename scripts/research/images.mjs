// Photos from Wikimedia Commons, matched to generations and facelifts through the Commons categories recorded in
// each family file (generation.commons). Nothing here runs at build time.
//
//   node scripts/research/images.mjs candidates [family id…]
//       lists freely licensed photos in each category (plus closely named subcategories), scores them, downloads small
//       previews and writes numbered contact sheets to research/cache/images/sheets/ for a person to review.
//   node scripts/research/images.mjs apply
//       reads the reviewer's choices in research/image-decisions.json, downloads the chosen photos (1280 px and 640 px
//       wide) into assets/cars/, and writes data/images.json with author, licence and the category evidence.
//
// Only categories named in the data are searched, so a photo is tied to a generation by where Commons files it; the
// reviewer then confirms each choice by eye (wrong generation, wrong facelift, interiors and details are rejected).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { curl, UA } from './text.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const CACHE = path.join(ROOT, 'research/cache/images');
const ALLOWED = /^(CC0|Public domain|PD|CC BY(-SA)? [1-4]\.0|CC BY(-SA)? 2\.5|CC BY(-SA)? 3\.0 [a-z]{2}|CC BY(-SA)? 2\.0 [a-z]{2})/i;
const SKIP = /interior|innenraum|cockpit|dashboard|armaturen|\bengine\b|motorraum|\bseats?\b|\bsitze?\b|\bboot\b|\btrunk\b|kofferraum|\bcargo\b|\bwheels?\b|felge|\bbadge|\blogo|emblem|\bdetail|headl(amp|ight)|tail ?(lamp|light)|scheinwerfer|heckleuchte|\bcrash|unfall|wreck|\bpolice|polizei|ambulance|\btaxi\b|feuerwehr|fire (engine|brigade|department)|tuning|tuned|modified|\btoy\b|model car|modellauto|\blego\b|matchbox|diecast|1:\d\d|prototype|erlkönig|camouflage|\bconcept\b|\brally\b|\brac(e|ing)\b|\bkeys?\b|steering|\bmirror|\bgrille\b|exhaust|instrument|\bdisplay\b|screen|cutaway|skeleton/i;
const SUBCAT_SKIP = /interior|engine|detail|police|taxi|ambulance|fire|military|tuning|modified|toy|model|concept|prototype|racing|rally|wreck|accident|crash|dashboard|by colou?r|logos?|badges?|in art|advert|drawing|museum/i;
const PHOTOGRAPHERS = /Matti Blume|Alexander[- ]Migl|Dinkun Chen|Kevauto|MB-one|Vauxford|Damian B Oh|Rudolf Stricker|M 93|Charles01|Jengtingchen|Tokumeigakarinoaoshima|Mr\.choppers|Kickaffe|SsangYongBoy|JustAnotherCarDesigner|Ypy31|EurovisionNim|Mytho88|Calreyn88|TTTNIS|Bull-Doser|IFCAR|Elise240SX|Kobi-bobi|Peter Pan/i;
const sleep = s => execFileSync('sleep', [String(s)]);
const plain = html => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

function families(ids) {
  const dir = path.join(ROOT, 'data/families');
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter(f => !ids.length || ids.includes(f.id));
}

// Commons pages are read as ordinary HTML (the API is rate-limited for this machine). File pages carry the licence in
// Commons' machine-readable "licensetpl" markup and the author in the Information template. Pages are cached locally.
const PAGE_CACHE = path.join(CACHE, 'pages');
function page(title) {
  fs.mkdirSync(PAGE_CACHE, { recursive: true });
  const file = path.join(PAGE_CACHE, crypto.createHash('sha1').update(title).digest('hex').slice(0, 16) + '.html');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const out = curl(`https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%3A/g, ':').replace(/%2F/g, '/')}`);
  const code = out.slice(out.lastIndexOf('\n') + 1);
  if (code !== '200') throw new Error(`HTTP ${code} for ${title}`);
  const html = out.slice(0, out.lastIndexOf('\n'));
  fs.writeFileSync(file, html);
  sleep(1);
  return html;
}
const unescapeHtml = s => s.replace(/&#95;/g, '_').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)));
const titleFromHref = h => decodeURIComponent(h.replace(/^\/wiki\//, '')).replace(/_/g, ' ');
function members(cat, type) {
  const html = page(cat);
  if (type === 'file') {
    const media = html.split('id="mw-category-media"')[1] || '';
    return [...new Set([...media.matchAll(/href="(\/wiki\/File:[^"#?]+)"/g)].map(m => titleFromHref(unescapeHtml(m[1]))))];
  }
  const subs = (html.split('id="mw-subcategories"')[1] || '').split('id="mw-category-media"')[0].split('class="catlinks')[0];
  return [...new Set([...subs.matchAll(/href="(\/wiki\/Category:[^"#?]+)"/g)].map(m => titleFromHref(unescapeHtml(m[1]))))].filter(t => t !== cat);
}
function between(html, id) {
  const m = html.match(new RegExp(`id="${id}"[^>]*>[^]*?</t[dh]>\\s*<td[^>]*>([^]*?)</td>`));
  return m ? plain(unescapeHtml(m[1])) : '';
}
function fileInfo(titles) {
  const out = [];
  for (const title of titles) {
    let html;
    try { html = unescapeHtml(page(title)); } catch (e) { console.error(e.message); continue; }
    const full = html.match(/<div class="fullMedia">[^]*?href="(https:\/\/upload\.wikimedia\.org\/[^"?]+)[^]*?\(([\d,]+) × ([\d,]+) pixels[^]*?MIME type: <span class="mime-type">([^<]+)</);
    if (!full) continue;
    // a file can carry several licences (e.g. GFDL and CC BY-SA): use the first Creative Commons or public-domain one
    const lic = [...html.matchAll(/class="licensetpl_short"[^>]*>([^<]*)</g)].map(m => m[1].trim());
    const links = [...html.matchAll(/class="licensetpl_link"[^>]*>([^<]*)</g)].map(m => m[1].trim());
    const k = lic.findIndex(l => ALLOWED.test(l));
    const url = full[1];
    out.push({ file: title, width: Number(full[2].replace(/,/g, '')), height: Number(full[3].replace(/,/g, '')), mime: full[4], url,
      thumb1600: url.replace('/wikipedia/commons/', '/wikipedia/commons/thumb/') + '/1600px-' + url.split('/').pop(),
      page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      license: k >= 0 ? lic[k] : (lic[0] || ''), licenseUrl: k >= 0 ? (links[k] || '') : '', author: between(html, 'fileinfotpl_aut').slice(0, 160),
      description: between(html, 'fileinfotpl_desc').slice(0, 300),
      categories: [...((html.split('id="mw-normal-catlinks"')[1] || '').split('</div>')[0]).matchAll(/title="(Category:[^"]+)"/g)].map(m => m[1]) });
  }
  return out;
}
// Titles worth opening first: views of the whole car rather than details.
const titleScore = t => (/front|vorne|frontansicht|3\/4|three.quarter|\bfl\b/i.test(t) ? 3 : 0) + (/rear|heck|side|seite/i.test(t) ? 1 : 0) + (/\.jpe?g$/i.test(t) ? 1 : 0);
const PER_CATEGORY = 14;

/** Files of a category, plus subcategories whose names show they are the same car (not interiors, details or conversions). */
function categoryFiles(cat, exclude = []) {
  const files = new Map(members(cat, 'file').map(t => [t, cat]));
  for (const sub of members(cat, 'subcat')) {
    if (SUBCAT_SKIP.test(sub) || exclude.includes(sub)) continue;
    for (const t of members(sub, 'file')) if (!files.has(t)) files.set(t, sub);
    sleep(1);
  }
  return files;
}

function score(c) {
  let s = 0;
  if (c.categories.some(x => /Quality images|Valued images|Featured pictures/.test(x))) s += 6;
  if (PHOTOGRAPHERS.test(c.author)) s += 3;
  if (/front|vorne|frontansicht|\bfl\b|3\/4/i.test(c.file + ' ' + c.description)) s += 2;
  if (c.width >= 2400) s += 1;
  if (c.width / c.height > 1.25 && c.width / c.height < 1.9) s += 1;
  return s;
}

function candidates(ids) {
  const out = {};
  fs.mkdirSync(path.join(CACHE, 'preview'), { recursive: true });
  for (const fam of families(ids)) {
    for (const g of fam.generations) {
      const cats = [];
      const cm = g.commons || {};
      const revCats = Object.values(cm.revisions || {});
      if (cm.generation) cats.push({ cat: cm.generation, revision: null, exclude: [...revCats, ...(cm.original ? [cm.original] : [])] });
      if (cm.original) cats.push({ cat: cm.original, revision: 'original' });   // a category for the version before the first facelift
      for (const [rid, cat] of Object.entries(cm.revisions || {})) cats.push({ cat, revision: rid });
      for (const [bid, cat] of Object.entries(cm.bodyStyles || {})) cats.push({ cat, bodyStyle: bid });
      const list = [];
      const seen = new Set();
      for (const c of cats) {
        let files;
        try { files = categoryFiles(c.cat, c.exclude || []); } catch (e) { console.error(`${g.id}: ${c.cat}: ${e.message}`); continue; }
        const titles = [...files.keys()].filter(t => !seen.has(t) && /\.(jpe?g|png)$/i.test(t) && !SKIP.test(t))
          .sort((x, y) => titleScore(y) - titleScore(x)).slice(0, PER_CATEGORY);
        titles.forEach(t => seen.add(t));
        for (const info of fileInfo(titles)) {
          if (!ALLOWED.test(info.license) || info.width < 1200 || SKIP.test(info.description)) continue;
          list.push({ ...info, viaCategory: files.get(info.file), fromCategory: c.cat, revision: c.revision ?? null, bodyStyle: c.bodyStyle ?? null, score: score(info) });
        }
      }
      // keep the best few per category so the review sheet stays readable
      const byCat = new Map();
      for (const x of list.sort((a, b) => b.score - a.score)) { const k = x.fromCategory; if (!byCat.has(k)) byCat.set(k, []); if (byCat.get(k).length < 10) byCat.get(k).push(x); }
      out[g.id] = [...byCat.values()].flat();
      console.log(`${g.id}: ${list.length} usable, ${out[g.id].length} for review`);
    }
  }
  const file = path.join(CACHE, 'candidates.json');
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.writeFileSync(file, JSON.stringify({ ...prev, ...out }, null, 1));
  // previews and contact sheets
  for (const [gid, list] of Object.entries(out)) {
    const files = [];
    list.forEach((c, i) => {
      const p = path.join(CACHE, 'preview', `${gid}-${i}.jpg`);
      if (!fs.existsSync(p)) {
        const small = c.thumb1600.replace(/\/1600px-/, '/500px-');   // Wikimedia serves only standard thumbnail widths
        try { execFileSync('curl', ['-sSfL', '-A', UA, '--retry', '6', '--retry-delay', '8', '-o', p, small]); } catch { return; }
        sleep(1);
      }
      files.push({ p, label: `${i} ${c.revision ? 'R:' + c.revision : c.bodyStyle ? 'B:' + c.bodyStyle : 'G'} ${c.license.slice(0, 12)}` });
    });
    if (!files.length) continue;
    fs.mkdirSync(path.join(CACHE, 'sheets'), { recursive: true });
    execFileSync('montage', [...files.flatMap(f => ['-label', f.label, f.p]), '-tile', '5x', '-geometry', '300x200+4+4', '-pointsize', '14', '-title', gid, path.join(CACHE, 'sheets', `${gid}.jpg`)]);
  }
}

// Wikimedia's upload servers answer 429 in bursts: wait longer after each refusal.
function download(url, file) {
  for (let i = 0; i < 8; i++) {
    try { execFileSync('curl', ['-sSfL', '-A', UA, '-o', file, url], { stdio: 'pipe' }); sleep(3); return true; }
    catch { fs.rmSync(file, { force: true }); sleep(20 * (i + 1)); }
  }
  return false;
}
function apply() {
  const failed = [];
  const cand = JSON.parse(fs.readFileSync(path.join(CACHE, 'candidates.json'), 'utf8'));
  const decisions = JSON.parse(fs.readFileSync(path.join(ROOT, 'research/image-decisions.json'), 'utf8'));
  const out = {};
  fs.mkdirSync(path.join(ROOT, 'assets/cars'), { recursive: true });
  for (const [gid, picks] of Object.entries(decisions)) {
    if (gid.startsWith('_')) continue;
    out[gid] = [];
    for (const d of picks) {
      const c = (cand[gid] || []).find(x => x.file === d.file);
      if (!c) { console.error(`${gid}: ${d.file} is not a reviewed candidate`); process.exitCode = 1; continue; }
      const id = `${gid}-${crypto.createHash('sha1').update(c.file).digest('hex').slice(0, 8)}`;
      const big = `assets/cars/${id}.jpg`, small = `assets/cars/${id}-640.jpg`;
      if (!fs.existsSync(path.join(ROOT, big))) {
        // 1280 px is a standard Wikimedia thumbnail width; smaller originals are used as they are
        const src = c.width <= 1280 ? c.url : c.thumb1600.replace(/\/1600px-/, '/1280px-');
        if (!download(src, path.join(ROOT, big))) { console.error(`${gid}: could not download ${c.file}; skipped`); failed.push(c.file); continue; }
        execFileSync('convert', [path.join(ROOT, big), '-strip', '-quality', '82', path.join(ROOT, big)]);
      }
      if (!fs.existsSync(path.join(ROOT, small))) execFileSync('convert', [path.join(ROOT, big), '-resize', '640x', '-strip', '-quality', '80', path.join(ROOT, small)]);
      const dims = execFileSync('identify', ['-format', '%w %h', path.join(ROOT, big)], { encoding: 'utf8' }).split(' ').map(Number);
      const tdims = execFileSync('identify', ['-format', '%w %h', path.join(ROOT, small)], { encoding: 'utf8' }).split(' ').map(Number);
      out[gid].push({
        id, file: c.file, src: big, thumb: small, width: dims[0], height: dims[1], thumbWidth: tdims[0], thumbHeight: tdims[1],
        revision: d.revision ?? c.revision ?? null, bodyStyle: d.bodyStyle ?? c.bodyStyle ?? null, view: d.view || '', lead: !!d.lead,
        representative: !!d.representative, ...(d.representativeNote ? { representativeNote: d.representativeNote } : {}),
        author: c.author, license: c.license, licenseUrl: c.licenseUrl, page: c.page,
        evidence: `Filed in Commons category “${c.viaCategory.replace(/^Category:/, '')}”${c.viaCategory !== c.fromCategory ? ` (within “${c.fromCategory.replace(/^Category:/, '')}”)` : ''}; checked by eye${d.note ? ': ' + d.note : ''}.`
      });
    }
  }
  fs.writeFileSync(path.join(ROOT, 'data/images.json'), JSON.stringify({ about: 'Photos chosen from Wikimedia Commons by scripts/research/images.mjs and reviewed by eye. Keyed by generation id.', images: out }, null, 1) + '\n');
  console.log(`${Object.values(out).flat().length} photos for ${Object.keys(out).length} generations; ${failed.length} not downloaded${failed.length ? ' (run apply again)' : ''}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'candidates') candidates(rest);
else if (cmd === 'apply') apply();
else console.log('usage: images.mjs candidates [family id…] | apply');
