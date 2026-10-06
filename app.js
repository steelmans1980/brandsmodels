// The Campaign Edit — static archive of brand campaigns and the women who fronted them.
// All data lives in data/campaigns.json; this file only reads and renders it.
(() => {
  'use strict';

  // Chronological order of seasons within a year (higher = later in the year).
  const SEASON_ORDER = {
    'Full year': 0, 'Resort': 1, 'Cruise': 1, 'Spring': 2, 'Spring/Summer': 2, 'Summer': 3,
    'Pre-Fall': 4, 'Fall': 5, 'Fall/Winter': 5, 'Winter': 6, 'Holiday': 7
  };

  const app = document.getElementById('app');
  const searchInput = document.getElementById('search');
  let db = null;

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const slug = s => norm(s).replace(/ /g, '-');
  const seasonRank = s => SEASON_ORDER[s] ?? 0;
  const byNewest = (a, b) => b.year - a.year || seasonRank(b.season) - seasonRank(a.season) || a.brand.localeCompare(b.brand);
  const label = c => (c.season && c.season !== 'Full year' ? c.season + ' ' : '') + c.year;
  const brandLink = name => `<a href="#/brand/${slug(name)}">${esc(name)}</a>`;
  const modelLink = name => `<a href="#/model/${slug(name)}">${esc(name)}</a>`;
  const list = names => names.map(modelLink).join(', ');
  const range = (a, b) => a === b ? String(a) : `${a}–${b}`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function groupBy(items, key) {
    const m = new Map();
    for (const it of items) { const k = key(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
    return m;
  }

  // ---------- data ----------
  function buildIndex(raw) {
    const campaigns = raw.campaigns.map((c, i) => {
      const images = (c.images || (c.image ? [{ src: c.image }] : [])).map(img => ({ talent: [], ...img }));
      return { ...c, id: i, talent: c.talent || [], sources: c.sources || [], images };
    });
    campaigns.sort(byNewest);

    const brands = new Map();
    for (const [name, info] of Object.entries(raw.brands || {})) brands.set(slug(name), { name, ...info, campaigns: [] });
    const models = new Map();

    for (const c of campaigns) {
      const bs = slug(c.brand);
      if (!brands.has(bs)) brands.set(bs, { name: c.brand, campaigns: [] });
      brands.get(bs).campaigns.push(c);
      for (const t of c.talent) {
        const ms = slug(t);
        if (!models.has(ms)) models.set(ms, { name: t, campaigns: [] });
        models.get(ms).campaigns.push(c);
      }
      const b = brands.get(bs);
      c.haystack = norm([c.brand, ...(b.aliases || []), ...c.talent, c.photographer, c.title, c.season, c.year].join(' '));
    }
    for (const x of [...brands.values(), ...models.values()]) {
      const ys = x.campaigns.map(c => c.year);
      x.first = Math.min(...ys); x.last = Math.max(...ys);
    }
    for (const [k, b] of brands) if (!b.campaigns.length) brands.delete(k);
    return { updated: raw.updated, campaigns, brands, models };
  }

  // ---------- photos ----------
  // Photos of one person in a campaign: the ones tagged with her first, then untagged group shots.
  // With no person given, every photo of the campaign.
  function photosOf(c, person) {
    if (!person) return c.images;
    const mine = c.images.filter(i => i.talent.includes(person));
    const group = c.images.filter(i => !i.talent.length);
    return mine.length || group.length ? [...mine, ...group] : [];
  }
  const altText = (c, img) => `${(img.talent.length ? img.talent : c.talent).join(', ')} for ${c.brand}, ${label(c)}`;
  // On a model page only her own (or group) photos qualify, so another model's shot never stands in for her.
  const coverOf = (c, person) => person ? photosOf(c, person)[0] : c.images[0];

  // Every clickable photo carries data-c (campaign id) and data-i (index in c.images) for the lightbox.
  const photoTag = (c, img, extra = '') =>
    `<img src="${esc(img.src)}" alt="${esc(altText(c, img))}" loading="lazy" data-c="${c.id}" data-i="${c.images.indexOf(img)}" ${extra}>`;

  function visual(c, person) {
    const img = coverOf(c, person);
    if (img) return photoTag(c, img);
    return `<div class="placeholder"><b>${esc(c.brand)}</b><span>${esc(label(c))}</span></div>`;
  }

  // A strip of photos. `max` limits how many show; the last tile then says how many more there are.
  function gallery(c, person, max = 6) {
    const imgs = photosOf(c, person);
    if (!imgs.length) return '';
    const shown = imgs.slice(0, max), more = imgs.length - shown.length;
    return `<div class="gallery">${shown.map((img, n) => `<button class="shot" type="button" aria-label="Open photo: ${esc(altText(c, img))}">${photoTag(c, img)}${n === shown.length - 1 && more > 0 ? `<span class="more">+${more}</span>` : ''}</button>`).join('')}</div>`;
  }

  const sources = c => c.sources.length
    ? `<div class="sources">Source: ${c.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>`).join(' · ')}</div>` : '';

  const credits = c => [
    c.title ? `<p><em>${esc(c.title)}</em></p>` : '',
    c.photographer ? `<p>Photography: ${esc(c.photographer)}</p>` : '',
    c.note ? `<p>${esc(c.note)}</p>` : ''
  ].join('');

  const card = c => `
    <article class="card">
      <a class="card-img" href="#/brand/${slug(c.brand)}" aria-label="${esc(c.brand)} campaigns">${visual(c)}${c.images.length > 1 ? `<span class="count-badge">${c.images.length} photos</span>` : ''}</a>
      <div class="card-meta">${brandLink(c.brand)}<a href="#/year/${c.year}">${esc(label(c))}</a></div>
      <h3>${list(c.talent)}</h3>
      ${credits(c)}${sources(c)}
    </article>`;

  // One row on a timeline. On a brand page the headline is the models; on a model page (person given) it is the brand.
  function entry(c, person) {
    const others = person ? c.talent.filter(t => t !== person) : [];
    const pics = gallery(c, person);
    return `
    <div class="entry${pics ? ' has-photos' : ''}">
      ${pics ? '' : `<div class="entry-thumb">${visual(c, person)}</div>`}
      <div>
        <div class="season">${esc(c.season || '')}</div>
        <h3>${person ? brandLink(c.brand) : list(c.talent)}</h3>
        ${others.length ? `<p>With ${list(others)}</p>` : ''}
        ${credits(c)}${sources(c)}
      </div>
      ${pics}
    </div>`;
  }

  function timeline(campaigns, person) {
    const years = groupBy(campaigns, c => c.year);
    return [...years].map(([y, cs]) => `
      <section class="year-block" id="y${y}">
        <h2><a href="#/year/${y}" style="text-decoration:none">${y}</a></h2>
        <div class="entries">${cs.map(c => entry(c, person)).join('')}</div>
      </section>`).join('');
  }

  // A model as a card: her best photo, and the brands she has fronted.
  function modelCard(m) {
    const c = m.campaigns.find(x => photosOf(x, m.name).length) || m.campaigns[0];
    const brands = [...new Set(m.campaigns.map(x => x.brand))];
    return `
    <article class="card">
      <a class="card-img" href="#/model/${slug(m.name)}">${visual(c, m.name).replace(/ data-c="[^"]*" data-i="[^"]*"/, '')}</a>
      <div class="card-meta"><span>${plural(m.campaigns.length, 'campaign')}</span><span>${range(m.first, m.last)}</span></div>
      <h3>${modelLink(m.name)}</h3>
      <p>${brands.map(brandLink).join(' · ')}</p>
    </article>`;
  }

  function directory(items, href) {
    const sorted = [...items].sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
    const letters = groupBy(sorted, x => { const ch = norm(x.name)[0] || '#'; return /[a-z]/.test(ch) ? ch.toUpperCase() : '#'; });
    return `<div class="directory">${[...letters].map(([L, xs]) => `
      <div class="letter">${L}</div>
      ${xs.map(x => `<a href="${href(x)}"><span>${esc(x.name)}</span><small>${plural(x.campaigns.length, 'campaign')} · ${range(x.first, x.last)}</small></a>`).join('')}`).join('')}
    </div>`;
  }

  // ---------- views ----------
  function viewHome() {
    const { campaigns, brands, models } = db;
    const latestYear = campaigns[0]?.year;
    const latest = campaigns.filter(c => c.year === latestYear);
    const hero = latest.find(c => c.featured && c.images.length) || latest.find(c => c.images.length) || campaigns.find(c => c.images.length);
    const years = [...groupBy(campaigns, c => c.year)];
    const allYears = campaigns.map(c => c.year);
    const topBrands = [...brands.values()].sort((a, b) => b.campaigns.length - a.campaigns.length || a.name.localeCompare(b.name)).slice(0, 14);

    return `
      <section class="intro">
        <div>
          <div class="eyebrow">An archive of fashion campaign faces</div>
          <h1>Who wore it<br><em>for the brand?</em></h1>
        </div>
        <div>
          <p class="lede">Search any clothing brand and see every model and campaign face it has used, year by year and season by season. Spotted a familiar face in a shop window? Look it up here.</p>
          <div class="stats">
            <div><b>${brands.size}</b><span>Brands</span></div>
            <div><b>${models.size}</b><span>Faces</span></div>
            <div><b>${campaigns.length}</b><span>Campaigns</span></div>
            <div><b>${range(Math.min(...allYears), Math.max(...allYears))}</b><span>Years</span></div>
          </div>
        </div>
      </section>
      ${hero ? `
      <section class="hero">
        <div class="hero-image">${visual(hero)}</div>
        <div class="hero-copy">
          <span class="eyebrow">In focus · ${esc(hero.brand)} · ${esc(label(hero))}</span>
          <h2>${hero.talent.map(modelLink).join('<br>')}</h2>
          ${credits(hero)}
          <p><a class="line-link" href="#/brand/${slug(hero.brand)}">Every ${esc(hero.brand)} campaign ↗</a></p>
        </div>
      </section>` : ''}

      <div class="section-top">
        <div><span class="eyebrow">Browse a brand</span><h2>Brands in the archive</h2></div>
        <a class="line-link" href="#/brands">All ${brands.size} brands ↗</a>
      </div>
      <div class="chips">${topBrands.map(b => `<a class="chip" href="#/brand/${slug(b.name)}">${esc(b.name)}<small>${b.campaigns.length}</small></a>`).join('')}</div>

      <div class="section-top">
        <div><span class="eyebrow">The latest season</span><h2>${latestYear} campaigns</h2></div>
        <a class="line-link" href="#/year/${latestYear}">See all of ${latestYear} ↗</a>
      </div>
      <div class="grid">${latest.slice(0, 9).map(card).join('')}</div>

      <div class="section-top">
        <div><span class="eyebrow">Go back in time</span><h2>Browse by year</h2></div>
      </div>
      <div class="chips">${years.map(([y, cs]) => `<a class="chip" href="#/year/${y}">${y}<small>${cs.length}</small></a>`).join('')}</div>`;
  }

  function viewBrand(s) {
    const b = db.brands.get(s);
    if (!b) return notFound('brand');
    const faces = new Set(b.campaigns.flatMap(c => c.talent));
    const years = [...new Set(b.campaigns.map(c => c.year))];
    return `
      <section class="page-head">
        <div class="eyebrow">Brand${b.country ? ' · ' + esc(b.country) : ''}</div>
        <h1>${esc(b.name)}</h1>
        <p class="lede">${plural(b.campaigns.length, 'campaign')} · ${plural(faces.size, 'face')} · ${range(b.first, b.last)}</p>
      </section>
      ${years.length > 1 ? `<div class="chips">${years.map(y => `<a class="chip" href="#y${y}" data-jump="y${y}">${y}</a>`).join('')}</div>` : ''}
      ${timeline(b.campaigns)}`;
  }

  function viewModel(s) {
    const m = db.models.get(s);
    if (!m) return notFound('model');
    const brands = groupBy(m.campaigns, c => c.brand);
    const photos = m.campaigns.reduce((n, c) => n + photosOf(c, m.name).length, 0);
    return `
      <section class="page-head">
        <div class="eyebrow">Model / campaign face</div>
        <h1>${esc(m.name)}</h1>
        <p class="lede">${plural(m.campaigns.length, 'campaign')} for ${plural(brands.size, 'brand')} · ${range(m.first, m.last)}${photos ? ` · ${plural(photos, 'photo')}` : ''}</p>
      </section>
      <div class="chips"><span class="chips-label">Advertised for</span>${[...brands].map(([b, cs]) =>
        `<a class="chip" href="#/brand/${slug(b)}">${esc(b)}<small>${cs.map(label).join(', ')}</small></a>`).join('')}</div>
      ${timeline(m.campaigns, m.name)}`;
  }

  function viewYear(y) {
    const cs = db.campaigns.filter(c => c.year === Number(y));
    const years = [...new Set(db.campaigns.map(c => c.year))];
    const seasons = groupBy(cs, c => c.season || 'Full year');
    return `
      <section class="page-head">
        <div class="eyebrow">Year</div>
        <h1>${esc(y)}</h1>
        <p class="lede">${plural(cs.length, 'campaign')} in the archive.</p>
      </section>
      <div class="chips">${years.map(v => `<a class="chip${v === Number(y) ? ' active' : ''}" href="#/year/${v}">${v}</a>`).join('')}</div>
      ${cs.length ? [...seasons].map(([s, list]) => `
        <div class="section-top"><h2>${esc(s)} ${esc(y)}</h2></div>
        <div class="grid">${list.map(card).join('')}</div>`).join('') : '<p class="empty">Nothing recorded for this year yet.</p>'}`;
  }

  function viewSearch(q) {
    const n = norm(q);
    if (!n) return viewHome();
    const terms = n.split(' ');
    const hit = s => { const h = norm(s); return terms.every(t => h.includes(t)); };
    const brands = [...db.brands.values()].filter(b => hit([b.name, ...(b.aliases || [])].join(' ')));
    const models = [...db.models.values()].filter(m => hit(m.name));
    const campaigns = db.campaigns.filter(c => terms.every(t => c.haystack.includes(t)));
    const total = brands.length + models.length + campaigns.length;
    return `
      <section class="page-head">
        <div class="eyebrow">Search</div>
        <h1>“${esc(q)}”</h1>
        <p class="lede">${total ? `${plural(brands.length, 'brand')} · ${plural(models.length, 'face')} · ${plural(campaigns.length, 'campaign')}` : 'No matches yet. The archive is growing, so try another spelling or check back later.'}</p>
      </section>
      ${brands.length ? `<div class="results-group"><h2>Brands</h2><div class="directory">${brands.map(b => `<a href="#/brand/${slug(b.name)}"><span>${esc(b.name)}</span><small>${plural(b.campaigns.length, 'campaign')} · ${range(b.first, b.last)}</small></a>`).join('')}</div></div>` : ''}
      ${models.length ? `<div class="results-group"><h2>Faces</h2><div class="grid">${models.map(modelCard).join('')}</div></div>` : ''}
      ${campaigns.length ? `<div class="results-group"><h2>Campaigns</h2><div class="grid">${campaigns.map(card).join('')}</div></div>` : ''}`;
  }

  const viewBrands = () => `
    <section class="page-head"><div class="eyebrow">Directory</div><h1>Brands</h1>
      <p class="lede">${plural(db.brands.size, 'brand')}. Pick one to see every campaign face by year and season.</p></section>
    ${directory(db.brands.values(), b => `#/brand/${slug(b.name)}`)}`;

  const viewModels = () => `
    <section class="page-head"><div class="eyebrow">Directory</div><h1>Models &amp; faces</h1>
      <p class="lede">${plural(db.models.size, 'face')}: models, actresses and musicians who fronted a brand campaign.</p></section>
    ${directory(db.models.values(), m => `#/model/${slug(m.name)}`)}`;

  function viewYears() {
    const years = [...groupBy(db.campaigns, c => c.year)];
    return `
      <section class="page-head"><div class="eyebrow">Directory</div><h1>Years</h1></section>
      <div class="directory">${years.map(([y, cs]) => `<a href="#/year/${y}"><span>${y}</span><small>${plural(cs.length, 'campaign')}</small></a>`).join('')}</div>`;
  }

  const viewAbout = () => `
    <section class="page-head"><div class="eyebrow">About</div><h1>About the archive</h1></section>
    <div class="prose">
      <p>The Campaign Edit records which women have fronted the advertising campaigns of the world's clothing brands, and when. Search a brand to see all its faces by year and season, or search a model to see every brand she has worked for.</p>
      <p>Every entry links to the published coverage it is based on. Where a source gives only a year and no season, the entry is marked “Full year”. The archive is a work in progress, not a complete record. If you know of a campaign that is missing, it can be added.</p>
      <p>Brand names and campaign photographs belong to their respective owners. Images appear only where they come with credited press coverage; other entries show a plain title card.</p>
      <h2>Adding a campaign</h2>
      <p>All data lives in <code>data/campaigns.json</code>. Add one object per campaign:</p>
      <pre>{
  "brand": "bebe", "year": 2017, "season": "Spring",
  "talent": ["Hailey Clauson"],
  "photographer": "optional",
  "title": "optional campaign name",
  "note": "optional one-line note",
  "image": "optional, e.g. assets/bebe-ss17.jpg",
  "featured": "optional, true = show in the home page spotlight",
  "sources": [{ "name": "Publication", "url": "https://…" }]
}</pre>
      <p>Seasons in use: ${Object.keys(SEASON_ORDER).map(esc).join(', ')}.</p>
    </div>`;

  function notFound(what) {
    return `<section class="page-head"><h1>Not found</h1><p class="lede">That ${what} isn't in the archive yet. <a href="#/">Back to the start</a>.</p></section>`;
  }

  // ---------- lightbox ----------
  const box = document.getElementById('lightbox');
  let boxSet = [], boxAt = 0;

  // The set a photo opens into: the photos of that campaign shown in the same gallery (or the whole campaign).
  function openPhoto(img) {
    const c = db.campaigns.find(x => x.id === Number(img.dataset.c));
    const gal = img.closest('.gallery');
    const person = gal && decodeURIComponent((location.hash.match(/^#\/model\/(.+)$/) || [])[1] || '');
    const m = person && db.models.get(person);
    const set = m ? photosOf(c, m.name) : [];
    boxSet = (set.length ? set : c.images).map(i => ({ c, img: i }));
    boxAt = Math.max(0, boxSet.findIndex(x => x.img === c.images[Number(img.dataset.i)]));
    showPhoto();
    if (!box.open) box.showModal();
  }
  function showPhoto() {
    const { c, img } = boxSet[boxAt];
    const who = img.talent.length ? img.talent : c.talent;
    box.querySelector('.lb-img').innerHTML = `<img src="${esc(img.src)}" alt="${esc(altText(c, img))}">`;
    box.querySelector('.lb-caption').innerHTML = `
      <div class="eyebrow">${brandLink(c.brand)} · ${esc(label(c))}</div>
      <h3>${list(who)}</h3>
      ${c.photographer ? `<p>Photography: ${esc(c.photographer)}</p>` : ''}
      ${sources(c)}
      ${boxSet.length > 1 ? `<p class="lb-count">${boxAt + 1} / ${boxSet.length}</p>` : ''}`;
    box.querySelectorAll('.lb-nav').forEach(b => { b.hidden = boxSet.length < 2; });
  }
  const step = d => { boxAt = (boxAt + d + boxSet.length) % boxSet.length; showPhoto(); };
  box.querySelector('.lb-prev').addEventListener('click', () => step(-1));
  box.querySelector('.lb-next').addEventListener('click', () => step(1));
  box.querySelector('.lb-close').addEventListener('click', () => box.close());
  box.addEventListener('click', e => { if (e.target === box || e.target.closest('a')) box.close(); });
  box.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  let touchX = null;
  box.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', e => {
    if (touchX === null || boxSet.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  });

  // ---------- router ----------
  function route() {
    if (!db) return;
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const [page, arg = ''] = parts;
    const views = {
      '': viewHome, brand: () => viewBrand(arg), model: () => viewModel(arg), year: () => viewYear(arg),
      search: () => viewSearch(arg), brands: viewBrands, models: viewModels, years: viewYears, about: viewAbout
    };
    app.innerHTML = (views[page] || (() => notFound('page')))();
    if (page !== 'search' && document.activeElement !== searchInput) searchInput.value = '';
    if (page === 'search' && searchInput.value !== arg) searchInput.value = arg;
    document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/' + page));
    const titles = { brand: db.brands.get(arg)?.name, model: db.models.get(arg)?.name, year: arg, search: arg && `“${arg}”`, brands: 'Brands', models: 'Models', years: 'Years', about: 'About' };
    document.title = (titles[page] ? titles[page] + ' — ' : '') + 'The Campaign Edit';
  }

  window.addEventListener('hashchange', () => { route(); if (!location.hash.startsWith('#/search')) window.scrollTo(0, 0); });

  // In-page year jumps on brand pages (plain #y2017 anchors would be treated as routes).
  app.addEventListener('click', e => {
    const shot = e.target.closest('.shot, .hero-image, .entry-thumb');
    const img = shot && shot.querySelector('img[data-c]');
    if (img) { e.preventDefault(); openPhoto(img); return; }
    const a = e.target.closest('[data-jump]');
    if (a) { e.preventDefault(); document.getElementById(a.dataset.jump)?.scrollIntoView({ behavior: 'smooth' }); }
  });

  // Live search: the first keystroke adds a history entry, later ones replace it.
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    const target = q ? '#/search/' + encodeURIComponent(q) : '#/';
    if (location.hash.startsWith('#/search')) { history.replaceState(null, '', target); route(); }
    else if (q) location.hash = target;
  });
  document.getElementById('searchForm').addEventListener('submit', e => { e.preventDefault(); searchInput.blur(); });

  fetch('data/campaigns.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(raw => {
      db = buildIndex(raw);
      document.getElementById('updated').textContent = 'Last updated ' + new Date(raw.updated + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      route();
    })
    .catch(() => { app.innerHTML = '<p class="empty">The archive could not be loaded. Please refresh the page.</p>'; });
})();
