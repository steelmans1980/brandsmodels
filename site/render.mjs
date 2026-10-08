// HTML for every page, rendered at build time. Each page is complete without JavaScript; site/client.js adds the
// photo viewer, timeline filters, favourites, saved appearances, search and the ranking selector.
import {
  SITE, ORIGIN, KINDS, KIND_LABEL, KIND_PLURAL, TYPE_LABEL, CLASS_LABEL, CLASS_HELP,
  slug, norm, dated, seasonOf, label, plural, range, byNewest, seasonRank, photosOf, otherPhotos,
  appearanceClass, appearancesOf, earliest, brandPath, modelPath, rankModels, savedId
} from './lib.mjs';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const src = s => /^https?:/.test(s) ? s : '/' + String(s).replace(/^\/+/, '');
const groupBy = (items, key) => { const m = new Map(); for (const it of items) { const k = key(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); } return m; };

// ---------- page context: what the viewer needs about the photos on this page ----------
export class Ctx {
  constructor(db, extras) { this.db = db; this.credits = new Map(); this.press = new Map(); this.extras = extras || {}; }
  use(c) {
    if (c.images.length && !this.credits.has(c.id)) {
      this.credits.set(c.id, { id: c.id, brand: c.brand, brandPath: this.brandPath(c.brand), label: label(c), talent: c.talent,
        photographer: c.photographer || '', sources: c.sources, images: c.images.map(i => ({ src: src(i.src), talent: i.talent, from: i.from || '', credit: i.credit || '' })) });
    }
  }
  usePress(m) { if (m.press?.length) this.press.set(m.slug, { name: m.name, items: m.press.map(k => ({ ...k, src: src(k.src) })) }); }
  brandPath(name) { const b = this.db.brands.get(slug(name)); return b ? brandPath(b) : `/brand/${slug(name)}/`; }
  data() { return { credits: Object.fromEntries(this.credits), press: Object.fromEntries(this.press), ...this.extras }; }
}

const brandLink = (ctx, name) => `<a href="${ctx.brandPath(name)}">${esc(name)}</a>`;
const modelLink = name => `<a href="${modelPath(name)}">${esc(name)}</a>`;
const list = names => names.map(modelLink).join(', ');
const sourceLinks = srcs => srcs.map(s => `<a href="${esc(s.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(s.name || hostOf(s.url))} ↗</a>`).join(' · ');
const sources = c => c.sources.length ? `<div class="sources">Source: ${sourceLinks(c.sources)}</div>` : '';
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
const kindBadge = c => `<span class="kind kind-${esc(c.kind)}">${KIND_LABEL[c.kind]}</span>`;
const classBadge = cls => `<span class="cls cls-${cls}" title="${esc(CLASS_HELP[cls])}">${CLASS_LABEL[cls]}</span>`;
const credits = c => [
  c.title ? `<p><em>${esc(c.title)}</em></p>` : '',
  c.photographer ? `<p>Photography: ${esc(c.photographer)}</p>` : '',
  c.note ? `<p>${esc(c.note)}</p>` : ''
].join('');
const altText = (c, img) => img.talent.length ? `${img.talent.join(', ')} for ${c.brand}, ${label(c)}` : `${c.brand}, ${label(c)}: campaign photo, models not identified individually`;
const photoTag = (ctx, c, img) => { ctx.use(c); return `<img src="${esc(src(img.src))}" alt="${esc(altText(c, img))}" loading="lazy" decoding="async" data-c="${c.id}" data-i="${c.images.indexOf(img)}">`; };
const placeholder = c => `<div class="placeholder"><b>${esc(c.brand)}</b><span>${esc(label(c))}</span></div>`;

// A credit's picture for a model: her own attributed photo, else a labelled press photo or portrait, else a title card.
function visual(ctx, c, person) {
  const img = person ? photosOf(c, person)[0] : c.images[0];
  if (img) return photoTag(ctx, c, img);
  const names = person ? [person] : c.talent;
  const pm = names.map(n => ctx.db.models.get(slug(n))).find(m => m?.press?.length);
  if (pm) {
    ctx.usePress(pm);
    const p = pm.press.length;
    const k = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % p;
    return `${placeholder(c)}<span class="over"><img src="${esc(src(pm.press[k].src))}" alt="Press photo of ${esc(pm.name)}" loading="lazy" data-m="${pm.slug}" data-p="${k}"><span class="ptag">Press photo · ${esc(pm.name)}</span></span>`;
  }
  const ps = names.map(n => ctx.db.models.get(slug(n))).filter(m => m?.portrait).slice(0, person ? 1 : 4);
  if (!ps.length) return placeholder(c);
  return `${placeholder(c)}<span class="over portraits n${ps.length}">${ps.map(m => `<img src="${esc(src(m.portrait))}" alt="Portrait of ${esc(m.name)}" loading="lazy" referrerpolicy="no-referrer">`).join('')}<span class="ptag">Model portrait</span></span>`;
}

function gallery(ctx, c, person, max = 6) {
  const imgs = photosOf(c, person);
  if (!imgs.length) return '';
  const shown = imgs.slice(0, max), more = imgs.length - shown.length;
  return `<div class="gallery"${person ? ` data-person="${esc(person)}"` : ''}>${shown.map((img, n) => `<button class="shot" type="button" aria-label="Open photo: ${esc(altText(c, img))}">${photoTag(ctx, c, img)}${n === shown.length - 1 && more > 0 ? `<span class="more">+${more}</span>` : ''}</button>`).join('')}</div>`;
}
function otherLink(ctx, c, person) {
  const rest = person ? otherPhotos(c, person) : [];
  if (!rest.length) return '';
  ctx.use(c);
  return `<p class="hint group-note"><button type="button" class="link-btn" data-campaign-gallery="${c.id}" data-person="${esc(person)}">Other campaign photos (${rest.length})</button> — not identified as ${esc(person)}; each photo shows who is identified in it.</p>`;
}
const saveBtn = (c, person) => `<button type="button" class="save-btn" data-save="${savedId(c, person)}" data-model="${esc(person)}" data-brand="${esc(c.brand)}" data-label="${esc(label(c))}" data-kind="${c.kind}" data-url="${modelPath(person)}#${c.id}" aria-pressed="false"><span aria-hidden="true">☆</span> Save</button>`;
const fixLink = (c, person) => `<a class="fix-link" href="/suggest/?type=correction&amp;record=${c.id}${person ? '&amp;model=' + encodeURIComponent(person) : ''}" rel="nofollow">Report a correction</a>`;

// ---------- layout ----------

export function layout({ title, description, path, noindex = false, jsonld = [], body, ctx, active = '' }) {
  const canonical = ORIGIN + path;
  const nav = [['/models/', 'Models', 'models'], ['/brands/', 'Labels', 'brands'], ['/magazines/', 'Magazines', 'magazines'],
    ['/years/', 'Years', 'years'], ['/most-featured/', 'Most featured', 'featured'], ['/favourites/', 'My favourites', 'favourites']];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${SITE}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 fill=%22%23293829%22/%3E%3Ctext x=%2216%22 y=%2223%22 font-family=%22Georgia%22 font-size=%2220%22 fill=%22%23f6f4ef%22 text-anchor=%22middle%22%3EM%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="/styles.css">
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="logo" href="/">The Model <em>Archive.</em></a>
  <form class="search-form" id="searchForm" role="search" action="/search/" method="get">
    <input id="search" name="q" type="search" placeholder="Search a model, brand or magazine — e.g. Kendall Jenner Calvin Klein" aria-label="Search the archive" autocomplete="off">
  </form>
  <nav aria-label="Main">${nav.map(([h, t, k]) => `<a href="${h}"${active === k ? ' class="active" aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site-footer">
  <span>${SITE} · Independent fashion archive · All content is the property of its respective copyright owners · <a href="/about/">About</a> · <a href="/privacy/">Privacy &amp; copyright</a> · <a href="/suggest/" rel="nofollow">Suggest a missing appearance</a> · <a href="/fan-favourites/">Fan favourites</a></span>
  <span>Archive updated ${esc(fmtDate(ctx.db.updated))}</span>
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
const fmtDate = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
const crumbs = items => `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([h, t], i) => i === items.length - 1 ? `<span aria-current="page">${esc(t)}</span>` : `<a href="${h}">${esc(t)}</a>`).join(' <span aria-hidden="true">›</span> ')}</nav>`;
const crumbsLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([h, t], i) => ({ '@type': 'ListItem', position: i + 1, name: t, item: ORIGIN + h })) });

// Timeline filter: works by toggling [data-kind] entries; without JavaScript every entry shows.
function kindFilter(counts, idPrefix = 'f') {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const btn = (k, text, n) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${k === 'all'}" id="${idPrefix}-${k}">${text}<small>${n}</small></button>`;
  return `<div class="chips filters" role="group" aria-label="Show">${btn('all', 'All', total)}${KINDS.filter(k => counts[k]).map(k => btn(k, KIND_PLURAL[k], counts[k])).join('')}</div>`;
}

// ---------- model page ----------

function entryForModel(ctx, c, m) {
  const cls = appearanceClass(c, m.name);
  const pics = gallery(ctx, c, m.name);
  const others = c.talent.filter(t => t !== m.name);
  return `
    <article class="entry${pics ? ' has-photos' : ''}" id="${c.id}" data-kind="${c.kind}" data-cls="${cls}" data-brand="${slug(c.brand)}">
      ${pics ? '' : `<div class="entry-thumb">${visual(ctx, c, m.name)}</div>`}
      <div>
        <div class="season">${esc(seasonOf(c))}${kindBadge(c)}${classBadge(cls)}</div>
        <h3>${brandLink(ctx, c.brand)}</h3>
        ${others.length ? `<p>With ${list(others)}</p>` : ''}
        ${credits(c)}${sources(c)}${otherLink(ctx, c, m.name)}
        <p class="entry-actions">${saveBtn(c, m.name)} ${fixLink(c, m.name)}</p>
      </div>
      ${pics}
    </article>`;
}

function undatedList(ctx, cs, person) {
  if (!cs.length) return '';
  const rows = [...cs].sort((a, b) => (person ? a.brand : a.talent[0] || '').localeCompare(person ? b.brand : b.talent[0] || ''));
  return `
    <section class="year-block undated" id="undated">
      <h2>Undated relationships</h2>
      <div>
        <p class="hint">${person ? 'Labels she worked with' : 'Models who worked with this label'} where the source gives no year. These are relationships, not dated appearances, and are not counted in rankings.</p>
        <ul class="undated-list">${rows.map(c => {
          const img = person ? photosOf(c, person)[0] : c.images[0];
          return `
          <li id="${c.id}" data-kind="${c.kind}" data-brand="${slug(c.brand)}"${person ? ` data-person="${esc(person)}"` : ''}>${img ? `<span class="row-pic u-pic">${photoTag(ctx, c, img)}</span>` : ''}<span class="who">${person ? brandLink(ctx, c.brand) : list(c.talent)}</span>${kindBadge(c)}
            ${c.title ? `<em>${esc(c.title)}</em>` : ''}${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}
            <span class="src">${sourceLinks(c.sources)}</span>${person ? ` ${otherLink(ctx, c, person)}` : ''}</li>`;
        }).join('')}
        </ul>
      </div>
    </section>`;
}

export function modelPage(db, m, extra) {
  const ctx = new Ctx(db);
  const cs = [...m.campaigns].sort(byNewest);
  const datedCs = cs.filter(dated);
  const as = appearancesOf(m);
  const counted = as.filter(a => a.cls !== 'undated' && !a.coveredBy);
  const identified = counted.filter(a => a.cls === 'identified').length;
  const kindCounts = {}; for (const c of cs) kindCounts[c.kind] = (kindCounts[c.kind] || 0) + 1;
  const brands = groupBy(cs, c => c.brand);
  const photos = cs.reduce((n, c) => n + photosOf(c, m.name).length, 0);
  const first = earliest(m);
  const facts = [m.born ? `Born ${m.born}` : '', m.country || ''].filter(Boolean).join(' · ');
  const combos = extra.combos.get(m.slug) || [];
  const coversPage = extra.covers.has(m.slug);
  const kindsHad = KINDS.filter(k => kindCounts[k]).map(k => KIND_PLURAL[k].toLowerCase());
  const topBrands = [...brands].sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([b]) => b);
  if (m.press?.length) ctx.usePress(m);
  const years = groupBy(datedCs, c => c.year);
  const title = `${m.name} — ${kindsHad.slice(0, 3).join(', ')} | ${SITE}`;
  const description = `${m.name} in ${SITE}: ${plural(counted.length, 'documented appearance')}${as.length > counted.length ? ` and ${plural(as.length - counted.length, 'other record')}` : ''} with ${plural(brands.size, 'label')}${first ? `, ${range(m.first, m.last)}` : ''}, including ${topBrands.join(', ')}. Every entry links to its source.`;
  const path = modelPath(m);
  const jsonld = [crumbsLd([['/', SITE], ['/models/', 'Models'], [path, m.name]]),
    { '@context': 'https://schema.org', '@type': 'Person', name: m.name, url: ORIGIN + path, ...(m.wiki ? { sameAs: [m.wiki] } : {}), ...(m.portrait && !/^https?:/.test(m.portrait) ? { image: ORIGIN + src(m.portrait) } : {}) }];
  const body = `
    ${crumbs([['/', 'Home'], ['/models/', 'Models'], [path, m.name]])}
    <section class="page-head${m.portrait ? ' with-portrait' : ''}">
      <div>
        <div class="eyebrow">Model${facts ? ' · ' + esc(facts) : ''}</div>
        <h1>${esc(m.name)}</h1>
        <p class="lede">${plural(counted.length, 'documented appearance')} (${identified} identified, ${counted.length - identified} dated ${counted.length - identified === 1 ? 'relationship' : 'relationships'})${as.length - counted.length - as.filter(a => a.coveredBy).length > 0 ? ` · ${plural(as.filter(a => a.cls === 'undated').length, 'undated relationship')}` : ''} · ${plural(brands.size, 'label')}${photos ? ` · ${plural(photos, 'photo')} of her` : ''}</p>
        ${first ? `<p class="earliest">Earliest documented appearance in this archive: <a href="#${first.credit.id}">${esc(first.year)}, ${esc(first.credit.brand)}</a> (${esc(KIND_LABEL[first.credit.kind].toLowerCase())}). This is the earliest record here, not necessarily the start of her career.</p>` : '<p class="earliest">No dated appearance in this archive yet.</p>'}
        <p class="head-actions"><button type="button" class="fav-btn" data-fav="${m.slug}" data-name="${esc(m.name)}" aria-pressed="false"><span aria-hidden="true">♡</span> <span class="fav-label">Add to favourites</span></button>
          <a class="line-link" href="/suggest/?model=${encodeURIComponent(m.name)}" rel="nofollow">Suggest a missing appearance</a>
          ${m.wiki ? `<a class="line-link" href="${esc(m.wiki)}" target="_blank" rel="noopener noreferrer">Biography on Wikipedia ↗</a>` : ''}</p>
      </div>
      ${m.portrait ? `<figure class="portrait"><img src="${esc(src(m.portrait))}" alt="Portrait of ${esc(m.name)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>Portrait, not a campaign photo · ${m.portraitPage ? `<a href="${esc(m.portraitPage)}" target="_blank" rel="noopener noreferrer">${esc(m.portraitCredit || 'Photo: Wikimedia Commons')} ↗</a>` : esc(m.portraitCredit || '')}</figcaption></figure>` : ''}
    </section>
    <div class="chips"><span class="chips-label">Worked with</span>${[...brands].sort((a, b) => a[0].localeCompare(b[0])).map(([b, bcs]) => {
      const combo = combos.find(x => x.brand.name === b);
      return `<a class="chip" href="${combo ? `${path}${combo.brand.slug}/` : ctx.brandPath(b)}">${esc(b)}<small>${bcs.filter(dated).map(c => c.year).filter((y, i, a) => a.indexOf(y) === i).slice(0, 6).join(', ')}</small></a>`;
    }).join('')}</div>
    ${combos.length || coversPage ? `<p class="related">More: ${[...combos.map(x => `<a href="${path}${x.brand.slug}/">${esc(m.name)} × ${esc(x.brand.name)}</a>`), coversPage ? `<a href="${path}covers/">${esc(m.name)} magazine covers</a>` : ''].filter(Boolean).join(' · ')}</p>` : ''}
    ${m.press?.length ? `<section class="press"><div class="section-top"><h2>In the press</h2><span class="hint">Press photos: lead photos of articles about ${esc(m.name)} cited on Wikipedia. They are not campaign photos.</span></div>
      <div class="gallery">${m.press.map((k, i) => `<button class="shot" type="button" aria-label="Open press photo: ${esc(k.title || m.name)}"><img src="${esc(src(k.src))}" alt="Press photo of ${esc(m.name)}${k.title ? ' — ' + esc(k.title) : ''}" loading="lazy" data-m="${m.slug}" data-p="${i}"></button>`).join('')}</div></section>` : ''}
    <section class="timeline" aria-label="Career timeline">
      <div class="section-top"><h2>Timeline</h2><span class="hint">Newest first. ${CLASS_LABEL.identified}: ${esc(CLASS_HELP.identified)} ${CLASS_LABEL.dated}: ${esc(CLASS_HELP.dated)}</span></div>
      ${kindFilter(kindCounts)}
      ${[...years].map(([y, ycs]) => `
      <section class="year-block" id="y${y}" data-year="${y}">
        <h2><a href="/year/${y}/">${y}</a></h2>
        <div class="entries">${ycs.map(c => entryForModel(ctx, c, m)).join('')}</div>
      </section>`).join('')}
      ${undatedList(ctx, cs.filter(c => !dated(c)), m.name)}
    </section>`;
  return { path, html: layout({ title, description, path, noindex: !extra.indexable, jsonld, body, ctx, active: 'models' }) };
}

// ---------- model × label and model covers pages ----------

export function comboPage(db, { model: m, brand: b, appearances }) {
  const ctx = new Ctx(db);
  const path = `${modelPath(m)}${b.slug}/`;
  const cs = m.campaigns.filter(c => slug(c.brand) === b.slug).sort(byNewest);
  const kinds = [...new Set(cs.map(c => KIND_PLURAL[c.kind].toLowerCase()))];
  const ys = cs.filter(dated).map(c => c.year);
  const title = `${m.name} for ${b.name}: ${kinds.join(', ')} ${range(Math.min(...ys), Math.max(...ys))} | ${SITE}`;
  const description = `Every documented ${b.name} appearance of ${m.name} in ${SITE}: ${plural(appearances.length, 'appearance')} from ${range(Math.min(...ys), Math.max(...ys))}, with seasons, photos where they identify her, and source links.`;
  const others = new Map();
  for (const c of b.campaigns) if (ys.includes(c.year)) for (const t of c.talent) if (t !== m.name) others.set(t, (others.get(t) || 0) + 1);
  const body = `
    ${crumbs([['/', 'Home'], [modelPath(m), m.name], [path, b.name]])}
    <section class="page-head">
      <div class="eyebrow">${esc(m.name)} × ${esc(b.name)}</div>
      <h1>${esc(m.name)} for ${esc(b.name)}</h1>
      <p class="lede">${plural(appearances.length, 'documented appearance')} (${appearances.filter(a => a.cls === 'identified').length} identified) · ${range(Math.min(...ys), Math.max(...ys))}. See <a href="${modelPath(m)}">${esc(m.name)}'s full timeline</a> or <a href="${brandPath(b)}">all ${esc(b.name)} models</a>.</p>
    </section>
    <div class="entries combo">${cs.filter(dated).map(c => `<div class="combo-year"><h2>${c.year}</h2></div>${entryForModel(ctx, c, m)}`).join('')}</div>
    ${undatedList(ctx, cs.filter(c => !dated(c)), m.name)}
    ${others.size ? `<div class="section-top"><h2>Also with ${esc(b.name)} in those years</h2></div><div class="chips">${[...others].sort((a, b2) => b2[1] - a[1]).slice(0, 24).map(([t]) => `<a class="chip" href="${modelPath(t)}">${esc(t)}</a>`).join('')}</div>` : ''}`;
  return { path, html: layout({ title, description, path, jsonld: [crumbsLd([['/', SITE], [modelPath(m), m.name], [path, b.name]])], body, ctx, active: 'models' }) };
}

export function coversPage(db, { model: m, appearances }) {
  const ctx = new Ctx(db);
  const path = `${modelPath(m)}covers/`;
  const cs = m.campaigns.filter(c => c.kind === 'cover').sort(byNewest);
  const ys = cs.filter(dated).map(c => c.year);
  const mags = [...new Set(cs.map(c => c.brand))];
  const title = `${m.name} magazine covers ${range(Math.min(...ys), Math.max(...ys))} | ${SITE}`;
  const description = `${m.name}'s magazine covers in ${SITE}: ${plural(appearances.length, 'dated cover')} for ${mags.slice(0, 4).join(', ')}${mags.length > 4 ? ' and more' : ''}, each with its issue and source.`;
  const body = `
    ${crumbs([['/', 'Home'], [modelPath(m), m.name], [path, 'Magazine covers']])}
    <section class="page-head">
      <div class="eyebrow">Magazine covers</div>
      <h1>${esc(m.name)} magazine covers</h1>
      <p class="lede">${plural(appearances.length, 'dated cover')} for ${plural(mags.length, 'magazine')} · ${range(Math.min(...ys), Math.max(...ys))}. <a href="${modelPath(m)}">Full timeline</a>.</p>
    </section>
    <div class="entries combo">${cs.filter(dated).map(c => `<div class="combo-year"><h2>${c.year}</h2></div>${entryForModel(ctx, c, m)}`).join('')}</div>
    ${undatedList(ctx, cs.filter(c => !dated(c)), m.name)}`;
  return { path, html: layout({ title, description, path, jsonld: [crumbsLd([['/', SITE], [modelPath(m), m.name], [path, 'Magazine covers']])], body, ctx, active: 'models' }) };
}

// ---------- brand / magazine page ----------

function entryForBrand(ctx, c) {
  const pics = c.images.length ? `<div class="gallery">${c.images.slice(0, 6).map((img, n) => `<button class="shot" type="button" aria-label="Open photo: ${esc(altText(c, img))}">${photoTag(ctx, c, img)}${n === 5 && c.images.length > 6 ? `<span class="more">+${c.images.length - 6}</span>` : ''}</button>`).join('')}</div>` : '';
  return `
    <article class="entry${pics ? ' has-photos' : ''}" id="${c.id}" data-kind="${c.kind}">
      ${pics ? '' : `<div class="entry-thumb">${visual(ctx, c)}</div>`}
      <div>
        <div class="season">${esc(seasonOf(c))}${kindBadge(c)}</div>
        <h3>${list(c.talent)}</h3>
        ${credits(c)}${sources(c)}
        ${pics ? '<p class="hint">Photos open with the models each one identifies.</p>' : ''}
        <p class="entry-actions">${fixLink(c)}</p>
      </div>
      ${pics}
    </article>`;
}

export function brandPage(db, b, extra) {
  const ctx = new Ctx(db);
  const path = brandPath(b);
  const cs = [...b.campaigns].sort(byNewest);
  const faces = new Set(cs.flatMap(c => c.talent));
  const kindCounts = {}; for (const c of cs) kindCounts[c.kind] = (kindCounts[c.kind] || 0) + 1;
  const years = groupBy(cs.filter(dated), c => c.year);
  const top = extra.top || [];
  const what = b.isMagazine ? 'covers' : 'campaigns and runway shows';
  const title = b.isMagazine ? `${b.name} covers — models by issue and year | ${SITE}` : `${b.name} models — ${Object.keys(kindCounts).map(k => KIND_PLURAL[k].toLowerCase()).join(', ')} by year | ${SITE}`;
  const description = `${plural(faces.size, 'model')} documented with ${b.name} in ${SITE}: ${plural(cs.length, 'credit')}, ${range(b.first, b.last)}. ${what[0].toUpperCase() + what.slice(1)} by year and season, with photos and sources.`;
  const section = b.isMagazine ? ['/magazines/', 'Magazines'] : ['/brands/', 'Labels'];
  const combos = extra.combos;
  const body = `
    ${crumbs([['/', 'Home'], section, [path, b.name]])}
    <section class="page-head">
      <div class="eyebrow">${TYPE_LABEL[b.type] || 'Label'}${b.country ? ' · ' + esc(b.country) : ''}</div>
      <h1>${esc(b.name)}</h1>
      <p class="lede">${plural(cs.length, 'credit')} · ${plural(faces.size, 'model')} · ${range(b.first, b.last)}</p>
      <p class="head-actions"><a class="line-link" href="/suggest/?brand=${encodeURIComponent(b.name)}" rel="nofollow">Suggest a missing appearance</a></p>
    </section>
    ${top.length ? `<section class="brand-top"><div class="section-top"><h2>Most featured with ${esc(b.name)} in this archive</h2><span class="hint">Distinct dated appearances; reflects this archive's coverage, not the whole industry.</span></div>
      <ol class="rank-mini">${top.map(r => `<li><a href="${combos.has(`${r.slug}|${b.slug}`) ? `/model/${r.slug}/${b.slug}/` : `/model/${r.slug}/`}">${esc(r.name)}</a> <small>${plural(r.total, 'appearance')}</small></li>`).join('')}</ol></section>` : ''}
    ${years.size > 1 ? `<div class="chips"><span class="chips-label">Years</span>${[...years.keys()].map(y => `<a class="chip" href="#y${y}">${y}</a>`).join('')}${cs.some(c => !dated(c)) ? '<a class="chip" href="#undated">Undated</a>' : ''}</div>` : ''}
    <section class="timeline" aria-label="Timeline">
      ${Object.keys(kindCounts).length > 1 ? kindFilter(kindCounts) : ''}
      ${[...years].map(([y, ycs]) => `
      <section class="year-block" id="y${y}" data-year="${y}">
        <h2><a href="/year/${y}/">${y}</a></h2>
        <div class="entries">${ycs.map(c => entryForBrand(ctx, c)).join('')}</div>
      </section>`).join('')}
      ${undatedList(ctx, cs.filter(c => !dated(c)))}
    </section>`;
  return { path, html: layout({ title, description, path, noindex: !extra.indexable, jsonld: [crumbsLd([['/', SITE], section, [path, b.name]])], body, ctx, active: b.isMagazine ? 'magazines' : 'brands' }) };
}

// ---------- year page ----------

const card = (ctx, c) => `
  <article class="card" data-kind="${c.kind}">
    <a class="card-img" href="${ctx.brandPath(c.brand)}#${c.id}" aria-label="${esc(c.brand)}, ${esc(label(c))}">${visual(ctx, c)}${c.images.length > 1 ? `<span class="count-badge">${c.images.length} photos</span>` : ''}</a>
    <div class="card-meta">${brandLink(ctx, c.brand)}<span>${esc(label(c))}</span></div>
    <h3>${list(c.talent)}</h3>
    ${kindBadge(c)}${credits(c)}${sources(c)}
  </article>`;
const rowsOf = (ctx, cs) => cs.length ? `<ul class="rows">${cs.map(c => `
  <li data-kind="${c.kind}"><span class="row-pic">${visual(ctx, c)}</span><span class="row-brand">${brandLink(ctx, c.brand)}<small>${esc(label(c))}</small></span>
    <span class="row-who">${kindBadge(c)}${list(c.talent)}${c.title ? ` <em>${esc(c.title)}</em>` : ''}</span>
    <span class="src">${sourceLinks(c.sources)}</span></li>`).join('')}</ul>` : '';

export function yearPage(db, y, extra) {
  const ctx = new Ctx(db);
  const path = `/year/${y}/`;
  const cs = db.campaigns.filter(c => c.year === y);
  const kindCounts = {}; for (const c of cs) kindCounts[c.kind] = (kindCounts[c.kind] || 0) + 1;
  const seasons = groupBy(cs, c => seasonOf(c) || 'Season not recorded');
  const order = [...seasons.keys()].sort((a, b) => seasonRank(b) - seasonRank(a));
  const top = rankModels(extra.table, [y], { limit: 10 });
  const allYears = extra.years;
  const i = allYears.indexOf(y);
  const title = `${y} in fashion: campaigns, runway shows and covers | ${SITE}`;
  const description = `${plural(cs.length, 'credit')} from ${y} in ${SITE}: ${Object.entries(kindCounts).map(([k, n]) => `${n} ${KIND_PLURAL[k].toLowerCase()}`).join(', ')}, with the models, labels and sources.`;
  const body = `
    ${crumbs([['/', 'Home'], ['/years/', 'Years'], [path, String(y)]])}
    <section class="page-head">
      <div class="eyebrow">Year</div>
      <h1>${y}</h1>
      <p class="lede">${plural(cs.length, 'credit')} in the archive. ${allYears[i + 1] ? `<a href="/year/${allYears[i + 1]}/">← ${allYears[i + 1]}</a>` : ''} ${allYears[i - 1] ? `<a href="/year/${allYears[i - 1]}/">${allYears[i - 1]} →</a>` : ''}</p>
    </section>
    ${top.length ? `<section class="brand-top"><div class="section-top"><h2>Most featured in ${y}</h2><a class="line-link" href="/most-featured/?period=${y}">Full ranking ↗</a></div>
      <ol class="rank-mini">${top.map(r => `<li><a href="/model/${r.slug}/">${esc(r.name)}</a> <small>${plural(r.total, 'appearance')}</small></li>`).join('')}</ol></section>` : ''}
    <section class="timeline">
    ${Object.keys(kindCounts).length > 1 ? kindFilter(kindCounts) : ''}
    ${order.map(s => {
      const scs = seasons.get(s);
      const withPics = scs.filter(c => c.images.length);
      return `<div class="season-group"><div class="section-top"><h2>${esc(s)}${s === 'Season not recorded' ? '' : ' ' + y}</h2></div>
      ${withPics.length ? `<div class="grid">${withPics.map(c => card(ctx, c)).join('')}</div>` : ''}${rowsOf(ctx, scs.filter(c => !c.images.length))}</div>`;
    }).join('')}
    </section>`;
  return { path, html: layout({ title, description, path, jsonld: [crumbsLd([['/', SITE], ['/years/', 'Years'], [path, String(y)]])], body, ctx, active: 'years' }) };
}

// ---------- directories ----------

function directory(items, href, meta) {
  const sorted = [...items].sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const letters = groupBy(sorted, x => { const ch = norm(x.name)[0] || '#'; return /[a-z]/.test(ch) ? ch.toUpperCase() : '#'; });
  return `
    <nav class="az" aria-label="Jump to letter">${[...letters.keys()].map(L => `<a href="#L-${L}">${L}</a>`).join('')}</nav>
    <div class="directory">${[...letters].map(([L, xs]) => `
    <div class="letter" id="L-${L}">${L}</div>
    ${xs.map(x => `<a href="${href(x)}"><span>${esc(x.name)}</span><small>${meta(x)}</small></a>`).join('')}`).join('')}
  </div>`;
}

export function modelsDirectory(db) {
  const ctx = new Ctx(db);
  const path = '/models/';
  const ms = [...db.models.values()];
  const body = `${crumbs([['/', 'Home'], [path, 'Models']])}
    <section class="page-head"><div class="eyebrow">Directory</div><h1>Models</h1>
      <p class="lede">${plural(ms.length, 'model')}, including actresses and musicians who modeled for a label. See also <a href="/most-featured/">most featured in our archive</a>.</p></section>
    ${directory(ms, m => modelPath(m), m => `${plural(new Set(m.campaigns.map(c => c.brand)).size, 'label')} · ${range(m.first, m.last)}`)}`;
  return { path, html: layout({ title: `Models A–Z | ${SITE}`, description: `All ${ms.length.toLocaleString('en')} models in ${SITE}, A to Z, with the labels and magazines they worked with and their documented years.`, path, body, ctx, active: 'models' }) };
}

export function brandsDirectory(db, magazines) {
  const ctx = new Ctx(db);
  const path = magazines ? '/magazines/' : '/brands/';
  const bs = [...db.brands.values()].filter(b => b.isMagazine === magazines);
  const groups = magazines ? '' : `<div class="chips">${['designer', 'brand'].map(t => `<a class="chip" href="#type-${t}">${TYPE_LABEL[t]}<small>${bs.filter(b => b.type === t).length}</small></a>`).join('')}</div>`;
  const body = `${crumbs([['/', 'Home'], [path, magazines ? 'Magazines' : 'Labels']])}
    <section class="page-head"><div class="eyebrow">Directory</div><h1>${magazines ? 'Magazines' : 'Labels'}</h1>
      <p class="lede">${magazines ? `${plural(bs.length, 'magazine')}. Pick one to see its documented covers by year.` : `${plural(bs.length, 'fashion house, designer and brand', 'fashion houses, designers and brands')}. Pick one to see every model who worked with it, by year and season.`}</p></section>
    ${groups}
    ${directory(bs, b => brandPath(b), b => `${plural(b.campaigns.length, 'credit')} · ${range(b.first, b.last)}`)}
    ${magazines ? '' : ['designer', 'brand'].map(t => `<h2 id="type-${t}" class="dir-type">${TYPE_LABEL[t]}</h2><div class="directory">${bs.filter(b => b.type === t).sort((a, b2) => norm(a.name).localeCompare(norm(b2.name))).map(b => `<a href="${brandPath(b)}"><span>${esc(b.name)}</span><small>${plural(b.campaigns.length, 'credit')}</small></a>`).join('')}</div>`).join('')}`;
  const title = magazines ? `Magazines and their cover models | ${SITE}` : `Fashion houses, designers and brands | ${SITE}`;
  return { path, html: layout({ title, description: magazines ? `${bs.length} magazines in ${SITE} with the models documented on their covers, by year.` : `${bs.length} fashion houses, designers and brands in ${SITE} with the models who worked for them.`, path, body, ctx, active: magazines ? 'magazines' : 'brands' }) };
}

export function yearsDirectory(db, years) {
  const ctx = new Ctx(db);
  const path = '/years/';
  const counts = groupBy(db.campaigns.filter(dated), c => c.year);
  const body = `${crumbs([['/', 'Home'], [path, 'Years']])}
    <section class="page-head"><div class="eyebrow">Directory</div><h1>Years</h1><p class="lede">Every year with documented work, newest first.</p></section>
    <div class="directory">${years.map(y => `<a href="/year/${y}/"><span>${y}</span><small>${plural(counts.get(y).length, 'credit')}</small></a>`).join('')}</div>`;
  return { path, html: layout({ title: `Fashion by year | ${SITE}`, description: `Campaigns, runway shows and magazine covers in ${SITE}, by year from ${years[years.length - 1]} to ${years[0]}.`, path, body, ctx, active: 'years' }) };
}

// ---------- rankings ----------

const RANK_RULES = `
  <ul class="rules">
    <li>Counts distinct documented appearances: one model, one label, one kind of work, one year and season. Several records or photos of the same appearance count once.</li>
    <li>A dated relationship (a year without a season or campaign) counts once per label, kind and year, and only when no identified appearance already covers it.</li>
    <li>Undated relationships are not counted.</li>
    <li>This reflects what this archive documents, which is incomplete and uneven across years and labels. It is not a measure of a model's whole career or of the industry.</li>
    <li>It is separate from <a href="/fan-favourites/">fan favourites</a>, which count visitors' favourites; the two are never combined.</li>
  </ul>`;

const rankTable = rows => `<div class="table-wrap"><table class="rank-table">
  <thead><tr><th scope="col">#</th><th scope="col">Model</th><th scope="col">Appearances</th>${KINDS.map(k => `<th scope="col">${KIND_PLURAL[k]}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><th scope="row"><a href="/model/${r.slug}/">${esc(r.name)}</a></th><td>${r.total}</td>${r.byKind.map(n => `<td>${n || '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

export function featuredPage(db, table, periodList) {
  const ctx = new Ctx(db, { rankings: '/data/rankings.json' });
  const path = '/most-featured/';
  const all = rankModels(table, periodList[0].years, { limit: 50 });
  const body = `${crumbs([['/', 'Home'], [path, 'Most featured']])}
    <section class="page-head"><div class="eyebrow">Archive visibility</div><h1>Most featured in our archive</h1>
      <p class="lede">Models with the most distinct documented appearances in ${SITE}, by period and kind of work.</p></section>
    <form class="rank-controls" id="rankControls" action="/most-featured/" method="get">
      <label>Period <select name="period" id="rankPeriod">${periodList.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}</select></label>
      <label>Kind <select name="kind" id="rankKind"><option value="">All kinds</option>${KINDS.map(k => `<option value="${k}">${KIND_PLURAL[k]}</option>`).join('')}</select></label>
      <noscript><button type="submit" class="chip">Show</button></noscript>
    </form>
    <h2 id="rankHeading">All years</h2>
    <div id="rankResult">${rankTable(all)}</div>
    <section class="prose"><h2>How this is counted</h2>${RANK_RULES}</section>`;
  return { path, html: layout({ title: `Most featured models in our archive | ${SITE}`, description: `The models with the most distinct documented campaigns, runway shows, magazine covers and ambassadorships in ${SITE}, by year or period. Archive coverage, not popularity.`, path, body, ctx, active: 'featured' }) };
}

export function fanPage(db) {
  const ctx = new Ctx(db);
  const path = '/fan-favourites/';
  const body = `${crumbs([['/', 'Home'], [path, 'Fan favourites']])}
    <section class="page-head"><div class="eyebrow">Visitor preference</div><h1>Fan favourites</h1>
      <p class="lede">Models that visitors have added to their favourites. This measures popularity among visitors, not how often a model appears in the archive; for that see <a href="/most-featured/">most featured</a>.</p></section>
    <div class="chips" role="group" aria-label="Period"><button type="button" class="chip" data-window="30d" aria-pressed="true">Last 30 days</button><button type="button" class="chip" data-window="all" aria-pressed="false">All time</button></div>
    <div id="fanResult" class="fan-result"><p class="empty">Fan favourites load from the archive's favourites service. If nothing appears, the service is unavailable right now; the rest of the archive works as usual.</p></div>
    <section class="prose"><h2>How this is counted</h2><ul class="rules">
      <li>Each browser counts once per model, however often the heart is clicked; removing a favourite removes its count. At most 20 browsers per network per day are counted, to limit inflation from one place.</li>
      <li>All time: favourites currently held. Last 30 days: favourites added in the last 30 days and still held.</li>
      <li>Favourites are anonymous and not verified one-person-one-vote: a person can count again from another browser or device. Rate limits and per-network caps reduce abuse but cannot prevent it.</li>
      <li>Models need at least 3 favourites to be listed.</li>
    </ul></section>`;
  return { path, html: layout({ title: `Fan favourites | ${SITE}`, description: `The models visitors of ${SITE} have favourited most, in the last 30 days and all time, with clear counting rules.`, path, body, ctx, active: '' }) };
}

// ---------- visitor pages (noindex) ----------

export function favouritesPage(db) {
  const ctx = new Ctx(db);
  const path = '/favourites/';
  const body = `${crumbs([['/', 'Home'], [path, 'My favourites']])}
    <section class="page-head"><div class="eyebrow">Saved in this browser</div><h1>My favourites</h1>
      <p class="lede">Models you have favourited and appearances you have saved. They are stored in this browser only: they do not sync across devices or browsers, and clearing site data removes them.</p></section>
    <div id="myFavs"><p class="empty">Your favourites appear here. Use the ♡ button on a model's page, or ☆ Save on an appearance. (This list needs JavaScript.)</p></div>`;
  return { path, html: layout({ title: `My favourites | ${SITE}`, description: 'Your favourite models and saved appearances, stored in this browser.', path, noindex: true, body, ctx, active: 'favourites' }) };
}

export function suggestPage(db) {
  const ctx = new Ctx(db);
  const path = '/suggest/';
  const kinds = KINDS.map(k => `<option value="${k}">${KIND_LABEL[k]}</option>`).join('');
  const body = `${crumbs([['/', 'Home'], [path, 'Suggest']])}
    <section class="page-head"><div class="eyebrow">Community</div><h1>Suggest a missing appearance or a correction</h1>
      <p class="lede">Suggestions go to a private review queue. Nothing is published automatically: an editor checks the source first, and approved changes appear with the next archive update.</p></section>
    <div id="sent" class="notice" hidden><p><b>Thank you.</b> Your suggestion is in the review queue.</p></div>
    <form class="removal suggest" id="suggestForm" action="/api/submissions" method="post">
      <fieldset class="choice"><legend>What would you like to do?</legend>
        <label><input type="radio" name="type" value="missing" checked> Suggest a missing appearance</label>
        <label><input type="radio" name="type" value="correction"> Report a correction</label>
      </fieldset>
      <input type="hidden" name="record" id="sg-record">
      <input type="hidden" name="page" id="sg-page">
      <input type="hidden" name="ts" id="sg-ts">
      <label>Model<input name="model" id="sg-model" required maxlength="120" autocomplete="off"></label>
      <label>Brand or magazine<input name="brand" id="sg-brand" required maxlength="120" autocomplete="off"></label>
      <label>Type of appearance<select name="kind" id="sg-kind">${kinds}</select></label>
      <div class="two"><label>Year (if known)<input name="year" id="sg-year" inputmode="numeric" pattern="(19|20)[0-9]{2}" maxlength="4"></label>
        <label>Season (if known)<select name="season" id="sg-season"><option value="">Not known</option>${['Spring/Summer', 'Fall/Winter', 'Resort', 'Pre-Fall', 'Holiday'].map(s => `<option>${s}</option>`).join('')}</select></label></div>
      <label>Source link<input name="source" id="sg-source" type="url" required maxlength="500" placeholder="https://… (an article, the brand's own page, a magazine page)"></label>
      <label>Short explanation<textarea name="note" id="sg-note" rows="4" maxlength="1000" required placeholder="What is missing or wrong, and where the source shows it."></textarea></label>
      <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
      <button type="submit" class="chip active">Send for review</button>
      <p class="hint">Links only, no uploads. We do not fetch the links you send; an editor opens them during review. We store what you type here and a short-lived, anonymised network code used to limit spam. See <a href="/privacy/">privacy</a>.</p>
      <p class="hint" id="sg-error" role="alert"></p>
    </form>`;
  return { path, html: layout({ title: `Suggest a missing appearance | ${SITE}`, description: 'Suggest a missing appearance or report a correction, with a source link, for editorial review.', path, noindex: true, body, ctx }) };
}

export function searchPage(db) {
  const ctx = new Ctx(db, { searchIndex: '/data/search-index.json' });
  const path = '/search/';
  const body = `${crumbs([['/', 'Home'], [path, 'Search']])}
    <section class="page-head"><div class="eyebrow">Search</div><h1 id="searchTitle">Search the archive</h1>
      <p class="lede" id="searchSummary">Type a model, a brand or magazine, or both (for example “Kendall Jenner Calvin Klein” or “Naomi Campbell covers”).</p></section>
    <div id="searchResults"></div>
    <noscript><p>Search needs JavaScript. Browse <a href="/models/">models</a>, <a href="/brands/">labels</a> or <a href="/magazines/">magazines</a> instead.</p></noscript>`;
  return { path, html: layout({ title: `Search | ${SITE}`, description: `Search ${SITE} for models, labels and magazines.`, path, noindex: true, body, ctx }) };
}

// ---------- home, about, privacy, 404 ----------

export function homePage(db, table, years) {
  const ctx = new Ctx(db);
  const withYear = db.campaigns.filter(dated);
  const latestYear = (withYear.find(c => c.images.length) || withYear[0])?.year;
  const latest = withYear.filter(c => c.year === latestYear);
  const hero = latest.find(c => c.featured && c.images.length) || latest.find(c => c.images.length);
  const brands = [...db.brands.values()];
  const topBrands = brands.filter(b => !b.isMagazine).sort((a, b) => b.campaigns.length - a.campaigns.length).slice(0, 18);
  const topMags = brands.filter(b => b.isMagazine).sort((a, b) => b.campaigns.length - a.campaigns.length).slice(0, 12);
  const top = rankModels(table, years.slice(0, 5), { limit: 10 });
  const body = `
    <section class="intro">
      <div><div class="eyebrow">A visual reference for models' careers</div><h1>Who modeled<br><em>for whom?</em></h1></div>
      <div>
        <p class="lede">Explore models' documented campaigns, runway shows, magazine covers and ambassadorships through the years, or start from a brand or a magazine. Every entry links to its source.</p>
        <div class="stats">
          <div><b>${db.models.size.toLocaleString('en')}</b><span>Models</span></div>
          <div><b>${brands.length.toLocaleString('en')}</b><span>Labels &amp; magazines</span></div>
          <div><b>${db.campaigns.length.toLocaleString('en')}</b><span>Credits</span></div>
          <div><b>${range(years[years.length - 1], years[0])}</b><span>Years</span></div>
        </div>
      </div>
    </section>
    ${hero ? `<section class="hero">
      <div class="hero-image">${visual(ctx, hero)}</div>
      <div class="hero-copy"><span class="eyebrow">In focus · ${esc(hero.brand)} · ${esc(label(hero))}</span>
        <h2>${hero.talent.map(modelLink).join('<br>')}</h2>${credits(hero)}
        <p><a class="line-link" href="${ctx.brandPath(hero.brand)}">All ${esc(hero.brand)} models ↗</a></p></div>
    </section>` : ''}
    <div class="section-top"><div><span class="eyebrow">Archive visibility, ${years[4]}–${years[0]}</span><h2>Most featured in our archive</h2></div><a class="line-link" href="/most-featured/">Full ranking and other years ↗</a></div>
    <ol class="rank-mini wide">${top.map(r => `<li><a href="/model/${r.slug}/">${esc(r.name)}</a> <small>${plural(r.total, 'appearance')}</small></li>`).join('')}</ol>
    <div class="section-top"><div><span class="eyebrow">Browse a label</span><h2>Fashion houses &amp; brands</h2></div><a class="line-link" href="/brands/">All labels ↗</a></div>
    <div class="chips">${topBrands.map(b => `<a class="chip" href="${brandPath(b)}">${esc(b.name)}<small>${b.campaigns.length}</small></a>`).join('')}</div>
    <div class="section-top"><div><span class="eyebrow">Browse a magazine</span><h2>Magazine covers</h2></div><a class="line-link" href="/magazines/">All magazines ↗</a></div>
    <div class="chips">${topMags.map(b => `<a class="chip" href="${brandPath(b)}">${esc(b.name)}<small>${b.campaigns.length}</small></a>`).join('')}</div>
    <div class="section-top"><div><span class="eyebrow">The latest season</span><h2>${latestYear}</h2></div><a class="line-link" href="/year/${latestYear}/">All of ${latestYear} ↗</a></div>
    <div class="grid">${latest.filter(c => c.images.length).slice(0, 9).map(c => card(ctx, c)).join('')}</div>
    <div class="section-top"><div><span class="eyebrow">Go back in time</span><h2>Browse by year</h2></div></div>
    <div class="chips">${years.map(y => `<a class="chip" href="/year/${y}/">${y}</a>`).join('')}</div>
    <div class="section-top"><div><span class="eyebrow">Visitors</span><h2>Fan favourites</h2></div><a class="line-link" href="/fan-favourites/">See fan favourites ↗</a></div>
    <p class="hint">Separate from archive visibility: models visitors have added to their favourites.</p>`;
  return { path: '/', html: layout({ title: `${SITE} — models' campaigns, runway shows and magazine covers by year`, description: `${SITE}: a sourced visual reference for ${db.models.size.toLocaleString('en')} models' careers — campaigns, runway shows, magazine covers and ambassadorships with ${brands.length} labels and magazines, by year.`, path: '/', jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: ORIGIN + '/', potentialAction: { '@type': 'SearchAction', target: ORIGIN + '/search/?q={q}', 'query-input': 'required name=q' } }], body, ctx }) };
}

export function aboutPage(db) {
  const ctx = new Ctx(db);
  const path = '/about/';
  const body = `${crumbs([['/', 'Home'], [path, 'About']])}
    <section class="page-head"><div class="eyebrow">About</div><h1>About the archive</h1></section>
    <div class="prose">
      <p>${SITE} records the documented work of fashion models: the campaigns, runway shows, magazine covers and ambassadorships the archive's sources record, and when. It is a reference, not a complete record of anyone's career.</p>
      <h2>What the labels mean</h2>
      <ul class="rules">
        <li><b>${CLASS_LABEL.identified}</b>: ${esc(CLASS_HELP.identified)}</li>
        <li><b>${CLASS_LABEL.dated}</b>: ${esc(CLASS_HELP.dated)} A year alone does not establish a specific campaign.</li>
        <li><b>${CLASS_LABEL.undated}</b>: ${esc(CLASS_HELP.undated)}</li>
        <li><b>Earliest documented appearance in this archive</b>: the earliest dated record here, not necessarily the start of a career.</li>
      </ul>
      <h2>Photos</h2>
      <p>A photo is shown as a particular model only when its own caption or alt text on its source page names her, or an editor has confirmed it. Other photos of a campaign appear under “Other campaign photos”, and the viewer shows who, if anyone, each photo identifies. Where no photo of her exists, a model portrait or press photo may appear, always labelled as such.</p>
      <h2>Sources and updates</h2>
      <p>Every entry links to its source. Recent campaigns come from fashion press coverage; the historical archive comes from the career sections of models' Wikipedia biographies, brands' Wikipedia articles and the press articles they cite. The archive is refreshed periodically; reviewed community suggestions are added with those updates.</p>
      <p>Brand names, designer names and photographs belong to their respective owners. See <a href="/privacy/">privacy &amp; copyright</a> to request the removal of any content.</p>
    </div>`;
  return { path, html: layout({ title: `About the archive | ${SITE}`, description: `How ${SITE} documents models' work: sources, appearance types, photo attribution and updates.`, path, body, ctx }) };
}

export function privacyPage(db, ownerEmail) {
  const ctx = new Ctx(db);
  const path = '/privacy/';
  const subject = `${SITE} — Copyright content removal request`;
  const body = `${crumbs([['/', 'Home'], [path, 'Privacy & copyright']])}
    <section class="page-head"><div class="eyebrow">Legal</div><h1>Privacy &amp; copyright</h1></section>
    <div id="removalSent" class="notice" hidden><p><b>Request received.</b> Your removal request has been sent, and we will reply by email.</p></div>
    <div class="prose">
      <h2>Copyright</h2>
      <p>All brand names, designer names, logos, photographs and other content shown on ${SITE} are the property of their respective copyright owners. They are shown for information and reference only, with a link to the original source wherever possible. ${SITE} claims no ownership of them. If you own content that appears here and want it removed, send the form below with proof of your ownership.</p>
      <h2>Privacy</h2>
      <p>There are no accounts, advertising or tracking cookies. What is stored, and where:</p>
      <ul class="rules">
        <li><b>In your browser only</b> (local storage): your favourite models, your saved appearances, and a random identifier for this browser. They never leave your device except as described next, do not sync across devices, and are deleted when you clear this site's data.</li>
        <li><b>When you favourite a model</b>: the random browser identifier (stored only as a one-way hash), the model and the time are sent to our favourites service so we can show public favourite counts. Removing the favourite deletes that record.</li>
        <li><b>When you send a suggestion or correction</b>: the fields you fill in are stored in a private review queue. We do not ask for your name or email.</li>
        <li><b>Abuse limits</b>: to rate-limit favourites and suggestions, your IP address is turned into a one-way code that changes every day and cannot be linked across days. These codes are deleted after two days. We do not store IP addresses.</li>
        <li>The site is hosted on Cloudflare, which processes requests to deliver it. Links to sources and images hosted elsewhere (for example Wikimedia Commons) load from those sites under their own policies.</li>
      </ul>
      <p>If you send the removal form, the details you enter are delivered by email to the site owner through the FormSubmit service and used only to handle your request.</p>
      <h2 id="removal">Request content removal</h2>
      <form class="removal" action="https://formsubmit.co/${ownerEmail}" method="POST" enctype="multipart/form-data" id="removalForm">
        <input type="hidden" name="_subject" value="${esc(subject)}">
        <input type="hidden" name="_template" value="table">
        <input type="hidden" name="_next" value="${ORIGIN}/privacy/?sent=1">
        <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
        <label>Your full name<input name="name" required autocomplete="name"></label>
        <label>Your email<input type="email" name="email" required autocomplete="email"></label>
        <label>Company or rights holder you represent<input name="rights_holder"></label>
        <label>Link(s) to the content on this site<textarea name="content_urls" rows="3" required placeholder="https://…"></textarea></label>
        <label>Proof of ownership<textarea name="proof" rows="5" required placeholder="Describe the work you own and how you can prove it"></textarea></label>
        <label>Supporting document (optional)<input type="file" name="attachment" accept=".pdf,.jpg,.jpeg,.png"></label>
        <label class="check"><input type="checkbox" name="statement" value="I confirm that I own the content or am authorised to act for the owner, and that the information above is accurate." required> I confirm that I own the content or am authorised to act for the owner, and that the information above is accurate.</label>
        <button type="submit" class="chip active">Send removal request</button>
      </form>
    </div>`;
  return { path, html: layout({ title: `Privacy & copyright | ${SITE}`, description: `What ${SITE} stores, where, and how to request the removal of content.`, path, body, ctx }) };
}

export function notFoundPage(db) {
  const ctx = new Ctx(db);
  const body = `<section class="page-head"><h1>Not found</h1><p class="lede">That page isn't in the archive. Try <a href="/search/">search</a>, or browse <a href="/models/">models</a> and <a href="/brands/">labels</a>.</p></section>`;
  return { path: '/404.html', html: layout({ title: `Not found | ${SITE}`, description: 'Page not found.', path: '/404.html', noindex: true, body, ctx }) };
}
