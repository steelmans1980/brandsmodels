// Browser enhancements for the static pages. Every page is readable without this script; it adds the photo viewer,
// the generation filters, the comparison tool, the Dream garage, search, the popularity list and the suggestion form.
// Personal saves live in localStorage; public save counts go to /api (optional: the site works without it).
import { compareTable, Refs } from './render.mjs';
import { norm, plural } from './lib.mjs';

// Site-relative paths: '/cars/x/' on the live site, or under a sub-path when the site is previewed elsewhere.
const BASE = new URL('./', import.meta.url).pathname;
const PREVIEW = document.documentElement.dataset.preview === '1';
const u = p => { const m = String(p).match(/^([^?#]*)(.*)$/); return BASE + m[1].replace(/^\//, '') + (PREVIEW && m[1].endsWith('/') ? 'index.html' : '') + m[2]; };
const api = p => BASE + p.replace(/^\//, '');

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const data = (() => { try { return JSON.parse($('#page-data')?.textContent || '{}'); } catch { return {}; } })();
const getJson = async p => { const r = await fetch(u(p)); if (!r.ok) throw new Error(r.status); return r.json(); };

// ---------- links from the earlier website (#/model/…) are not redirected: say so instead ----------
if (/^#\/(model|brand|brands|models|year|years|search|about|privacy)\b/.test(location.hash)) {
  const n = document.createElement('p');
  n.className = 'notice'; n.setAttribute('role', 'status');
  n.textContent = 'The page this link pointed to belonged to the earlier website at this address and has been retired.';
  $('main')?.prepend(n);
  history.replaceState(null, '', location.pathname + location.search);
}

// ---------- storage (never throws) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};
function visitorId() {
  let v = store.get('ca:vid', null);
  if (!v) { v = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()); store.set('ca:vid', v); }
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

// ---------- Dream garage: local list + idempotent anonymous public count ----------
const garage = () => store.get('ca:garage', {});
const pending = new Map();
function sendSave(item, on) {
  // The server stores a set of (browser, item): repeating a request changes nothing, so retries are safe.
  clearTimeout(pending.get(item));
  pending.set(item, setTimeout(async () => {
    try {
      const r = await fetch(api('/api/garage'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitor: visitorId(), item, on }) });
      if (r.ok) { const j = await r.json(); showCount(item, j.count); }
    } catch { /* offline or service unavailable: the local garage still works */ }
  }, 400));
}
function setSaved(item, meta, on) {
  const g = garage();
  if (on) g[item] = { ...meta, at: Date.now() }; else delete g[item];
  store.set('ca:garage', g);
  paintGarage();
  sendSave(item, on);
}
function paintGarage() {
  const g = garage();
  for (const b of $$('[data-garage]')) {
    const on = !!g[b.dataset.garage];
    b.setAttribute('aria-pressed', on);
    b.querySelector('[aria-hidden]').textContent = on ? '★' : '☆';
    b.querySelector('.label').textContent = on ? 'In your Dream garage' : 'Add to Dream garage';
  }
  const n = Object.keys(g).length;
  for (const c of $$('.garage-count')) { c.hidden = !n; c.textContent = n ? `(${n})` : ''; }
}
function showCount(item, n) {
  for (const c of $$(`[data-count-for="${CSS.escape(item)}"]`)) { c.hidden = !(n >= 3); c.textContent = n >= 3 ? `Saved by ${n} visitors` : ''; }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-garage]');
  if (!b) return;
  const item = b.dataset.garage, meta = { name: b.dataset.name, url: b.dataset.url, type: item.split(':')[0] }, on = !garage()[item];
  setSaved(item, meta, on);
  toast(on ? `${meta.name} added to your Dream garage (this browser only).` : `${meta.name} removed from your Dream garage.`, () => setSaved(item, meta, !on));
});
paintGarage();
const firstSave = $('[data-garage]');
if (firstSave) fetch(api(`/api/garage/count?item=${encodeURIComponent(firstSave.dataset.garage)}`)).then(r => r.ok ? r.json() : null).then(j => j && showCount(firstSave.dataset.garage, j.count)).catch(() => {});

// ---------- comparison selection (up to three generations) ----------
const MAX = 3;
const picked = () => store.get('ca:compare', []).slice(0, MAX);
function setPicked(ids) { store.set('ca:compare', ids.slice(0, MAX)); paintCompare(); }
function paintCompare() {
  const ids = picked();
  for (const b of $$('[data-compare]')) { const on = ids.includes(b.dataset.compare); b.setAttribute('aria-pressed', on); b.textContent = on ? '✓ In comparison' : '+ Compare'; }
  let tray = $('#compare-tray');
  if (!ids.length || location.pathname.endsWith('/compare/') || location.pathname.endsWith('/compare/index.html')) { tray?.remove(); return; }
  if (!tray) { tray = document.createElement('div'); tray.id = 'compare-tray'; tray.className = 'compare-tray'; document.body.append(tray); }
  tray.innerHTML = `<span>${ids.length} of ${MAX} selected for comparison</span> <a class="btn" href="${esc(u('/compare/?g=' + ids.join(',')))}">Compare</a> <button type="button" class="link-btn" id="trayClear">Clear</button>`;
  $('#trayClear').onclick = () => setPicked([]);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-compare]');
  if (!b) return;
  const id = b.dataset.compare, ids = picked();
  if (ids.includes(id)) { setPicked(ids.filter(x => x !== id)); return; }
  if (ids.length >= MAX) { toast(`You can compare up to ${MAX} generations. Remove one first.`); return; }
  setPicked([...ids, id]);
  toast(`${b.dataset.name} added to the comparison.`, () => setPicked(picked().filter(x => x !== id)));
});
paintCompare();

// ---------- photo viewer ----------
const box = $('#lightbox');
let boxSet = [], boxAt = 0;
function show() {
  const it = data.images[boxSet[boxAt]];
  box.querySelector('.lb-img').innerHTML = `<img src="${esc(u(it.src))}" alt="${esc(it.caption)}">`;
  box.querySelector('.lb-caption').innerHTML = `${it.rep ? '<div class="eyebrow">Representative image — shows the generation in general</div>' : ''}<h3>${esc(it.caption)}</h3>
    <p class="sources">${esc(it.credit)}${it.page ? ` · <a href="${esc(it.page)}" target="_blank" rel="noopener noreferrer">file page ↗</a>` : ''}${it.licenseUrl ? ` · <a href="${esc(it.licenseUrl)}" target="_blank" rel="license noopener noreferrer">licence ↗</a>` : ''}</p>${boxSet.length > 1 ? `<p class="lb-count">${boxAt + 1} / ${boxSet.length}</p>` : ''}`;
  box.querySelectorAll('.lb-nav').forEach(b => { b.hidden = boxSet.length < 2; });
}
document.addEventListener('click', e => {
  const shot = e.target.closest('[data-img]');
  if (!shot || !box || !data.images?.[shot.dataset.img]) return;
  e.preventDefault();
  boxSet = [...new Set($$('[data-img]').map(x => x.dataset.img))].filter(id => data.images[id]);
  boxAt = Math.max(0, boxSet.indexOf(shot.dataset.img));
  show();
  if (!box.open) box.showModal();
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

// ---------- filters on /cars/: OR within a group, AND across groups; state kept in the URL ----------
const panel = $('#filters');
if (panel) {
  panel.hidden = false;
  const keys = ['body', 'fuel', 'seats', 'drive'];
  const state = Object.fromEntries(keys.map(k => [k, new Set((params.get(k) || '').split(',').filter(Boolean))]));
  const apply = () => {
    let shown = 0;
    const cards = $$('#gen-grid .gen-card');
    for (const c of cards) {
      const ok = keys.every(k => !state[k].size || (c.dataset[k] || '').split('|').some(v => state[k].has(v)));
      c.hidden = !ok; if (ok) shown++;
    }
    for (const b of $$('[data-filter-key]', panel)) b.setAttribute('aria-pressed', state[b.dataset.filterKey].has(b.dataset.filterValue));
    $('.filter-status', panel).textContent = keys.some(k => state[k].size) ? `${shown} of ${cards.length} generations match.` : `${cards.length} generations.`;
    const q = new URLSearchParams(); for (const k of keys) if (state[k].size) q.set(k, [...state[k]].join(','));
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  };
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-filter-key]'); if (!b) return;
    const s = state[b.dataset.filterKey], v = b.dataset.filterValue;
    s.has(v) ? s.delete(v) : s.add(v);
    apply();
  });
  apply();
}

// ---------- comparison page ----------
let compareData;
async function loadCompare() {
  if (compareData) return compareData;
  const j = await getJson('/data/compare.json');
  const fams = {};
  for (const [id, f] of Object.entries(j.families)) fams[id] = { ...f, path: u(f.path) };
  const gens = new Map(j.gens.map(g => [g.id, { ...g, path: u(g.path), family: fams[g.familyId] }]));
  return (compareData = { fams, gens });
}
const app = $('#compare-app');
if (app) {
  app.hidden = false;
  const start = (params.get('g') || '').split(',').filter(Boolean);
  if (start.length) store.set('ca:compare', start.slice(0, MAX));
  const render = async () => {
    const ids = picked();
    const out = $('#compareOut'), chosen = $('#compareChosen');
    try {
      const { gens } = await loadCompare();
      const sel = ids.map(id => gens.get(id)).filter(Boolean);
      chosen.innerHTML = sel.map(g => `<span class="chip">${esc(g.family.name)} ${esc(g.codes?.[0]?.value || g.name)} <button type="button" class="link-btn" data-remove="${esc(g.id)}" aria-label="Remove ${esc(g.family.name)} ${esc(g.name)}">×</button></span>`).join('');
      $('#compareAdd').disabled = sel.length >= MAX;
      if (sel.length < 2) { out.innerHTML = `<p class="hint">${sel.length ? 'Add at least one more generation.' : 'Pick generations above, use “+ Compare” on any generation page, or compare the generations in your Dream garage.'}</p>`; }
      else { const refs = new Refs(); out.innerHTML = compareTable(refs, sel) + refs.html(); }
      history.replaceState(null, '', location.pathname + (ids.length ? '?g=' + ids.join(',') : ''));
    } catch { out.innerHTML = '<p class="notice">The comparison data could not be loaded. Each pair of consecutive generations also has its own page below.</p>'; }
  };
  $('#compareAdd').addEventListener('change', e => { const v = e.target.value; e.target.value = ''; if (v && !picked().includes(v)) setPicked([...picked(), v]); render(); });
  app.addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (!b) return; setPicked(picked().filter(x => x !== b.dataset.remove)); render(); });
  render();
}

// ---------- Dream garage page ----------
const gEl = $('#garage');
if (gEl) {
  gEl.hidden = false;
  const paint = () => {
    const g = garage();
    const items = Object.entries(g).sort((a, b) => b[1].at - a[1].at);
    $('#garage-list').innerHTML = items.length ? `<ul class="garage-list">${items.map(([k, v]) => `<li><a href="${esc(u(v.url))}">${esc(v.name)}</a> <span class="muted">${v.type === 'family' ? 'model family' : 'generation'}</span> <button type="button" class="link-btn" data-unsave="${esc(k)}">Remove</button></li>`).join('')}</ul>`
      : '<p class="empty">Your Dream garage is empty. Use “Add to Dream garage” on any model family or generation page.</p>';
    const gens = items.filter(([k]) => k.startsWith('generation:')).map(([k]) => k.slice(11));
    const btn = $('#garageCompare');
    btn.disabled = gens.length < 2;
    btn.textContent = gens.length > MAX ? `Compare the ${MAX} most recently saved generations` : 'Compare saved generations';
    btn.onclick = () => { location.href = u('/compare/?g=' + gens.slice(0, MAX).join(',')); };
  };
  gEl.addEventListener('click', e => {
    const b = e.target.closest('[data-unsave]'); if (!b) return;
    const k = b.dataset.unsave, meta = garage()[k];
    setSaved(k, meta, false); paint();
    toast(`${meta.name} removed from your Dream garage.`, () => { setSaved(k, meta, true); paint(); });
  });
  paint();
}

// ---------- popular in dream garages ----------
const popOut = $('#popular-out');
if (popOut) {
  const names = getJson('/data/search-index.json').catch(() => null);
  const load = async w => {
    for (const b of $$('[data-window]')) b.setAttribute('aria-pressed', b.dataset.window === w);
    popOut.innerHTML = '<p class="hint">Loading…</p>';
    try {
      const [r, n] = await Promise.all([fetch(api(`/api/garage/top?window=${w}`)), names]);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      const label = it => {
        const [type, id] = it.item.split(/:(.*)/);
        const x = (type === 'generation' ? n?.gens : n?.families)?.find(y => y.id === id);
        return x ? `<a href="${esc(u(x.u))}">${esc(x.n)}</a> <span class="muted">${type === 'generation' ? 'generation' : 'model family'}</span>` : esc(id);
      };
      popOut.innerHTML = j.items.length ? `<ol class="popular">${j.items.map(it => `<li>${label(it)} <span class="count">${plural(it.count, 'save')}</span></li>`).join('')}</ol>`
        : '<p class="empty">Nothing has been saved by at least 3 visitors in this period yet.</p>';
    } catch { popOut.innerHTML = '<p class="notice">The counting service is not available right now. The archive itself works as usual.</p>'; }
  };
  for (const b of $$('[data-window]')) b.addEventListener('click', () => load(b.dataset.window));
  load('30d');
}

// ---------- search ----------
const results = $('#search-results');
if (results) {
  const q = (params.get('q') || '').trim();
  for (const i of $$('input[name=q]')) i.value = q;
  if (q) {
    $('#search-title').textContent = `Search: ${q}`;
    document.title = `Search: ${q} — The Car Archive`;
    getJson('/data/search-index.json').then(ix => { results.innerHTML = searchHtml(ix, q); }).catch(() => { results.innerHTML = '<p class="notice">Search could not load. Browse <a href="' + esc(u('/manufacturers/')) + '">manufacturers</a> instead.</p>'; });
  }
}
function searchHtml(ix, q) {
  const words = norm(q).split(' ').filter(Boolean);
  const years = words.filter(w => /^(19|20)\d{2}$/.test(w)).map(Number);
  const terms = words.filter(w => !/^(19|20)\d{2}$/.test(w));
  const hay = g => norm([g.m, g.f, g.n, g.name, ...g.codes, ...g.alt].join(' '));
  const match = (text, ts) => ts.every(t => text.split(' ').some(w => w === t || (t.length > 1 && w.startsWith(t))));
  const famHits = terms.length ? ix.families.filter(f => match(norm([f.m, f.n, ...f.alt].join(' ')), terms)) : [];
  const makerHits = terms.length ? ix.makers.filter(m => match(norm(m.n), terms)) : [];
  let gens = ix.gens.filter(g => !terms.length || match(hay(g), terms));
  const codeHit = terms.length && gens.filter(g => g.codes.some(c => terms.includes(norm(c)))).length;
  if (codeHit) gens = gens.filter(g => g.codes.some(c => terms.includes(norm(c))));
  const sec = (title, items) => items.length ? `<section class="results-group"><h2>${title}</h2>${items.join('')}</section>` : '';
  const genLi = (g, extra = '') => `<li><a href="${esc(u(g.u))}">${esc(g.n)}</a> <span class="muted">${esc(g.name)} · production ${esc(g.p)}${extra}</span></li>`;
  let out = '';
  if (years.length) {
    for (const y of years) {
      const prod = gens.filter(g => g.y0 != null && g.y0 <= y && (g.y1 ?? -1) >= y);
      const my = gens.flatMap(g => g.my.filter(([, a, b]) => a <= y && (b ?? 9999) >= y).map(([m]) => ({ g, m })));
      out += sec(`In production in ${y} <span class="muted">(calendar year)</span>`, prod.length ? [`<ul class="events">${prod.map(g => genLi(g)).join('')}</ul>`] : ['<p class="nd-block">No matching generation in production that year.</p>']);
      out += sec(`Model year ${y}`, my.length ? [`<ul class="events">${my.map(({ g, m }) => genLi(g, ` · model year ${y} in ${m}`)).join('')}</ul>`] : ['<p class="nd-block">No matching generation with documented model-year data for that year.</p>']);
      out += `<p><a class="line-link" href="${esc(u(`/years/${y}/`))}">Everything that happened in ${y}</a></p>`;
    }
  } else {
    out += sec('Manufacturers', makerHits.map(m => `<p><a href="${esc(u(m.u))}">${esc(m.n)}</a></p>`));
    out += sec('Model families', famHits.map(f => `<p><a href="${esc(u(f.u))}">${esc(f.n)}</a>${f.alt.length > 1 ? ` <span class="muted">also sold as ${esc(f.alt.join(', '))}</span>` : ''}</p>`));
    out += sec('Generations', gens.length && terms.length ? [`<ul class="events">${gens.slice(0, 40).map(g => genLi(g)).join('')}</ul>`] : []);
  }
  return out || `<p class="empty">Nothing matches “${esc(q)}”. Try a manufacturer, a model name, a generation code such as E70 or XA50, or a year.</p>`;
}

// ---------- suggestion form ----------
const form = $('#suggestForm');
if (form) {
  if (params.get('sent') === '1') $('#sent-notice').hidden = false;
  const t = params.get('type');
  if (['car', 'source', 'correction'].includes(t)) form.querySelector(`input[name=type][value=${t}]`).checked = true;
  form.elements.target.value = params.get('target') || '';
  form.elements.page.value = document.referrer && new URL(document.referrer).origin === location.origin ? new URL(document.referrer).pathname : '';
  form.elements.ts.value = String(Date.now());
  const target = params.get('target') || '';
  if (target) {
    getJson('/data/search-index.json').then(ix => {
      const g = ix.gens.find(x => x.id === target.split('#')[0]);
      if (g) { form.elements.make.value ||= g.m; form.elements.model.value ||= g.f.replace(g.m + ' ', ''); form.elements.generation.value ||= g.codes[0] || g.name; }
    }).catch(() => {});
  }
  const sync = () => { const ty = form.elements.type.value; $('.photo-only', form).hidden = ty !== 'source'; form.elements.sourceUrl.required = ty === 'correction'; };
  form.addEventListener('change', sync); sync();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const status = $('.form-status', form);
    const body = Object.fromEntries(new FormData(form));
    status.textContent = 'Sending…';
    try {
      const r = await fetch(api('/api/submissions'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { form.reset(); form.elements.ts.value = String(Date.now()); sync(); status.textContent = ''; $('#sent-notice').hidden = false; $('#sent-notice').scrollIntoView({ block: 'center' }); }
      else status.textContent = j.error || 'Could not send right now. Please try again later.';
    } catch { status.textContent = 'Could not send right now. Please try again later.'; }
  });
}
