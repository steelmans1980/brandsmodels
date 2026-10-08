// Browser enhancements for the static pages. Every page is readable without this script; it adds the photo viewer,
// timeline filters, favourites, saved appearances, search, the ranking selector and the suggestion form.
// Personal selections live in localStorage; public favourite counts go to /api (optional: the site works without it).
import { norm, slug, rankModels, KINDS, KIND_PLURAL } from './lib.mjs';

// Site-relative paths: '/model/x/' on brandsmodels.com, or under a sub-path when the site is previewed elsewhere.
const BASE = new URL('./', import.meta.url).pathname;
const PREVIEW = document.documentElement.dataset.preview === '1';
const u = p => { const m = String(p).match(/^([^?#]*)(.*)$/); return BASE + m[1].replace(/^\//, '') + (PREVIEW && m[1].endsWith('/') ? 'index.html' : '') + m[2]; };
const media = s => /^https?:/.test(s) ? s : u(s);
const api = p => BASE + p.replace(/^\//, '');

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const data = (() => { try { return JSON.parse($('#page-data')?.textContent || '{}'); } catch { return {}; } })();

// ---------- old #/ links keep working ----------
(function legacyHash() {
  const h = location.hash;
  if (!h.startsWith('#/')) return;
  const [page, arg = ''] = h.slice(2).split('/').map(x => { try { return decodeURIComponent(x); } catch { return x; } });
  const map = {
    model: () => `/model/${slug(arg)}/`, brand: () => `/brand/${slug(arg)}/`, year: () => `/year/${arg}/`,
    search: () => `/search/?q=${encodeURIComponent(arg)}`, brands: () => arg === 'magazine' ? '/magazines/' : '/brands/',
    models: () => '/models/', years: () => '/years/', about: () => '/about/', privacy: () => arg === 'sent' ? '/privacy/?sent=1' : '/privacy/', '': () => '/'
  };
  if (map[page]) location.replace(u(map[page]()));
})();

// ---------- storage (never throws) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};
function visitorId() {
  let v = store.get('bm:vid', null);
  if (!v) { v = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()); store.set('bm:vid', v); }
  return v;
}

// ---------- toast with undo ----------
let toastTimer;
function toast(msg, undo) {
  const t = $('#toast');
  if (!t) return;
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? ' <button type="button" class="link-btn" id="toastUndo">Undo</button>' : ''}`;
  t.hidden = false;
  if (undo) $('#toastUndo').addEventListener('click', () => { undo(); t.hidden = true; }, { once: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

// ---------- favourites (models): local list + idempotent public count ----------
const favs = () => store.get('bm:favs', {});
const pending = new Map();
function sendFavourite(model, on) {
  // the server stores a set (browser, model): repeating a request changes nothing, so retries are safe.
  clearTimeout(pending.get(model));
  pending.set(model, setTimeout(async () => {
    try {
      const r = await fetch(api('/api/favourites'), { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitor: visitorId(), model, on }) });
      if (r.ok) { const j = await r.json(); showCount(model, j.count); }
    } catch { /* offline or service unavailable: the local favourite still works */ }
  }, 400));
}
function setFav(model, name, on) {
  const f = favs();
  if (on) f[model] = { name, at: Date.now() }; else delete f[model];
  store.set('bm:favs', f);
  paintFavs();
  sendFavourite(model, on);
}
function paintFavs() {
  const f = favs();
  for (const b of $$('[data-fav]')) {
    const on = !!f[b.dataset.fav];
    b.setAttribute('aria-pressed', on);
    b.querySelector('[aria-hidden]').textContent = on ? '♥' : '♡';
    const l = b.querySelector('.fav-label'); if (l) l.textContent = on ? 'In your favourites' : 'Add to favourites';
  }
}
function showCount(model, n) {
  for (const b of $$(`[data-fav="${model}"]`)) {
    let c = b.parentElement.querySelector('.fav-count');
    if (!c) { c = document.createElement('span'); c.className = 'fav-count hint'; b.after(c); }
    c.textContent = n >= 3 ? `${n} visitors favourited` : '';
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fav]');
  if (!b) return;
  const model = b.dataset.fav, name = b.dataset.name, on = !favs()[model];
  setFav(model, name, on);
  toast(on ? `${name} added to your favourites (this browser only).` : `${name} removed from your favourites.`, () => setFav(model, name, !on));
});
const favBtn = $('[data-fav]');
if (favBtn) fetch(api(`/api/favourites/count?model=${encodeURIComponent(favBtn.dataset.fav)}`)).then(r => r.ok ? r.json() : null).then(j => j && showCount(favBtn.dataset.fav, j.count)).catch(() => {});

// ---------- saved appearances: this browser only ----------
const saved = () => store.get('bm:saved', {});
function setSaved(b, on) {
  const s = saved();
  if (on) s[b.dataset.save] = { model: b.dataset.model, brand: b.dataset.brand, label: b.dataset.label, kind: b.dataset.kind, url: b.dataset.url, at: Date.now() };
  else delete s[b.dataset.save];
  store.set('bm:saved', s);
  paintSaved();
}
function paintSaved() {
  const s = saved();
  for (const b of $$('[data-save]')) {
    const on = !!s[b.dataset.save];
    b.setAttribute('aria-pressed', on);
    b.innerHTML = `<span aria-hidden="true">${on ? '★' : '☆'}</span> ${on ? 'Saved' : 'Save'}`;
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-save]');
  if (!b) return;
  const on = !saved()[b.dataset.save];
  setSaved(b, on);
  toast(on ? 'Appearance saved to My favourites (this browser only).' : 'Removed from saved appearances.', () => setSaved(b, !on));
});
paintFavs();
paintSaved();

// ---------- timeline filters ----------
function applyFilter(root, kind, brand) {
  for (const b of $$('[data-filter]', root)) b.setAttribute('aria-pressed', b.dataset.filter === kind);
  const scope = root.closest('.timeline') || document;
  for (const el of $$('[data-kind]', scope)) {
    if (el.matches('[data-filter]')) continue;
    el.hidden = !((kind === 'all' || el.dataset.kind === kind) && (!brand || el.dataset.brand === brand));
  }
  for (const y of $$('.year-block, .season-group', scope)) y.hidden = !$$('[data-kind]', y).some(el => !el.hidden);
}
for (const group of $$('.filters')) {
  group.addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    applyFilter(group, b.dataset.filter, null);
    const url = new URL(location.href);
    if (b.dataset.filter === 'all') url.searchParams.delete('kind'); else url.searchParams.set('kind', b.dataset.filter);
    url.searchParams.delete('label');
    history.replaceState(null, '', url);
  });
  const k = params.get('kind'), lb = params.get('label');
  if ((k && KINDS.includes(k)) || lb) {
    applyFilter(group, k && KINDS.includes(k) ? k : 'all', lb ? slug(lb) : null);
    if (lb) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.innerHTML = `Showing one label only. <a href="${location.pathname}">Show all</a>`;
      group.after(note);
    }
  }
}

// ---------- photo viewer ----------
const box = $('#lightbox');
let boxSet = [], boxAt = 0;
const modelHref = n => u(`/model/${slug(n)}/`);
const names = ns => ns.map(n => `<a href="${modelHref(n)}">${esc(n)}</a>`).join(', ');
function show() {
  const it = boxSet[boxAt];
  const img = it.img;
  box.querySelector('.lb-img').innerHTML = `<img src="${esc(media(img.src))}" alt="${esc(it.alt || '')}">`;
  const count = boxSet.length > 1 ? `<p class="lb-count">${boxAt + 1} / ${boxSet.length}</p>` : '';
  if (it.press) {
    box.querySelector('.lb-caption').innerHTML = `<div class="eyebrow">Press photo · not a campaign photo</div><h3><a href="${modelHref(it.press)}">${esc(it.press)}</a></h3>
      ${img.title ? `<p>${esc(img.title)}</p>` : ''}<p class="sources">Photo: <a href="${esc(img.from)}" target="_blank" rel="noopener noreferrer">${esc(img.credit || 'source')} ↗</a> · © its owner</p>${count}`;
  } else {
    const c = it.c;
    const who = img.talent?.length ? img.talent : null;
    box.querySelector('.lb-caption').innerHTML = `
      <div class="eyebrow"><a href="${esc(u(c.brandPath))}">${esc(c.brand)}</a> · ${esc(c.label)}</div>
      ${who ? `<p class="lb-who">Identified in this photo</p><h3>${names(who)}</h3>`
            : `<h3>Models not identified individually</h3><p>Credited for this ${c.label ? 'appearance' : 'record'}: ${names(c.talent)}</p>`}
      ${c.photographer ? `<p>Photography: ${esc(c.photographer)}</p>` : ''}
      ${img.from ? `<p class="sources">Photo: <a href="${esc(img.from)}" target="_blank" rel="noopener noreferrer">${esc(img.credit || 'source')} ↗</a> · © its owner</p>` : ''}
      ${c.sources?.length ? `<p class="sources">Source: ${c.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>`).join(' · ')}</p>` : ''}${count}`;
  }
  box.querySelectorAll('.lb-nav').forEach(b => { b.hidden = boxSet.length < 2; });
}
function open(set, at = 0) {
  if (!box || !set.length) return;
  boxSet = set; boxAt = at; show();
  if (!box.open) box.showModal();
}
const creditOf = id => data.credits?.[id];
document.addEventListener('click', e => {
  if (!box) return;
  const g = e.target.closest('[data-campaign-gallery]');
  if (g) {
    const c = creditOf(g.dataset.campaignGallery);
    if (c) open(c.images.filter(i => !i.talent.includes(g.dataset.person)).map(img => ({ c, img })));
    return;
  }
  const shot = e.target.closest('.shot, .hero-image, .entry-thumb, .row-pic, .card-img');
  const img = shot?.querySelector('img[data-c], img[data-m]');
  if (!img) return;
  e.preventDefault();
  if (img.dataset.m) {
    const p = data.press?.[img.dataset.m];
    if (p) open(p.items.map(k => ({ press: p.name, img: k, alt: `Press photo of ${p.name}` })), Number(img.dataset.p) || 0);
    return;
  }
  const c = creditOf(img.dataset.c);
  if (!c) return;
  // On a model's page the viewer pages through only the photos attributed to her; elsewhere, all of the campaign's.
  const person = img.closest('[data-person]')?.dataset.person;
  const clicked = c.images[Number(img.dataset.i)];
  const set = (person ? c.images.filter(i => i.talent.includes(person)) : c.images).map(i => ({ c, img: i }));
  open(set, Math.max(0, set.findIndex(x => x.img === clicked)));
});
if (box) {
  const step = d => { boxAt = (boxAt + d + boxSet.length) % boxSet.length; show(); };
  box.querySelector('.lb-prev').addEventListener('click', () => step(-1));
  box.querySelector('.lb-next').addEventListener('click', () => step(1));
  box.querySelector('.lb-close').addEventListener('click', () => box.close());
  box.addEventListener('click', e => { if (e.target === box) box.close(); });
  box.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); });
  let x0 = null;
  box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', e => { if (x0 === null || boxSet.length < 2) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); });
}

// ---------- my favourites ----------
const myFavs = $('#myFavs');
if (myFavs) {
  const render = () => {
    const f = Object.entries(favs()).sort((a, b) => a[1].name.localeCompare(b[1].name));
    const s = Object.entries(saved()).sort((a, b) => b[1].at - a[1].at);
    myFavs.innerHTML = `
      <section><div class="section-top"><h2>Favourite models</h2><span class="hint">${f.length}</span></div>
      ${f.length ? `<ul class="fav-list">${f.map(([k, v]) => `<li><a href="${u(`/model/${esc(k)}/`)}">${esc(v.name)}</a> <button type="button" class="link-btn" data-unfav="${esc(k)}">Remove</button></li>`).join('')}</ul>` : '<p class="hint">No favourite models yet. Use ♡ on a model’s page.</p>'}</section>
      <section><div class="section-top"><h2>Saved appearances</h2><span class="hint">${s.length}</span></div>
      ${s.length ? `<ul class="rows">${s.map(([k, v]) => `<li><span class="row-brand"><a href="${esc(u(v.url))}">${esc(v.brand)}</a><small>${esc(v.label)} · ${esc(v.kind)}</small></span><span class="row-who"><a href="${u(`/model/${slug(v.model)}/`)}">${esc(v.model)}</a></span><span class="src"><button type="button" class="link-btn" data-unsave="${esc(k)}">Remove</button></span></li>`).join('')}</ul>` : '<p class="hint">No saved appearances yet. Use ☆ Save on a timeline entry.</p>'}</section>
      <p class="hint">Stored in this browser only. They do not sync to other devices or browsers.</p>`;
  };
  render();
  myFavs.addEventListener('click', e => {
    const u = e.target.closest('[data-unfav]');
    if (u) { const k = u.dataset.unfav, v = favs()[k]; setFav(k, v.name, false); render(); toast(`${v.name} removed.`, () => { setFav(k, v.name, true); render(); }); }
    const r = e.target.closest('[data-unsave]');
    if (r) { const k = r.dataset.unsave, s = saved(), v = s[k]; delete s[k]; store.set('bm:saved', s); render(); toast('Appearance removed.', () => { const s2 = saved(); s2[k] = v; store.set('bm:saved', s2); render(); }); }
  });
}

// ---------- most featured: period and kind selector ----------
const rankForm = $('#rankControls');
if (rankForm) {
  let table = null;
  const per = $('#rankPeriod'), kindSel = $('#rankKind');
  if (params.get('period')) per.value = params.get('period');
  if (params.get('kind')) kindSel.value = params.get('kind');
  const draw = () => {
    if (!table) return;
    const p = table.periods.find(x => x.id === per.value) || table.periods[0];
    const rows = rankModels(table, p.years, { kind: kindSel.value || null, limit: 50 });
    $('#rankHeading').textContent = `${p.label}${kindSel.value ? ' · ' + KIND_PLURAL[kindSel.value] : ''}`;
    $('#rankResult').innerHTML = rows.length ? `<div class="table-wrap"><table class="rank-table"><thead><tr><th scope="col">#</th><th scope="col">Model</th><th scope="col">Appearances</th>${KINDS.map(k => `<th scope="col">${KIND_PLURAL[k]}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><th scope="row"><a href="${u(`/model/${r.slug}/`)}">${esc(r.name)}</a></th><td>${r.total}</td>${r.byKind.map(n => `<td>${n || '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">No documented appearances for this selection.</p>';
    const url = new URL(location.href);
    url.searchParams.set('period', p.id); if (kindSel.value) url.searchParams.set('kind', kindSel.value); else url.searchParams.delete('kind');
    history.replaceState(null, '', url);
  };
  fetch(api('/data/rankings.json')).then(r => r.json()).then(t => { table = t; if (params.get('period') || params.get('kind')) draw(); });
  per.addEventListener('change', draw);
  kindSel.addEventListener('change', draw);
  rankForm.addEventListener('submit', e => { e.preventDefault(); draw(); });
}

// ---------- fan favourites ----------
const fan = $('#fanResult');
if (fan) {
  const load = async w => {
    for (const b of $$('[data-window]')) b.setAttribute('aria-pressed', b.dataset.window === w);
    try {
      const r = await fetch(api(`/api/favourites/top?window=${w}`));
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      fan.innerHTML = j.models.length ? `<ol class="rank-mini wide">${j.models.map(m => `<li><a href="${u(`/model/${esc(m.model)}/`)}">${esc(m.name || m.model)}</a> <small>${m.count} ${m.count === 1 ? 'favourite' : 'favourites'}</small></li>`).join('')}</ol>`
        : '<p class="empty">Not enough favourites yet for this period.</p>';
    } catch {
      fan.innerHTML = '<p class="empty">Fan favourites are unavailable right now. The rest of the archive works as usual.</p>';
    }
  };
  $$('[data-window]').forEach(b => b.addEventListener('click', () => load(b.dataset.window)));
  load('30d');
}

// ---------- search ----------
const results = $('#searchResults');
const input = $('#search');
if (results) {
  let idx = null;
  const q0 = params.get('q') || '';
  input.value = q0;
  const kindWord = { cover: /\b(covers?|magazines?)\b/, runway: /\b(runway|shows?|catwalk)\b/, campaign: /\b(campaigns?|ads?)\b/, ambassador: /\b(ambassadors?|ambassadorships?)\b/ };
  const run = q => {
    const n = norm(q);
    $('#searchTitle').textContent = n ? `“${q}”` : 'Search the archive';
    if (!n || !idx) { results.innerHTML = ''; return; }
    let rest = ` ${n} `;
    // a model or label named in full in the query
    const model = idx.models.filter(m => rest.includes(` ${norm(m[0])} `)).sort((a, b) => b[0].length - a[0].length)[0];
    if (model) rest = rest.replace(` ${norm(model[0])} `, ' ');
    const brand = idx.brands.filter(b => [b[0], ...b[3]].some(x => norm(x) && rest.includes(` ${norm(x)} `))).sort((a, b) => b[4] - a[4])[0];
    if (brand) for (const x of [brand[0], ...brand[3]]) rest = rest.replace(` ${norm(x)} `, ' ');
    const kind = Object.keys(kindWord).find(k => kindWord[k].test(rest));
    if (kind) rest = rest.replace(kindWord[kind], ' ');
    const terms = norm(rest).split(' ').filter(Boolean);
    const hit = s => { const h = norm(s); return terms.length && terms.every(t => h.includes(t)); };
    const top = [];
    if (model && brand) {
      const combo = idx.combos.includes(`${model[1]}|${brand[1]}`);
      top.push(`<a class="best" href="${u(combo ? `/model/${model[1]}/${brand[1]}/` : `/model/${model[1]}/?label=${brand[1]}`)}"><b>${esc(model[0])} × ${esc(brand[0])}</b><small>${combo ? 'All her documented appearances with this label' : 'Her timeline, filtered to this label'}</small></a>`);
    } else if (model && kind) {
      const coverPage = kind === 'cover' && idx.covers.includes(model[1]);
      top.push(`<a class="best" href="${u(coverPage ? `/model/${model[1]}/covers/` : `/model/${model[1]}/?kind=${kind}`)}"><b>${esc(model[0])} — ${esc(KIND_PLURAL[kind].toLowerCase())}</b><small>From her documented timeline</small></a>`);
    }
    if (model && !top.length) top.push(`<a class="best" href="${u(`/model/${model[1]}/`)}"><b>${esc(model[0])}</b><small>${model[2]} credits · timeline</small></a>`);
    if (brand && !model) top.push(`<a class="best" href="${u(`/${brand[2] ? 'magazine' : 'brand'}/${brand[1]}/${kind ? `?kind=${kind}` : ''}`)}"><b>${esc(brand[0])}</b><small>${brand[4]} credits</small></a>`);
    const models = terms.length ? idx.models.filter(m => hit(m[0])).sort((a, b) => b[2] - a[2]).slice(0, 40) : [];
    const brands = terms.length ? idx.brands.filter(b => hit([b[0], ...b[3]].join(' '))).sort((a, b) => b[4] - a[4]).slice(0, 40) : [];
    $('#searchSummary').textContent = top.length || models.length || brands.length ? '' : 'No matches. Try another spelling, or browse models and labels.';
    results.innerHTML = `${top.length ? `<div class="best-list">${top.join('')}</div>` : ''}
      ${models.length ? `<div class="results-group"><h2>Models</h2><div class="directory">${models.map(m => `<a href="${u(`/model/${m[1]}/`)}"><span>${esc(m[0])}</span><small>${m[2]} credits</small></a>`).join('')}</div></div>` : ''}
      ${brands.length ? `<div class="results-group"><h2>Labels &amp; magazines</h2><div class="directory">${brands.map(b => `<a href="${u(`/${b[2] ? 'magazine' : 'brand'}/${b[1]}/`)}"><span>${esc(b[0])}</span><small>${b[4]} credits</small></a>`).join('')}</div></div>` : ''}`;
  };
  fetch(api('/data/search-index.json')).then(r => r.json()).then(j => { idx = j; run(input.value); });
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { const url = new URL(location.href); url.searchParams.set('q', input.value); history.replaceState(null, '', url); run(input.value); }, 120); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); run(input.value); });
}

// ---------- suggestion form ----------
const form = $('#suggestForm');
if (form) {
  const set = (id, v) => { if (v) $(id).value = v; };
  set('#sg-model', params.get('model')); set('#sg-brand', params.get('brand')); set('#sg-record', params.get('record'));
  set('#sg-page', document.referrer && new URL(document.referrer, location.href).origin === location.origin ? new URL(document.referrer).pathname.slice(BASE.length - 1) : '');
  $('#sg-ts').value = String(Date.now());
  if (params.get('type') === 'correction') form.querySelector('input[value="correction"]').checked = true;
  if (params.get('sent')) $('#sent').hidden = false;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#sg-error');
    err.textContent = '';
    const body = Object.fromEntries(new FormData(form));
    try {
      const r = await fetch(api('/api/submissions'), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = j.error || 'The suggestion could not be sent. Please try again later.'; return; }
      form.reset(); form.hidden = true; $('#sent').hidden = false; $('#sent').focus?.();
    } catch {
      err.textContent = 'The suggestion service is unavailable right now. Please try again later.';
    }
  });
}
if ($('#removalSent') && params.get('sent')) $('#removalSent').hidden = false;
