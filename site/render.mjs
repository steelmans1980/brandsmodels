// HTML for every page, rendered at build time; also imported by the browser for the comparison table, so it stays a
// plain ES module without Node APIs. Every page is complete without JavaScript; site/client.js adds the photo viewer,
// filters, the comparison tool, the Dream garage, search and the forms.
import {
  SITE, MARKET_LABEL, FUEL_LABEL, DRIVE_LABEL, BODY_GROUPS, REV_LABEL, TOPIC_LABEL, STANDARD_HELP,
  yearOf, fmtDate, startYear, endYear, period, codesOf, shortName, genTitle, marketList,
  bodyGroupsOf, fuelsOf, seatsOf, drivesOf, fmtLength, fmtPower, fmtTorque, fmtCargo, num, plural,
  makerPath, comparePath, revisionAnchor, lineGens, predecessors, successors, commonDims, derivedChanges, topPower,
  yearEvents, inProduction, modelYearGens, garageId, myRange
} from './lib.mjs';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let ORIGIN = 'https://brandsmodels.com';
/** The public base URL (no trailing slash). Set from SITE_URL at build time; the domain is not final. */
export function configure({ url }) { if (url) ORIGIN = String(url).replace(/\/+$/, ''); }
export const origin = () => ORIGIN;
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
const ext = (url, text) => `<a href="${esc(url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(text)} <span aria-hidden="true">↗</span></a>`;

// ---------- references: every fact links to a numbered source at the foot of the page ----------
export class Refs {
  constructor() { this.list = []; this.index = new Map(); }
  ref(fam, fact) {
    if (!fact?.src) return '';
    const s = fam.sources?.[fact.src];
    if (!s) return '';
    const key = `${fam.id}:${fact.src}`;
    if (!this.index.has(key)) { this.list.push({ key, fam, s, n: this.list.length + 1 }); this.index.set(key, this.list.length); }
    const n = this.index.get(key);
    return `<sup class="ref"><a href="#src-${n}" title="${esc(s.publisher)}: ${esc(s.title)}">[${n}]</a></sup>`;
  }
  html(heading = 'Sources') {
    if (!this.list.length) return '';
    const kind = { manufacturer: 'Manufacturer', press: 'Motoring press', secondary: 'Reference work' };
    return `<section class="sources-list" aria-labelledby="sources-h"><h2 id="sources-h">${heading}</h2><ol>${this.list.map(r =>
      `<li id="src-${r.n}">${ext(r.s.url, r.s.title)} — ${esc(r.s.publisher)}${r.s.date ? `, ${esc(fmtDate(r.s.date))}` : ''} <span class="src-type">${kind[r.s.type] || ''}${r.s.overlay ? ' · added by review' : ''}</span>${r.s.accessed ? ` <span class="muted">(read ${esc(fmtDate(r.s.accessed))})</span>` : ''}</li>`).join('')}</ol>
<p class="hint">Wikipedia sources link to the exact revision that was read. Specifications differ between markets, years and versions; each figure is shown with the market and version its source states.</p></section>`;
  }
}

// ---------- page data for the browser (photo viewer, garage buttons) ----------
export class Ctx {
  constructor(db) { this.db = db; this.images = {}; }
  img(g, im) {
    this.images[im.id] = { src: '/' + im.src, w: im.width, h: im.height, caption: imageCaption(g, im), credit: creditText(im), page: im.page, license: im.license, licenseUrl: im.licenseUrl, rep: !!im.representative };
  }
  data() { return { images: this.images }; }
}

// ---------- images ----------
const revOf = (g, id) => (g.revisions || []).find(r => r.id === id);
const bodyOf = (g, id) => (g.bodyStyles || []).find(b => b.id === id);
export function versionLabel(g, im) {
  if (im.revision === 'original') return (g.revisions || []).length ? 'original version (before the first facelift)' : '';
  const r = im.revision && revOf(g, im.revision);
  if (r) return `${(REV_LABEL[r.kind] || 'revision').toLowerCase()}${yearOf(r.dates?.revealed || r.dates?.productionStart) ? ' of ' + yearOf(r.dates?.revealed || r.dates?.productionStart) : ''}`;
  return (g.revisions || []).length ? 'version (before/after facelift) not identified' : '';
}
export function imageCaption(g, im) {
  const b = im.bodyStyle && bodyOf(g, im.bodyStyle);
  const v = versionLabel(g, im);
  return `${genTitle(g.family, g)}${v ? ', ' + v : ''}${b ? ` · ${b.value}` : ''}${im.view ? ` · ${im.view}` : ''}`;
}
export const creditText = im => `Photo: ${im.author || 'unknown author'} · ${im.license}${im.page ? ' · Wikimedia Commons' : ''}`;
const repTag = im => im.representative ? `<span class="rep-tag" title="${esc(im.representativeNote || 'Shows this generation in general, not a specific version or market.')}">Representative image</span>` : '';
function figure(ctx, g, im, { big = false, eager = false } = {}) {
  ctx.img(g, im);
  const alt = imageCaption(g, im);
  const src = big ? im.src : (im.thumb || im.src);
  return `<figure class="photo${big ? ' big' : ''}"><button class="shot" type="button" data-img="${im.id}" aria-label="Enlarge photo: ${esc(alt)}"><img src="/${esc(src)}" alt="${esc(alt)}" width="${im.thumbWidth || im.width || ''}" height="${im.thumbHeight || im.height || ''}"${eager ? '' : ' loading="lazy"'} decoding="async"></button>
<figcaption>${repTag(im)}<span class="cap">${esc(alt)}</span> <span class="credit">${im.page ? ext(im.page, creditText(im)) : esc(creditText(im))}${im.licenseUrl ? ` · <a href="${esc(im.licenseUrl)}" rel="license noopener nofollow" target="_blank">licence</a>` : ''}</span></figcaption></figure>`;
}
const leadImage = g => (g.images || []).find(i => !i.representative && i.lead) || (g.images || []).find(i => !i.representative) || (g.images || [])[0];
function card(ctx, g, { level = 3, extra = '' } = {}) {
  const im = leadImage(g);
  if (im) ctx.img(g, im);
  const pic = im ? `<img src="/${esc(im.thumb || im.src)}" alt="${esc(imageCaption(g, im))}" loading="lazy" decoding="async">${repTag(im)}`
    : `<span class="placeholder"><b>${esc(shortName(g))}</b><span>No photo yet</span></span>`;
  const attrs = `data-body="${esc(bodyGroupsOf(g).join('|'))}" data-fuel="${esc(fuelsOf(g).join('|'))}" data-seats="${esc(seatsOf(g).join('|'))}" data-drive="${esc(drivesOf(g).join('|'))}" data-maker="${esc(g.family.maker.slug)}"`;
  return `<article class="card gen-card" ${attrs}><a class="card-img" href="${g.path}" tabindex="-1" aria-hidden="true">${pic}</a>
<div class="card-meta"><span>${esc(g.family.maker.name)}</span><span>${esc(period(g))}</span></div>
<h${level}><a href="${g.path}">${esc(genTitle(g.family, g))}</a></h${level}>
<p>${esc(g.name)}${namesBrief(g)}</p>${extra}</article>`;
}
const namesBrief = g => {
  const ns = [...new Set((g.names || []).map(n => n.value))];
  return ns.length > 1 ? ` · sold as ${esc(ns.join(' / '))}` : '';
};

// ---------- layout ----------
const NAV = [['/manufacturers/', 'Manufacturers', 'makers'], ['/cars/', 'All generations', 'cars'], ['/compare/', 'Compare', 'compare'],
  ['/years/', 'Years', 'years'], ['/garage/', 'Dream garage', 'garage']];
export function layout({ title, description, path, noindex = false, jsonld = [], body, ctx, active = '', image }) {
  const canonical = ORIGIN + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${SITE}">
${image ? `<meta property="og:image" content="${esc(ORIGIN + '/' + image)}">\n` : ''}<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 fill=%22%23293829%22/%3E%3Ctext x=%2216%22 y=%2223%22 font-family=%22Georgia%22 font-size=%2220%22 fill=%22%23f6f4ef%22 text-anchor=%22middle%22%3EC%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="/styles.css">
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="logo" href="/">The Car <em>Archive.</em></a>
  <form class="search-form" role="search" action="/search/" method="get">
    <input name="q" type="search" placeholder="Search a car, generation code or year — e.g. BMW X5 E70, RAV4 2016" aria-label="Search the archive" autocomplete="off">
  </form>
  <nav aria-label="Main">${NAV.map(([h, t, k]) => `<a href="${h}"${active === k ? ' class="active" aria-current="page"' : ''}>${t}${k === 'garage' ? ' <span class="garage-count" hidden></span>' : ''}</a>`).join('')}</nav>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site-footer">
  <span>${SITE} · An independent reference. Specifications differ by market, year and version — check the linked source before relying on a figure. · <a href="/about/">About</a> · <a href="/credits/">Image credits</a> · <a href="/privacy/">Privacy</a> · <a href="/suggest/" rel="nofollow">Suggest a car, source or correction</a> · <a href="/popular/">Popular in dream garages</a></span>
  <span>Data reviewed ${esc(fmtDate(ctx.db.updated))}</span>
</footer>
<dialog id="lightbox" aria-label="Photo viewer">
  <button class="lb-close" type="button" aria-label="Close">×</button>
  <button class="lb-nav lb-prev" type="button" aria-label="Previous photo">‹</button>
  <div class="lb-img"></div>
  <button class="lb-nav lb-next" type="button" aria-label="Next photo">›</button>
  <div class="lb-caption" aria-live="polite"></div>
</dialog>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script type="application/json" id="page-data">${JSON.stringify(ctx.data()).replace(/</g, '\\u003c')}</script>
<script type="module" src="/client.js"></script>
</body>
</html>
`;
}
const crumbs = items => `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([h, t], i) => i === items.length - 1 ? `<span aria-current="page">${esc(t)}</span>` : `<a href="${h}">${esc(t)}</a>`).join(' <span aria-hidden="true">›</span> ')}</nav>`;
const crumbsLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([h, t], i) => ({ '@type': 'ListItem', position: i + 1, name: t, item: ORIGIN + h })) });
const saveBtn = (type, id, name, url) => `<button type="button" class="save-btn" data-garage="${esc(garageId(type, id))}" data-name="${esc(name)}" data-url="${esc(url)}" aria-pressed="false"><span aria-hidden="true">☆</span> <span class="label">Add to Dream garage</span></button><span class="save-count" data-count-for="${esc(garageId(type, id))}" hidden></span>`;
const compareBtn = g => `<button type="button" class="compare-btn" data-compare="${esc(g.id)}" data-name="${esc(genTitle(g.family, g))}" aria-pressed="false">+ Compare</button>`;
const fixLink = (target, label = 'Report a correction') => `<a class="fix-link" href="/suggest/?type=correction&amp;target=${encodeURIComponent(target)}" rel="nofollow">${label}</a>`;
const notDoc = '<span class="nd">Not documented here</span>';
/** A revision's name with its year, unless the name already says it. */
const revLabel = r => { const y = yearOf(r.dates?.revealed || r.dates?.productionStart || r.dates?.salesStart?.[0]); return y && !String(r.name).includes(String(y)) ? `${r.name} (${y})` : r.name; };
const mk = m => { const s = MARKET_LABEL[m] || m || ''; return s.charAt(0).toUpperCase() + s.slice(1); };

// ---------- family timeline ----------
function timeline(db, fam) {
  const gens = fam.generations;
  const starts = gens.map(g => startYear(g)).filter(Boolean);
  if (!starts.length) return '';
  const min = Math.min(...starts), max = Math.max(db.currentYear, ...gens.map(g => endYear(g) || db.currentYear));
  const span = max - min + 1;
  const pct = y => ((y - min) / span * 100).toFixed(2);
  const ticks = []; for (let y = Math.ceil(min / 5) * 5; y <= max; y += 5) ticks.push(y);
  const rows = fam.lines.map(line => {
    const gs = lineGens(fam, line.id);
    const bars = gs.map(g => {
      const s = startYear(g); if (s == null) return '';
      const e = g.ongoing ? max : (endYear(g) ?? s);
      const revs = (g.revisions || []).map(r => { const y = yearOf(r.dates?.revealed || r.dates?.productionStart); return y && y >= s && y <= e ? `<span class="tick" style="left:${((y - s) / (e - s + 1) * 100).toFixed(1)}%" title="${esc(REV_LABEL[r.kind])} ${y}"></span>` : ''; }).join('');
      return `<a class="bar${g.ongoing ? ' ongoing' : ''}" href="${g.path}" style="left:${pct(s)}%;width:${((e - s + 1) / span * 100).toFixed(2)}%" title="${esc(genTitle(fam, g))}: ${esc(period(g))}"><span>${esc(shortName(g))}</span>${revs}</a>`;
    }).join('');
    return `<div class="tl-row">${fam.lines.length > 1 ? `<div class="tl-line">${esc(line.name)}</div>` : ''}<div class="tl-track">${bars}</div></div>`;
  }).join('');
  return `<figure class="timeline" aria-label="Production timeline">
<div class="tl-scroll"><div class="tl-inner">${rows}<div class="tl-axis">${ticks.map(y => `<span style="left:${pct(y)}%">${y}</span>`).join('')}</div></div></div>
<figcaption class="hint">Bars show production years (not model years), from the sources on each generation page. Small marks are facelifts or updates.${fam.lines.length > 1 ? ' Each row is a model line; a generation sold in both lines appears in both.' : ''}</figcaption></figure>`;
}

// ---------- facts table ----------
function factRows(refs, g) {
  const f = g.family, d = g.dates || {};
  const rows = [];
  const row = (k, v) => rows.push(`<tr><th scope="row">${k}</th><td>${v || notDoc}</td></tr>`);
  const prod = d.productionStart ? `${esc(fmtDate(d.productionStart.value))}${refs.ref(f, d.productionStart)} – ${g.ongoing ? 'present' : d.productionEnd ? esc(fmtDate(d.productionEnd.value)) + refs.ref(f, d.productionEnd) : '<span class="nd">end not documented</span>'}` : '';
  row('Production', prod);
  row('First shown', d.revealed ? `${esc(fmtDate(d.revealed.value))}${d.revealed.event ? ', ' + esc(d.revealed.event) : ''}${refs.ref(f, d.revealed)}` : '');
  if (d.salesStart?.length) row('Sales start', d.salesStart.map(s => `${esc(fmtDate(s.value))} (${esc(MARKET_LABEL[s.market] || s.market || 'market not stated')})${refs.ref(f, s)}`).join('<br>'));
  row('Model years', (d.modelYears || []).map(m => `${myRange(g, m)} (${esc(MARKET_LABEL[m.market] || m.market)})${refs.ref(f, m)}`).join('<br>') || '<span class="nd">No model-year designation documented</span>');
  row('Codes', (g.codes || []).map(c => `${esc(c.value)} <span class="muted">${esc(c.kind || '')}</span>${refs.ref(f, c)}`).join(', '));
  row('Names by market', (g.names || []).map(n => `${esc(n.value)} <span class="muted">(${esc(marketList(n.markets))})</span>${refs.ref(f, n)}`).join('<br>'));
  row('Platform', g.platform ? esc(g.platform.value) + refs.ref(f, g.platform) : '');
  row('Assembly', (g.assembly || []).map(a => esc(a.value) + refs.ref(f, a)).join('<br>'));
  row('Body styles', (g.bodyStyles || []).map(b => `${esc(b.value)}${b.code ? ` <span class="muted">(${esc(b.code)})</span>` : ''}${b.markets?.length && b.markets[0] !== 'global' ? ` <span class="muted">— ${esc(marketList(b.markets))}</span>` : ''}${refs.ref(f, b)}`).join('<br>'));
  row('Seating', g.seating ? `${g.seating.options.join(' or ')} seats${refs.ref(f, g.seating)}` : '');
  row('Drivetrain', (g.drivetrains || []).map(x => `${esc(DRIVE_LABEL[x.value] || x.value)}${x.system ? ` (${esc(x.system)})` : ''}${x.markets?.length && x.markets[0] !== 'global' ? ` <span class="muted">— ${esc(marketList(x.markets))}</span>` : ''}${refs.ref(f, x)}`).join('<br>'));
  return `<table class="facts"><tbody>${rows.join('')}</tbody></table>`;
}
function dimsTable(refs, g) {
  if (!g.dimensions?.length) return `<p class="nd-block">No dimensions documented here yet. ${fixLink(g.id, 'Suggest a source')}</p>`;
  const f = g.family;
  const cell = (d, k) => d[k] != null ? esc(fmtLength(d[k], d.unit)) : '<span class="nd">—</span>';
  return `<div class="table-wrap"><table class="spec"><thead><tr><th scope="col">Market</th><th scope="col">Version</th><th scope="col">Length</th><th scope="col">Width</th><th scope="col">Height</th><th scope="col">Wheelbase</th><th scope="col"><span class="sr">Source</span></th></tr></thead><tbody>
${g.dimensions.map(d => `<tr id="${g.slug}-${d.id}"><td>${esc(mk(d.market))}</td><td>${esc(d.version || '—')}</td><td>${cell(d, 'length')}</td><td>${cell(d, 'width')}</td><td>${cell(d, 'height')}</td><td>${cell(d, 'wheelbase')}</td><td>${refs.ref(f, d)}</td></tr>`).join('')}
</tbody></table></div><p class="hint">Figures are as published by the source for that market and version; widths usually exclude mirrors. Conversions in brackets are ours.</p>`;
}
function cargoTable(refs, g) {
  if (!g.cargo?.length) return '';
  const f = g.family;
  const stds = [...new Set(g.cargo.map(k => k.standard))];
  return `<h3>Luggage capacity</h3><div class="table-wrap"><table class="spec"><thead><tr><th scope="col">Market</th><th scope="col">Version</th><th scope="col">Measured behind</th><th scope="col">Volume</th><th scope="col">Method</th><th scope="col"><span class="sr">Source</span></th></tr></thead><tbody>
${g.cargo.map(k => `<tr><td>${esc(mk(k.market))}</td><td>${esc(k.version || '—')}</td><td>${esc(k.behind === '1st row' ? '1st row (rear seats folded)' : k.behind)}</td><td>${esc(fmtCargo(k))}</td><td>${esc(k.standard)}</td><td>${refs.ref(f, k)}</td></tr>`).join('')}
</tbody></table></div><p class="hint">${stds.map(s => esc(STANDARD_HELP[s] || '')).join(' ')} Volumes measured by different methods are not comparable.</p>`;
}
function powertrainTable(refs, g) {
  if (!g.powertrains?.length) return `<p class="nd-block">No powertrain details documented here yet.</p>`;
  const f = g.family;
  return `<div class="table-wrap"><table class="spec pt"><thead><tr><th scope="col">Version</th><th scope="col">Market</th><th scope="col">Type</th><th scope="col">Engine / motor</th><th scope="col">Power</th><th scope="col">Torque</th><th scope="col">Transmission</th><th scope="col">Drive</th><th scope="col">Years</th><th scope="col"><span class="sr">Source</span></th></tr></thead><tbody>
${g.powertrains.map(p => `<tr data-fuel="${esc(p.fuel)}"><td>${esc(p.name || '—')}</td><td>${esc(mk(p.market))}</td><td>${esc(FUEL_LABEL[p.fuel] || p.fuel)}</td><td>${esc(p.engine || (p.displacement ? num(p.displacement) + ' cc' : '—'))}</td><td>${esc(fmtPower(p.power) || '—')}</td><td>${esc(fmtTorque(p.torque) || '—')}</td><td>${esc(p.transmission || '—')}</td><td>${esc(p.drivetrain || '—')}</td><td>${esc(p.years || '—')}</td><td>${refs.ref(f, p)}</td></tr>`).join('')}
</tbody></table></div><p class="hint">Power is shown in the unit the source uses first (kW, metric PS or SAE hp), with our conversion in brackets. A blank cell means the source does not state it.</p>`;
}
/** Sourced changes of a generation relative to one predecessor (items with "vs" name the predecessor they compare with). */
const changesVs = (g, p) => (g.changes || []).filter(c => !c.vs || c.vs === p.id);
function changeList(refs, fam, list) {
  if (!list?.length) return '';
  return `<ul class="changes">${list.map(c => `<li><span class="topic">${esc(TOPIC_LABEL[c.topic] || c.topic)}</span> ${esc(c.text)}${refs.ref(fam, c)}</li>`).join('')}</ul>`;
}
function revisionsBlock(ctx, refs, g) {
  if (!g.revisions?.length) return '';
  const f = g.family;
  return `<section class="revisions" aria-labelledby="rev-h"><h2 id="rev-h">Facelifts and updates</h2>${g.revisions.map(r => {
    const d = r.dates || {};
    const when = [d.revealed && `shown ${esc(fmtDate(d.revealed.value))}${d.revealed.event ? ' (' + esc(d.revealed.event) + ')' : ''}${refs.ref(f, d.revealed)}`,
      d.productionStart && `production from ${esc(fmtDate(d.productionStart.value))}${refs.ref(f, d.productionStart)}`,
      ...(d.salesStart ? [].concat(d.salesStart).map(s => `on sale ${esc(fmtDate(s.value))}${s.market ? ' (' + esc(MARKET_LABEL[s.market] || s.market) + ')' : ''}${refs.ref(f, s)}`) : [])].filter(Boolean).join(' · ');
    const imgs = (g.images || []).filter(i => i.revision === r.id).slice(0, 3);
    return `<article class="revision" id="${revisionAnchor(r)}"><div class="rev-head"><span class="kind">${esc(REV_LABEL[r.kind] || r.kind)}</span><h3>${esc(r.name)}</h3><p class="when">${when || notDoc}</p>
${(r.names || []).length ? `<p>Name: ${r.names.map(n => `${esc(n.value)} (${esc(marketList(n.markets))})${refs.ref(f, n)}`).join(', ')}</p>` : ''}</div>
${changeList(refs, f, r.changes) || '<p class="nd-block">No sourced list of changes yet.</p>'}
${imgs.length ? `<div class="photo-row">${imgs.map(im => figure(ctx, g, im)).join('')}</div>` : ''}</article>`;
  }).join('')}</section>`;
}

// ---------- comparison (also used in the browser) ----------
const DIM_LABEL = { length: 'Length', width: 'Width', height: 'Height', wheelbase: 'Wheelbase' };
export function compareTable(refs, gens) {
  const head = `<thead><tr><th scope="col"><span class="sr">Item</span></th>${gens.map(g => `<th scope="col"><a href="${g.path}">${esc(genTitle(g.family, g))}</a><br><span class="muted">${esc(g.name)}</span></th>`).join('')}</tr></thead>`;
  const row = (label, fn, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${label}</th>${gens.map(g => `<td>${fn(g) || notDoc}</td>`).join('')}</tr>`;
  const f = g => g.family;
  const rows = [
    row('Production', g => g.dates?.productionStart ? esc(period(g)) + refs.ref(f(g), g.dates.productionStart) : ''),
    row('First shown', g => g.dates?.revealed ? esc(fmtDate(g.dates.revealed.value)) + refs.ref(f(g), g.dates.revealed) : ''),
    row('Model years', g => (g.dates?.modelYears || []).map(m => `${myRange(g, m)} (${esc(m.market)})${refs.ref(f(g), m)}`).join('<br>')),
    row('Codes', g => (g.codes || []).map(c => esc(c.value) + refs.ref(f(g), c)).join(', ')),
    row('Platform', g => g.platform ? esc(g.platform.value) + refs.ref(f(g), g.platform) : ''),
    row('Body styles', g => (g.bodyStyles || []).map(b => esc(b.value) + refs.ref(f(g), b)).join('<br>')),
    row('Seating', g => g.seating ? `${g.seating.options.join(' or ')}${refs.ref(f(g), g.seating)}` : ''),
    row('Drivetrain', g => (g.drivetrains || []).map(x => esc(x.value) + refs.ref(f(g), x)).join(', ')),
    row('Powertrain types documented', g => fuelsOf(g).map(x => esc(FUEL_LABEL[x])).join(', '))
  ];
  const cd = commonDims(gens);
  let dims;
  if (cd) {
    dims = `<tr class="group"><th scope="rowgroup" colspan="${gens.length + 1}">Dimensions — ${esc(MARKET_LABEL[cd.market] || cd.market)}${cd.market === 'unstated' ? ' (the sources do not state the market for any of these figures)' : ''}</th></tr>
<tr class="sub"><th scope="row">Version compared</th>${cd.records.map((r, i) => `<td>${esc(r.version || 'as published')}${refs.ref(f(gens[i]), r)}</td>`).join('')}</tr>
${cd.values.map(v => `<tr><th scope="row">${DIM_LABEL[v.key]}</th>${v.mm.map((mm, i) => `<td>${num(mm)} mm${i ? delta(mm - v.mm[i - 1]) : ''}</td>`).join('')}</tr>`).join('')}`;
  } else {
    dims = `<tr class="group"><th scope="rowgroup" colspan="${gens.length + 1}">Dimensions</th></tr><tr><th scope="row">Not compared</th><td colspan="${gens.length}">These generations have no dimension figures for the same market and body, so they are not set side by side. Each generation page lists its figures by market.</td></tr>`;
  }
  const cargoRow = row('Luggage capacity', g => (g.cargo || []).map(k => `${esc(fmtCargo(k))} <span class="muted">behind ${esc(k.behind)}, ${esc(MARKET_LABEL[k.market] || k.market)}, ${esc(k.standard)}${k.version ? ', ' + esc(k.version) : ''}</span>${refs.ref(f(g), k)}`).join('<br>'));
  const powerRow = row('Highest output documented', g => { const p = topPower(g); return p ? `${esc(fmtPower(p.power))}<br><span class="muted">${[p.name, MARKET_LABEL[p.market] || p.market].filter(Boolean).map(esc).join(', ')}</span>${refs.ref(f(g), p)}` : ''; });
  return `<div class="table-wrap"><table class="compare">${head}<tbody>${rows.join('')}${dims}${cargoRow}${powerRow}</tbody></table></div>
<p class="hint">Differences in brackets are against the column to the left. Dimensions are compared only for the same market and the standard body; luggage figures are shown with their market and measuring method because they are often not comparable.</p>`;
}
const delta = d => Math.round(d) === 0 ? ' <span class="delta">(same)</span>' : ` <span class="delta ${d > 0 ? 'up' : 'down'}">(${d > 0 ? '+' : '−'}${num(Math.abs(d))} mm)</span>`;

// ---------- pages ----------
export function homePage(db, { stats, featured }) {
  const ctx = new Ctx(db);
  const fams = [...db.families.values()];
  const heroGen = featured[0]?.next;
  const heroIm = heroGen && leadImage(heroGen);
  if (heroIm) ctx.img(heroGen, heroIm);
  const body = `
<section class="intro">
  <div>
    <div class="eyebrow">A sourced visual reference</div>
    <h1>Every generation,<br><em>what changed.</em></h1>
    <p class="lede">Model families, generations, facelifts and model years — with dimensions, capacities and powertrains linked to their sources and labelled by market. Compare generations side by side and keep a Dream garage.</p>
  </div>
  <div class="stats">
    <div><b>${stats.families}</b><span>Model families</span></div>
    <div><b>${stats.generations}</b><span>Generations</span></div>
    <div><b>${stats.revisions}</b><span>Facelifts &amp; updates</span></div>
    <div><b>${num(stats.facts)}</b><span>Sourced facts</span></div>
  </div>
</section>
${heroGen ? `<section class="hero"><a class="hero-image" href="${comparePath(featured[0].prev, featured[0].next)}">${heroIm ? `<img src="/${esc(heroIm.src)}" alt="${esc(imageCaption(heroGen, heroIm))}">` : ''}</a>
<div class="hero-copy"><div class="eyebrow">What changed?</div><h2><a href="${comparePath(featured[0].prev, featured[0].next)}">${esc(heroGen.family.name)}: ${esc(shortName(featured[0].prev))} → ${esc(shortName(heroGen))}</a></h2>
<p>${esc(featured[0].summary)}</p><p><a class="line-link" href="${comparePath(featured[0].prev, featured[0].next)}">See the sourced differences</a></p>${heroIm ? `<p class="credit">${esc(creditText(heroIm))}</p>` : ''}</div></section>` : ''}
<div class="section-top"><div><div class="eyebrow">Model families</div><h2>Browse the collection</h2></div><a class="line-link" href="/manufacturers/">All manufacturers</a></div>
<div class="grid fam-grid">${fams.map(fam => familyCard(ctx, db, fam)).join('')}</div>
<div class="section-top"><div><div class="eyebrow">Generation to generation</div><h2>What changed?</h2></div><a class="line-link" href="/compare/">Compare any three</a></div>
<ul class="pair-list">${featured.slice(0, 12).map(p => `<li><a href="${comparePath(p.prev, p.next)}"><b>${esc(p.next.family.name)}</b> ${esc(shortName(p.prev))} → ${esc(shortName(p.next))}</a><span>${esc(p.summary)}</span></li>`).join('')}</ul>
<div class="section-top"><div><div class="eyebrow">Browse by year</div><h2>Calendar years and model years</h2></div><a class="line-link" href="/years/">All years</a></div>
<p class="lede">Year pages list reveals, launches, facelifts and production ends by calendar year, and separately which generations were sold as that model year where a market uses model years.</p>`;
  return { path: '/', html: layout({
    title: `${SITE} — car generations, facelifts and what changed`,
    description: `${SITE}: a sourced visual reference to ${stats.families} SUV model families and ${stats.generations} generations — production years, model years, market versions, dimensions and powertrains, and what changed between generations.`,
    path: '/', body, ctx, image: heroIm?.src,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: ORIGIN + '/',
      potentialAction: { '@type': 'SearchAction', target: ORIGIN + '/search/?q={search_term_string}', 'query-input': 'required name=search_term_string' } }]
  }) };
}
function familyCard(ctx, db, fam) {
  const g = [...fam.generations].reverse().find(x => leadImage(x)) || fam.generations.at(-1);
  const im = g && leadImage(g);
  if (im) ctx.img(g, im);
  const s = Math.min(...fam.generations.map(startYear).filter(Boolean));
  const ongoing = fam.generations.some(x => x.ongoing);
  return `<article class="card fam-card"><a class="card-img" href="${fam.path}" tabindex="-1" aria-hidden="true">${im ? `<img src="/${esc(im.thumb || im.src)}" alt="${esc(imageCaption(g, im))}" loading="lazy" decoding="async">` : `<span class="placeholder"><b>${esc(fam.name)}</b></span>`}</a>
<div class="card-meta"><a href="${makerPath(fam.maker)}">${esc(fam.maker.name)}</a><span>${Number.isFinite(s) ? s : ''}–${ongoing ? 'present' : ''}</span></div>
<h3><a href="${fam.path}">${esc(fam.name)}</a></h3><p>${plural(fam.generations.length, 'generation')} · ${plural(fam.generations.reduce((a, x) => a + (x.revisions || []).length, 0), 'facelift or update', 'facelifts and updates')}</p></article>`;
}

export function makersPage(db) {
  const ctx = new Ctx(db);
  const makers = [...db.makers.values()].filter(m => m.families.length).sort((a, b) => a.name.localeCompare(b.name));
  const body = `${crumbs([['/', 'Home'], ['/manufacturers/', 'Manufacturers']])}
<section class="page-head"><div class="eyebrow">Directory</div><h1>Manufacturers</h1><p class="lede">${plural(makers.length, 'manufacturer')} in the archive so far. The collection starts with twelve SUV model families covered in depth rather than thousands of shallow entries.</p></section>
<div class="directory">${makers.map(m => `<a href="${makerPath(m)}">${esc(m.name)} <small>${m.families.map(f => esc(f.name.replace(m.name + ' ', ''))).join(', ')}</small></a>`).join('')}</div>`;
  return { path: '/manufacturers/', html: layout({ title: `Car manufacturers — ${SITE}`, description: `Manufacturers in ${SITE}: ${makers.map(m => m.name).join(', ')}. Browse their model families, generations and facelifts.`, path: '/manufacturers/', body, ctx, active: 'makers', jsonld: [crumbsLd([['/', 'Home'], ['/manufacturers/', 'Manufacturers']])] }) };
}

export function makerPage(db, m) {
  const ctx = new Ctx(db);
  const cr = [['/', 'Home'], ['/manufacturers/', 'Manufacturers'], [makerPath(m), m.name]];
  const gens = m.families.flatMap(f => f.generations);
  const body = `${crumbs(cr)}
<section class="page-head"><div class="eyebrow">Manufacturer</div><h1>${esc(m.name)}</h1>
<p class="lede">${plural(m.families.length, 'model family', 'model families')} and ${plural(gens.length, 'generation')} documented here. ${m.newsroom ? `Official press site: ${ext(m.newsroom, hostOf(m.newsroom))}.` : ''}</p></section>
${m.families.map(f => `<section class="maker-family"><div class="section-top"><div><h2><a href="${f.path}">${esc(f.name)}</a></h2></div><a class="line-link" href="${f.path}">Timeline and sources</a></div>${timeline(db, f)}
<div class="grid">${f.generations.map(g => card(ctx, g)).join('')}</div></section>`).join('')}`;
  return { path: makerPath(m), html: layout({ title: `${m.name} SUVs: generations and facelifts — ${SITE}`, description: `${m.name} in ${SITE}: ${m.families.map(f => f.name).join(', ')} — every documented generation with production years, market versions and sourced specifications.`, path: makerPath(m), body, ctx, active: 'makers', jsonld: [crumbsLd(cr)] }) };
}

export function familyPage(db, fam) {
  const ctx = new Ctx(db), refs = new Refs();
  const cr = [['/', 'Home'], [makerPath(fam.maker), fam.maker.name], [fam.path, fam.name]];
  const gens = fam.generations;
  const names = [...new Set(gens.flatMap(g => (g.names || []).map(n => n.value)))];
  const body = `${crumbs(cr)}
<section class="page-head fam-head"><div class="eyebrow">${esc(fam.maker.name)} · model family</div><h1>${esc(fam.name)}</h1>
<p class="lede">${plural(gens.length, 'generation')} documented${fam.lines.length > 1 ? ` across ${fam.lines.length} model lines (${fam.lines.map(l => esc(l.name)).join(' and ')}) — specifications are kept separate by market` : ''}. ${names.length > 1 ? `Sold as ${esc(names.join(', '))} depending on market. ` : ''}Production years below; model years are listed on each generation page.</p>
<div class="actions">${saveBtn('family', fam.id, fam.name, fam.path)}</div></section>
${timeline(db, fam)}
<section aria-labelledby="gens-h"><h2 id="gens-h" class="sr">Generations</h2><div class="gen-list">${gens.map(g => {
  const im = leadImage(g);
  return `<article class="gen-row" id="${esc(g.slug)}">${im ? figure(ctx, g, im) : `<div class="placeholder"><b>${esc(shortName(g))}</b><span>No photo yet</span></div>`}
<div><div class="eyebrow">${esc(g.name)}${g.lines.length < fam.lines.length && fam.lines.length > 1 ? ' · ' + esc(g.lines.map(l => fam.lines.find(x => x.id === l)?.name).join(', ')) + ' line' : ''}</div>
<h3><a href="${g.path}">${esc(genTitle(fam, g))}</a></h3>
<p><b>Production:</b> ${g.dates?.productionStart ? esc(period(g)) + refs.ref(fam, g.dates.productionStart) : notDoc}${namesBrief(g)}</p>
${(g.revisions || []).length ? `<p><b>Revisions:</b> ${g.revisions.map(r => `<a href="${g.path}#${revisionAnchor(r)}">${esc(revLabel(r))}</a>`).join(', ')}</p>` : ''}
<p class="tags">${[...bodyGroupsOf(g), ...fuelsOf(g).map(x => FUEL_LABEL[x]), ...(seatsOf(g).length ? [seatsOf(g).join('/') + ' seats'] : [])].map(t => `<span>${esc(t)}</span>`).join('')}</p>
<p>${predecessors(g).map(p => `<a class="line-link" href="${comparePath(p, g)}">What changed from the ${esc(shortName(p))}</a>`).join(' ')}</p></div></article>`;
}).join('')}</div></section>
${refs.html()}`;
  return { path: fam.path, html: layout({ title: `${fam.name} generations: timeline, facelifts and what changed — ${SITE}`, description: `${fam.name}: all ${gens.length} generations (${gens.map(g => shortName(g)).join(', ')}) with production years, facelifts, market names and sourced specifications.`, path: fam.path, body, ctx, jsonld: [crumbsLd(cr)], image: leadImage(gens.at(-1))?.src }) };
}

export function generationPage(db, g) {
  const ctx = new Ctx(db), refs = new Refs();
  const fam = g.family;
  const title = genTitle(fam, g);
  const cr = [['/', 'Home'], [makerPath(fam.maker), fam.maker.name], [fam.path, fam.name], [g.path, shortName(g)]];
  const imgs = g.images || [];
  const lead = leadImage(g);
  const prev = predecessors(g), next = successors(g);
  const changes = prev.map(p => `<section class="what-changed" aria-labelledby="wc-${esc(p.slug)}"><h2 id="wc-${esc(p.slug)}">What changed from the ${esc(shortName(p))}</h2>
${changeList(refs, fam, changesVs(g, p)) || '<p class="nd-block">No sourced list of changes yet.</p>'}
<p><a class="line-link" href="${comparePath(p, g)}">Side-by-side comparison with the ${esc(shortName(p))}</a></p></section>`).join('');
  const others = imgs.filter(i => i !== lead);
  const body = `${crumbs(cr)}
<section class="page-head gen-head"><div class="eyebrow">${esc(fam.name)} · ${esc(g.name)} · production ${esc(period(g))}</div><h1>${esc(title)}</h1>
<div class="actions">${saveBtn('generation', g.id, title, g.path)} ${compareBtn(g)} ${fixLink(g.id)}</div></section>
<div class="gen-top">${lead ? figure(ctx, g, lead, { big: true, eager: true }) : '<div class="placeholder big"><b>No photo yet</b><span><a href="/suggest/?type=source" rel="nofollow">Suggest a freely licensed photo</a></span></div>'}
<section aria-labelledby="facts-h"><h2 id="facts-h">Key facts</h2>${factRows(refs, g)}</section></div>
${others.length ? `<section aria-labelledby="ph-h"><h2 id="ph-h">Photos</h2><div class="photo-row">${others.map(im => figure(ctx, g, im)).join('')}</div></section>` : ''}
${changes}
${revisionsBlock(ctx, refs, g)}
<section aria-labelledby="dim-h"><h2 id="dim-h">Dimensions</h2>${dimsTable(refs, g)}${cargoTable(refs, g)}</section>
<section aria-labelledby="pt-h"><h2 id="pt-h">Powertrains</h2>${powertrainTable(refs, g)}</section>
${(g.notes || []).length ? `<section aria-labelledby="notes-h"><h2 id="notes-h">Notes</h2><ul class="notes">${g.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
<nav class="gen-nav" aria-label="Other generations">${prev.map(p => `<a href="${p.path}">‹ ${esc(genTitle(fam, p))}</a>`).join('')}<a href="${fam.path}">All ${esc(fam.name)} generations</a>${next.map(n => `<a href="${n.path}">${esc(genTitle(fam, n))} ›</a>`).join('')}</nav>
${refs.html()}`;
  const ld = { '@context': 'https://schema.org', '@type': 'Car', name: title, brand: { '@type': 'Brand', name: fam.maker.name }, model: fam.name.replace(fam.maker.name + ' ', ''),
    url: ORIGIN + g.path };
  if (yearOf(g.dates?.productionStart)) ld.productionDate = String(yearOf(g.dates.productionStart));
  if (g.bodyStyles?.length) ld.bodyType = g.bodyStyles.map(b => b.value).join(', ');
  if (g.seating?.options?.length === 1) ld.vehicleSeatingCapacity = g.seating.options[0];
  if (lead) ld.image = ORIGIN + '/' + lead.src;
  const desc = `${title} (${g.name.toLowerCase()}, production ${period(g)}): ${[
    (g.revisions || []).length && plural(g.revisions.length, 'facelift or update', 'facelifts and updates'),
    g.dimensions?.length && 'dimensions by market', g.powertrains?.length && plural(g.powertrains.length, 'powertrain'),
    prev.length && 'what changed from the ' + shortName(prev[0])].filter(Boolean).join(', ')} — every figure linked to its source.`;
  return { path: g.path, html: layout({ title: `${title} (${period(g)}) — specifications and what changed — ${SITE}`, description: desc, path: g.path, body, ctx, jsonld: [crumbsLd(cr), ld], image: lead?.src }) };
}

export function pairPage(db, { prev, next }) {
  const ctx = new Ctx(db), refs = new Refs();
  const fam = next.family;
  const path = comparePath(prev, next);
  const cr = [['/', 'Home'], [makerPath(fam.maker), fam.maker.name], [fam.path, fam.name], [path, `${shortName(prev)} vs ${shortName(next)}`]];
  const cd = commonDims([prev, next]);
  const derived = derivedChanges(prev, next);
  const im = [prev, next].map(leadImage);
  const body = `${crumbs(cr)}
<section class="page-head"><div class="eyebrow">What changed? · ${esc(fam.name)}</div><h1>${esc(shortName(prev))} <em>→</em> ${esc(shortName(next))}</h1>
<p class="lede">${esc(genTitle(fam, prev))} (${esc(period(prev))}) compared with its successor, the ${esc(genTitle(fam, next))} (${esc(period(next))}).</p></section>
<div class="pair-photos">${[prev, next].map((g, i) => im[i] ? figure(ctx, g, im[i]) : `<div class="placeholder"><b>${esc(shortName(g))}</b><span>No photo yet</span></div>`).join('')}</div>
<section aria-labelledby="src-ch"><h2 id="src-ch">Changes stated by the sources</h2>${changeList(refs, fam, changesVs(next, prev)) || '<p class="nd-block">No sourced list of changes yet. ' + fixLink(next.id, 'Suggest a source') + '</p>'}</section>
${cd ? `<section aria-labelledby="dim-ch"><h2 id="dim-ch">Size</h2><p>${cd.values.map(v => `${DIM_LABEL[v.key]} ${num(v.mm[0])} → ${num(v.mm[1])} mm${delta(v.mm[1] - v.mm[0])}`).join('; ')}.</p>
<p class="hint">${esc(MARKET_LABEL[cd.market] || cd.market)} figures${cd.market === 'unstated' ? ' (neither source states the market)' : ''}: ${esc(cd.records[0].version || 'as published')}${refs.ref(fam, cd.records[0])} against ${esc(cd.records[1].version || 'as published')}${refs.ref(fam, cd.records[1])}.</p></section>` : ''}
${derived.length ? `<section aria-labelledby="dv-ch"><h2 id="dv-ch">From the documented specifications</h2><ul class="changes">${derived.map(d => `<li><span class="topic">${esc(TOPIC_LABEL[d.topic])}</span> ${esc(d.text)}</li>`).join('')}</ul><p class="hint">Derived by comparing the sourced lists on the two generation pages; a type missing from a list may also mean it is not documented here yet.</p></section>` : ''}
<section aria-labelledby="side-h"><h2 id="side-h">Side by side</h2>${compareTable(refs, [prev, next])}<p><a class="line-link" href="/compare/?g=${encodeURIComponent(prev.id)},${encodeURIComponent(next.id)}">Add a third generation to this comparison</a></p></section>
${refs.html()}`;
  return { path, html: layout({ title: `${fam.name} ${shortName(prev)} vs ${shortName(next)}: what changed — ${SITE}`, description: `What changed from the ${genTitle(fam, prev)} (${period(prev)}) to the ${genTitle(fam, next)} (${period(next)}): sourced changes, like-for-like dimensions and powertrains, side by side.`, path, body, ctx, jsonld: [crumbsLd(cr)], image: im[1]?.src }) };
}

export function carsPage(db) {
  const ctx = new Ctx(db);
  const gens = [...db.gens.values()].sort((a, b) => a.family.name.localeCompare(b.family.name) || (startYear(a) ?? 0) - (startYear(b) ?? 0));
  const count = (fn, v) => gens.filter(g => fn(g).includes(v)).length;
  const group = (name, key, values, label = v => v) => {
    const vs = values.filter(v => count(gx => ({ body: bodyGroupsOf, fuel: fuelsOf, seats: g => seatsOf(g).map(String), drive: drivesOf })[key](gx), v));
    if (!vs.length) return '';
    return `<fieldset class="filter-group"><legend>${name}</legend>${vs.map(v => `<button type="button" class="chip" data-filter-key="${key}" data-filter-value="${esc(v)}" aria-pressed="false">${esc(label(v))}</button>`).join('')}</fieldset>`;
  };
  const allSeats = [...new Set(gens.flatMap(seatsOf))].sort((a, b) => a - b).map(String);
  const body = `${crumbs([['/', 'Home'], ['/cars/', 'All generations']])}
<section class="page-head"><div class="eyebrow">Explore</div><h1>All generations</h1><p class="lede">${plural(gens.length, 'generation')} of ${plural(db.families.size, 'model family', 'model families')}. Filters use the documented body styles, powertrains, seating and drivetrains; a generation without data for a filter is left out while that filter is on.</p></section>
<div class="filters-panel" id="filters" hidden>
${group('Body style', 'body', BODY_GROUPS)}
${group('Powertrain', 'fuel', Object.keys(FUEL_LABEL), v => FUEL_LABEL[v])}
${group('Seats', 'seats', allSeats, v => v + ' seats')}
${group('Drive', 'drive', ['FWD', 'RWD', 'AWD', '4WD'], v => DRIVE_LABEL[v])}
<p class="filter-status" aria-live="polite"></p></div>
<div class="grid" id="gen-grid">${gens.map(g => card(ctx, g)).join('')}</div>`;
  return { path: '/cars/', html: layout({ title: `All car generations — filter by body, powertrain and seats — ${SITE}`, description: `Every generation in ${SITE}: ${gens.length} generations of ${db.families.size} SUV families, filterable by body style, powertrain, seating and drivetrain.`, path: '/cars/', body, ctx, active: 'cars', jsonld: [crumbsLd([['/', 'Home'], ['/cars/', 'All generations']])] }) };
}

export function comparePage(db) {
  const ctx = new Ctx(db);
  const pairs = [...db.families.values()].flatMap(f => f.pairs);
  const body = `${crumbs([['/', 'Home'], ['/compare/', 'Compare']])}
<section class="page-head"><div class="eyebrow">Compare</div><h1>Compare generations</h1><p class="lede">Choose up to three generations. Values from different markets are never merged: dimensions are compared only when every generation has figures for the same market and body.</p></section>
<div id="compare-app" hidden>
  <form class="compare-pick" id="comparePick"><label>Add a generation <select id="compareAdd"><option value="">Choose…</option>${[...db.families.values()].map(f => `<optgroup label="${esc(f.name)}">${f.generations.map(g => `<option value="${esc(g.id)}">${esc(genTitle(f, g))} · ${esc(period(g))}</option>`).join('')}</optgroup>`).join('')}</select></label>
  <span class="chosen" id="compareChosen"></span></form>
  <div id="compareOut"><p class="hint">Pick generations above, use “+ Compare” on any generation page, or compare the generations in your Dream garage.</p></div>
</div>
<noscript><p class="notice">The interactive comparison needs JavaScript. Every pair of consecutive generations has its own comparison page, listed below.</p></noscript>
<h2>Consecutive generations</h2>
<ul class="pair-list">${pairs.map(p => `<li><a href="${comparePath(p.prev, p.next)}"><b>${esc(p.next.family.name)}</b> ${esc(shortName(p.prev))} → ${esc(shortName(p.next))}</a></li>`).join('')}</ul>`;
  return { path: '/compare/', html: layout({ title: `Compare car generations side by side — ${SITE}`, description: `Compare up to three car generations side by side: production years, model years, body styles, seating, like-for-like dimensions, luggage capacity and powertrains, each with its source.`, path: '/compare/', body, ctx, active: 'compare' }) };
}

export function yearsPage(db, years) {
  const ctx = new Ctx(db);
  const decades = new Map();
  for (const y of years) { const d = Math.floor(y / 10) * 10; if (!decades.has(d)) decades.set(d, []); decades.get(d).push(y); }
  const body = `${crumbs([['/', 'Home'], ['/years/', 'Years']])}
<section class="page-head"><div class="eyebrow">Browse by year</div><h1>Years</h1><p class="lede">Each year page lists what happened in that <b>calendar year</b> — reveals, production starts, facelifts and production ends — and, separately, which generations were sold as that <b>model year</b> in markets that use model years (mainly North America). A model year often starts in the previous calendar year. Only years with at least one documented event have a page.</p></section>
${[...decades].sort((a, b) => b[0] - a[0]).map(([d, ys]) => `<section class="decade"><h2>${d}s</h2><div class="chips">${ys.sort((a, b) => a - b).map(y => `<a class="chip" href="/years/${y}/">${y}</a>`).join('')}</div></section>`).join('')}`;
  return { path: '/years/', html: layout({ title: `Car generations by year — calendar years and model years — ${SITE}`, description: `Browse ${SITE} by year: reveals, launches, facelifts and production ends by calendar year, kept separate from model years.`, path: '/years/', body, ctx, active: 'years', jsonld: [crumbsLd([['/', 'Home'], ['/years/', 'Years']])] }) };
}

export function yearPage(db, y, events, years) {
  const ctx = new Ctx(db), refs = new Refs();
  const path = `/years/${y}/`;
  const cr = [['/', 'Home'], ['/years/', 'Years'], [path, String(y)]];
  const label = { revealed: 'First shown', 'production-start': 'Production started', revision: 'Facelift or update', 'production-end': 'Production ended' };
  const order = ['revealed', 'production-start', 'revision', 'production-end'];
  const evs = [...events].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || String(a.fact?.value).localeCompare(String(b.fact?.value)));
  const prod = inProduction(db, y);
  const my = modelYearGens(db, y);
  const i = years.indexOf(y);
  const body = `${crumbs(cr)}
<section class="page-head"><div class="eyebrow">Calendar year</div><h1>${y}</h1><p class="lede">${plural(evs.length, 'documented event')} in calendar year ${y}, ${plural(prod.length, 'generation')} in production, ${my.length ? plural(new Set(my.map(x => x.g.id)).size, 'generation') + ` sold as model year ${y}` : `no model-year ${y} data`}.</p></section>
<section aria-labelledby="ev-h"><h2 id="ev-h">Events in calendar year ${y}</h2><ul class="events">${evs.map(e => `<li><span class="kind">${label[e.type]}</span> <a href="${e.g.path}${e.r ? '#' + revisionAnchor(e.r) : ''}">${esc(genTitle(e.g.family, e.g))}${e.r ? ' — ' + esc(e.r.name) : ''}</a> <span class="muted">${esc(fmtDate(e.fact?.value))}${e.fact?.event ? ', ' + esc(e.fact.event) : ''}</span>${refs.ref(e.g.family, e.fact)}</li>`).join('')}</ul></section>
<section aria-labelledby="pr-h"><h2 id="pr-h">In production during ${y}</h2><p class="hint">Production years from the sources; a generation counts if ${y} falls within its first and last production year.</p><div class="grid">${prod.map(g => card(ctx, g)).join('')}</div></section>
<section aria-labelledby="my-h"><h2 id="my-h">Sold as model year ${y}</h2>${my.length ? `<ul class="events">${my.map(({ g, m }) => `<li><a href="${g.path}">${esc(genTitle(g.family, g))}</a> <span class="muted">model years ${myRange(g, m)}, ${esc(MARKET_LABEL[m.market] || m.market)}</span>${refs.ref(g.family, m)}</li>`).join('')}</ul>` : `<p class="nd-block">No generation in the archive has documented model-year ${y} data.</p>`}</section>
<nav class="gen-nav" aria-label="Other years">${i > 0 ? `<a href="/years/${years[i - 1]}/">‹ ${years[i - 1]}</a>` : ''}<a href="/years/">All years</a>${i < years.length - 1 ? `<a href="/years/${years[i + 1]}/">${years[i + 1]} ›</a>` : ''}</nav>
${refs.html()}`;
  return { path, html: layout({ title: `${y}: car reveals, launches and facelifts — ${SITE}`, description: `${y} in ${SITE}: ${evs.slice(0, 4).map(e => `${genTitle(e.g.family, e.g)} ${label[e.type].toLowerCase()}`).join('; ')}${evs.length > 4 ? '…' : ''}. Calendar-year events and model year ${y} listed separately.`, path, body, ctx, active: 'years', jsonld: [crumbsLd(cr)] }) };
}

export function searchPage(db) {
  const ctx = new Ctx(db);
  const body = `<section class="page-head"><div class="eyebrow">Search</div><h1 id="search-title">Search</h1>
<form class="search-big" action="/search/" method="get" role="search"><label for="q" class="sr">Search</label><input id="q" name="q" type="search" placeholder="Manufacturer, model, generation code or year"><button type="submit">Search</button></form>
<p class="lede">Search by manufacturer, model (including market names such as Rogue or ix35), generation code (E70, XA50, 4M) or year — a year matches generations in production that year and, separately, model years.</p></section>
<div id="search-results" aria-live="polite"></div>
<noscript><p class="notice">Search needs JavaScript. Browse <a href="/manufacturers/">manufacturers</a>, <a href="/cars/">all generations</a> or <a href="/years/">years</a> instead.</p></noscript>`;
  return { path: '/search/', html: layout({ title: `Search — ${SITE}`, description: `Search ${SITE} by manufacturer, model, generation code or year.`, path: '/search/', noindex: true, body, ctx }) };
}

export function garagePage(db) {
  const ctx = new Ctx(db);
  const body = `${crumbs([['/', 'Home'], ['/garage/', 'Dream garage']])}
<section class="page-head"><div class="eyebrow">Saved in this browser</div><h1>Dream garage</h1>
<p class="lede">Model families and generations you save are kept in this browser only — no account, nothing sent with your name. Compare up to three saved generations side by side.</p></section>
<div id="garage" hidden><div id="garage-list"></div><p><button type="button" class="btn" id="garageCompare" disabled>Compare saved generations</button></p></div>
<noscript><p class="notice">The Dream garage needs JavaScript (it is stored in your browser).</p></noscript>
<section class="prose"><h2>Personal saves and public counts</h2>
<p>Your Dream garage is private to this browser. Separately, when you save something we add one to an anonymous public count for it, which feeds <a href="/popular/">Popular in dream garages</a>. That count is per browser, not per person — clearing your browser or using another device counts again — so it is a rough signal of interest, not a vote or a rating. Removing an item from your garage removes your count.</p></section>`;
  return { path: '/garage/', html: layout({ title: `Dream garage — ${SITE}`, description: `Your saved model families and generations in ${SITE}, stored in this browser.`, path: '/garage/', noindex: true, body, ctx, active: 'garage' }) };
}

export function popularPage(db) {
  const ctx = new Ctx(db);
  const body = `${crumbs([['/', 'Home'], ['/popular/', 'Popular in dream garages']])}
<section class="page-head"><div class="eyebrow">Visitor interest</div><h1>Popular in dream garages</h1>
<p class="lede">How many browsers have saved each model family or generation. This is anonymous visitor interest — not sales, quality, reliability or a review — and it is never mixed with the archive's documented facts.</p></section>
<div class="chips" role="group" aria-label="Period"><button type="button" class="chip" data-window="30d" aria-pressed="true">Saved in the last 30 days</button><button type="button" class="chip" data-window="all" aria-pressed="false">All time</button></div>
<div id="popular-out" aria-live="polite"><p class="hint">Loading…</p></div>
<noscript><p class="notice">This list loads from the counting service and needs JavaScript.</p></noscript>
<section class="prose"><h2>How it is counted</h2><ul>
<li>One count per browser per item; saving again changes nothing, and removing it from the garage removes the count.</li>
<li>“Last 30 days” counts saves made in the last 30 days that are still in a garage; “All time” counts every current save.</li>
<li>Items with fewer than 3 saves are not listed. At most 20 browsers per network per day are counted, to limit automated inflation.</li>
<li>Counts are anonymous: we store a one-way hash of a random browser id, never your name or address.</li></ul></section>`;
  return { path: '/popular/', html: layout({ title: `Popular in dream garages — ${SITE}`, description: `The model families and generations most often saved to visitors' Dream garages in ${SITE} — anonymous interest, not a rating.`, path: '/popular/', body, ctx }) };
}

export function suggestPage(db) {
  const ctx = new Ctx(db);
  const makers = [...db.makers.values()].filter(m => m.families.length);
  const body = `${crumbs([['/', 'Home'], ['/suggest/', 'Suggest']])}
<section class="page-head"><div class="eyebrow">Contribute</div><h1>Suggest a car, a source or a correction</h1>
<p class="lede">Suggestions are private until an editor has checked the source. Nothing is published automatically, and links are checked by a person — the site never fetches them for you.</p></section>
<p class="notice" id="sent-notice" hidden>Thank you — your suggestion is in the review queue.</p>
<form class="suggest" id="suggestForm" action="/api/submissions" method="post">
  <fieldset><legend>What would you like to send?</legend>
    <label><input type="radio" name="type" value="car" checked> Suggest a car — a missing model, generation or version</label>
    <label><input type="radio" name="type" value="source"> Suggest a source or a photo — a manufacturer page, brochure, or a freely licensed photo</label>
    <label><input type="radio" name="type" value="correction"> Report a correction — something on a page is wrong or mixed up</label>
  </fieldset>
  <label>Manufacturer <input name="make" list="makers" maxlength="60" required autocomplete="off"></label>
  <datalist id="makers">${makers.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
  <label>Model <input name="model" maxlength="80" required placeholder="e.g. Q7, X-Trail, Rogue"></label>
  <label>Generation or version <span class="opt">(optional)</span> <input name="generation" maxlength="80" placeholder="e.g. 4M, second generation, 2019 facelift"></label>
  <div class="row2"><label>Market <span class="opt">(optional)</span> <input name="market" maxlength="60" placeholder="e.g. Europe, US, Japan"></label>
  <label>Year <span class="opt">(optional)</span> <input name="year" inputmode="numeric" pattern="(19|20)[0-9]{2}" maxlength="4" placeholder="YYYY"></label></div>
  <label>Is that a model year or a calendar year? <select name="yearKind"><option value="">Not sure / not applicable</option><option value="model">Model year</option><option value="calendar">Calendar / production year</option></select></label>
  <label>Source link <span class="opt">(required for a correction)</span> <input name="sourceUrl" type="url" maxlength="500" placeholder="https://…"></label>
  <label class="photo-only">Photo page <span class="opt">(Wikimedia Commons file page or a manufacturer media page that allows reuse)</span> <input name="photoUrl" type="url" maxlength="500" placeholder="https://commons.wikimedia.org/wiki/File:…"></label>
  <label>What should change, and what does the source say? <textarea name="note" maxlength="2000" rows="5" required></textarea></label>
  <input type="hidden" name="target" value=""><input type="hidden" name="page" value=""><input type="hidden" name="ts" value="">
  <label class="hp" aria-hidden="true">Leave empty <input name="website" tabindex="-1" autocomplete="off"></label>
  <p class="hint">We store your suggestion and a daily-rotating, one-way network code used only to limit spam. No name or email is needed. Please do not upload or paste copyrighted photos: send a link to a page that states the licence.</p>
  <button type="submit" class="btn">Send for review</button> <span class="form-status" aria-live="polite"></span>
</form>`;
  return { path: '/suggest/', html: layout({ title: `Suggest a car, source or correction — ${SITE}`, description: `Suggest a missing car, a better source or photo, or report a correction to ${SITE}. Reviewed by an editor before anything changes.`, path: '/suggest/', noindex: true, body, ctx }) };
}

export function aboutPage(db, stats) {
  const ctx = new Ctx(db);
  const body = `${crumbs([['/', 'Home'], ['/about/', 'About']])}
<section class="page-head"><div class="eyebrow">About</div><h1>About ${SITE}</h1></section>
<div class="prose">
<p>${SITE} is an independent visual reference to how cars change from generation to generation. It starts with ${stats.families} SUV model families — ${[...db.families.values()].map(f => esc(f.name)).join(', ')} — covered in depth: ${stats.generations} generations, ${stats.revisions} facelifts and updates and ${num(stats.facts)} sourced facts from ${stats.sources} sources.</p>
<h2>How the data is kept honest</h2>
<ul>
<li><b>Every fact has a source.</b> Each date, dimension, capacity and powertrain links to the page it comes from; a checker re-reads every source and confirms the quoted passage is there and states the figure.</li>
<li><b>Manufacturer sources first</b> (press releases, media sites, brochures, specification sheets), then reference works and the motoring press to fill gaps. Wikipedia is cited by the exact revision read.</li>
<li><b>Markets are kept apart.</b> A US-market figure and a European figure are separate rows. Comparisons only set dimensions side by side when every generation has figures for the same market and body.</li>
<li><b>Three kinds of date.</b> “First shown” is the reveal; “production” is factory production; “model years” are a market's designation (mainly North America) and often begin in the previous calendar year.</li>
<li><b>Unknown is labelled, not guessed.</b> “Not documented here” means we have no sourced figure yet.</li>
<li><b>No opinions or ratings.</b> We do not publish driving impressions, reliability ratings, crash-test results, prices or running costs.</li>
<li><b>Photos match the car.</b> Photos come from Wikimedia Commons under free licences, chosen from categories for the specific generation or facelift; a photo that only shows the generation in general is labelled “Representative image”. See <a href="/credits/">image credits</a>.</li>
</ul>
<h2>Corrections</h2>
<p>Spotted a mistake or a missing car? <a href="/suggest/" rel="nofollow">Send a suggestion</a> with a source link. Suggestions are reviewed before anything changes, and accepted corrections are kept in a separate correction file so they survive future data updates.</p>
<h2>Units</h2>
<p>Figures are shown in the unit the source uses, with our conversion in brackets: millimetres and inches; kilowatts, metric horsepower (PS) and SAE horsepower (hp); newton-metres and pound-feet; litres and cubic feet. Luggage volumes measured by the European VDA (ISO 3832) method and the North American SAE method are not comparable.</p>
</div>`;
  return { path: '/about/', html: layout({ title: `About ${SITE}`, description: `How ${SITE} sources its car data: manufacturer sources first, every fact linked and checked, markets kept apart, and no ratings or opinions.`, path: '/about/', body, ctx }) };
}

export function creditsPage(db) {
  const ctx = new Ctx(db);
  const rows = [];
  for (const g of db.gens.values()) for (const im of g.images || []) rows.push({ g, im });
  const body = `${crumbs([['/', 'Home'], ['/credits/', 'Image credits']])}
<section class="page-head"><div class="eyebrow">Credits</div><h1>Image credits</h1><p class="lede">${plural(rows.length, 'photo')}, all from Wikimedia Commons under the licences listed. Each photo was chosen from a Commons category for that specific generation or facelift; the evidence is listed with it. Photos are resized; no other changes are made.</p></section>
<div class="table-wrap"><table class="spec credits"><thead><tr><th scope="col">Photo</th><th scope="col">Shows</th><th scope="col">Author</th><th scope="col">Licence</th><th scope="col">Why we think it shows this car</th></tr></thead><tbody>
${rows.map(({ g, im }) => `<tr><td><a href="${g.path}"><img src="/${esc(im.thumb || im.src)}" alt="" loading="lazy" width="120"></a></td><td><a href="${g.path}">${esc(imageCaption(g, im))}</a>${im.representative ? ' <span class="rep-tag">Representative image</span>' : ''}</td><td>${esc(im.author || 'unknown')}</td><td>${im.licenseUrl ? `<a href="${esc(im.licenseUrl)}" rel="license noopener nofollow" target="_blank">${esc(im.license)}</a>` : esc(im.license)}</td><td>${esc(im.evidence || '')} ${im.page ? ext(im.page, 'file page') : ''}</td></tr>`).join('')}
</tbody></table></div>`;
  return { path: '/credits/', html: layout({ title: `Image credits — ${SITE}`, description: `Authors, licences and identification evidence for every photo in ${SITE}, all from Wikimedia Commons.`, path: '/credits/', body, ctx }) };
}

export function privacyPage(db) {
  const ctx = new Ctx(db);
  const body = `${crumbs([['/', 'Home'], ['/privacy/', 'Privacy']])}
<section class="page-head"><div class="eyebrow">Privacy and copyright</div><h1>Privacy</h1></section>
<div class="prose">
<h2>What stays in your browser</h2>
<p>Your Dream garage, your comparison selection and a random browser id are stored in your browser's local storage. They are not cookies and are not sent anywhere except as described below. Clearing site data removes them.</p>
<h2>What we store on our server</h2>
<ul>
<li><b>Dream garage counts:</b> when you save an item, we store a one-way hash of your random browser id, the item and the time, so the public count can go up and down without counting you twice. We cannot turn the hash back into the id.</li>
<li><b>Spam limits:</b> a code derived from your network address and a secret that changes every day, kept for two days, used only to limit how often a network can save items or send suggestions. Your address itself is not stored.</li>
<li><b>Suggestions:</b> the fields you fill in, the page you sent it from, the time and the daily network code. Suggestions are visible only to editors and are never published as you wrote them.</li>
</ul>
<p>We use no advertising, no tracking cookies and no third-party analytics scripts. Our host, Cloudflare, processes requests to deliver the site.</p>
<h2>Photos and text</h2>
<p>Photos are from Wikimedia Commons under the free licences shown with each one (see <a href="/credits/">image credits</a>). Specifications and dates are facts taken from the linked sources; descriptions of changes are our own short summaries. Trademarks belong to their owners; ${SITE} is not affiliated with any manufacturer. If you believe something here should be removed, <a href="/suggest/?type=correction" rel="nofollow">tell us through the correction form</a>.</p>
</div>`;
  return { path: '/privacy/', html: layout({ title: `Privacy — ${SITE}`, description: `What ${SITE} stores: your Dream garage stays in your browser; anonymous counts and suggestions are kept minimal. No ads or tracking.`, path: '/privacy/', body, ctx }) };
}

export function notFoundPage(db) {
  const ctx = new Ctx(db);
  const body = `<section class="page-head"><div class="eyebrow">404</div><h1>Page not found</h1><p class="lede">This address is not part of ${SITE}. Pages from the earlier website at this address were retired and are not redirected.</p>
<p><a class="line-link" href="/">Home</a> · <a class="line-link" href="/manufacturers/">Manufacturers</a> · <a class="line-link" href="/search/">Search</a></p></section>`;
  return { path: '/404.html', html: layout({ title: `Page not found — ${SITE}`, description: `This page does not exist in ${SITE}. Browse manufacturers, generations or search the archive.`, path: '/404.html', noindex: true, body, ctx }) };
}

// re-exported for the build
export { yearEvents };
