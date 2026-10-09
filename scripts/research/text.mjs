// Fetches a source page and returns its readable text, cached under research/cache/ (never published).
// Wikipedia permalinks (index.php?title=…&oldid=N) are read through the API so the text is exactly that revision.
// The same text is used by researchers to copy quotes and by scripts/check-data.mjs to verify them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const CACHE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'research', 'cache', 'sources');
export const UA = 'TheCarArchiveResearch/0.1 (https://github.com/steelmans1980/brandsmodels; research for a small reference site)';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', times: '×', deg: '°', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', frac12: '½', sup2: '²', sup3: '³', eacute: 'é', euro: '€', pound: '£', reg: '®', trade: '™', copy: '©', bull: '•', raquo: '»', laquo: '«', shy: '', zwj: '', ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', minus: '−', thinsp: ' ', ensp: ' ', emsp: ' ' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  : (ENT[e.toLowerCase()] ?? m));

export function htmlToText(html) {
  return decode(html
    .replace(/<(script|style|noscript|template|svg)[^]*?<\/\1>/gi, ' ')
    .replace(/<sup[^>]*class="[^"]*(reference|noprint)[^"]*"[^]*?<\/sup>/gi, '')   // Wikipedia citation markers [12]
    .replace(/<span class="mw-editsection">[^]*?<\/span>\s*<\/span>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/table|\/dd|\/dt)\b[^>]*>/gi, '\n')
    .replace(/<\/t[hd]>/gi, ' \t ')
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ''))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();
}

/** Normalised form used for matching quotes: case, spacing, dashes, quotes and thousands separators made uniform. */
export function norm(s) {
  return String(s).normalize('NFKC').toLowerCase()
    .replace(/[‐-―−]/g, '-').replace(/[‘’‛′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/\[\d+\]|\[[a-z]\]|\[note \d+\]/g, '')
    .replace(/(\d)[,   ](?=\d{3}\b)/g, '$1')
    .replace(/\s+/g, ' ').trim();
}

function wikiApi(u) {
  const m = u.hostname.match(/^([a-z-]+)\.wikipedia\.org$/);
  if (!m) return null;
  const oldid = u.searchParams.get('oldid');
  if (!oldid) throw new Error(`Wikipedia sources must be permalinks with oldid: ${u}`);
  return `https://${u.hostname}/w/index.php?oldid=${oldid}&action=render`;
}

// Wikimedia rate-limits the shared address of this machine in bursts: wait and retry on 429.
export function curl(url) {
  for (let i = 0; ; i++) {
    const out = execFileSync('curl', ['-sSL', '--compressed', '--max-time', '40', '-A', UA, '-H', 'Accept-Language: en', '-w', '\n%{http_code}', url],
      { maxBuffer: 64 << 20, encoding: 'utf8' });
    if (!out.endsWith('\n429') || i >= 8) return out;
    execFileSync('sleep', [String(5 * 2 ** i)]);
  }
}

export function sourceText(url, { refresh = false, cacheOnly = false } = {}) {
  const key = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const file = path.join(CACHE, key + '.txt');
  if (!refresh && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  if (cacheOnly) throw new Error('not cached');
  const u = new URL(url);
  const api = wikiApi(u);
  const out = curl(api || url);
  const code = Number(out.slice(out.lastIndexOf('\n') + 1));
  const body = out.slice(0, out.lastIndexOf('\n'));
  if (code !== 200) throw new Error(`HTTP ${code} for ${url}`);
  const text = htmlToText(body);
  if (text.length < 200) throw new Error(`almost no text at ${url}`);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, text);
  fs.writeFileSync(path.join(CACHE, key + '.json'), JSON.stringify({ url, fetched: new Date().toISOString() }));
  return text;
}

/** Current permalink for a Wikipedia article title. */
export function permalink(lang, title) {
  const out = curl(`https://${lang}.wikipedia.org/api/rest_v1/page/title/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  const j = JSON.parse(out.slice(0, out.lastIndexOf('\n')));
  const it = j.items?.[0];
  if (!it) throw new Error(`no article ${title}`);
  if (it.redirect) throw new Error(`${title} is a redirect: use the target article title`);
  return `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(it.title)}&oldid=${it.rev}`;
}

/** A Commons category: number of files, subcategories and a few file names. */
export function commonsCategory(cat) {
  const api = 'https://commons.wikimedia.org/w/api.php?format=json&formatversion=2&action=query';
  const info = JSON.parse(strip(curl(`${api}&prop=categoryinfo&titles=${encodeURIComponent(cat)}`))).query.pages[0];
  if (info.missing && !info.categoryinfo) return { category: cat, exists: false };
  const mem = JSON.parse(strip(curl(`${api}&list=categorymembers&cmlimit=60&cmtitle=${encodeURIComponent(cat)}`))).query.categorymembers;
  return { category: cat, exists: true, files: info.categoryinfo?.files, subcats: mem.filter(m => m.ns === 14).map(m => m.title), sample: mem.filter(m => m.ns === 6).slice(0, 12).map(m => m.title) };
}
const strip = out => out.slice(0, out.lastIndexOf('\n'));

// CLI:  node scripts/research/text.mjs <url>                 print the page text
//       node scripts/research/text.mjs <url> --find "text"   check that a quote is in the page
//       node scripts/research/text.mjs --permalink en "Audi Q7"
//       node scripts/research/text.mjs --commons "Category:Audi Q7 (4L)"
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const a = process.argv.slice(2);
  if (a[0] === '--permalink') console.log(permalink(a[1], a.slice(2).join(' ')));
  else if (a[0] === '--commons') console.log(JSON.stringify(commonsCategory(a.slice(1).join(' ')), null, 1));
  else {
    const text = sourceText(a[0], { refresh: a.includes('--refresh') });
    const f = a.indexOf('--find');
    if (f >= 0) { const ok = norm(text).includes(norm(a[f + 1])); console.log(ok ? 'FOUND' : 'NOT FOUND'); process.exit(ok ? 0 : 1); }
    else process.stdout.write(text + '\n');
  }
}
