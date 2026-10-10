// Cloudflare Worker for The Car Archive.
// Static pages and assets are served from public/ by the assets binding; this script runs first only for /api/* and
// /admin (see wrangler.jsonc). Visitor interactions live in D1 (binding DB, car_* tables from migrations/0002) and never touch the archive data.
//
// Secrets (wrangler secret put):  ADMIN_TOKEN  (admin API; admin is disabled while unset)
//                                 HASH_SALT    (keys the daily network hashes; the public API is off while unset)
// Optional:                       TURNSTILE_SECRET (verify a Turnstile token on suggestions when set)
import { ADMIN_HTML } from './admin.js';

const LIMITS = {
  saveHour: 120,           // garage changes per network per hour
  saveNetworkVisitors: 20, // browsers per network per day whose saves are counted publicly (offices, mobile carriers share addresses)
  subHour: 5,              // suggestions per network per hour
  subDay: 20,              // suggestions per network per day
  minFillMs: 3000          // a form sent faster than this is treated as automated
};
const DAY = 86400000;
const TYPES = ['car', 'source', 'correction'];

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }
});
const err = (status, error) => json({ error }, status);

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
/** A per-day hash of the client network: no address is stored, and codes cannot be linked across days. */
async function networkCode(request, env, now) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  return (await sha256(`${env.HASH_SALT}|${today(now)}|${ip}`)).slice(0, 32);
}

/** Fixed-window counter. Returns true while under the limit. */
async function allow(db, key, bucket, limit, now) {
  const row = await db.prepare(
    `INSERT INTO car_rate_limits (key, bucket, count, day) VALUES (?1, ?2, 1, ?3)
     ON CONFLICT (key, bucket) DO UPDATE SET count = count + 1 RETURNING count`).bind(key, bucket, today(now)).first();
  return row.count <= limit;
}
/** Remove rate-limit and network rows older than two days (opportunistic, after the response). */
const purge = (db, now) => db.batch([
  db.prepare('DELETE FROM car_rate_limits WHERE day < ?1').bind(today(now - 2 * DAY)),
  db.prepare('DELETE FROM car_garage_networks WHERE day < ?1').bind(today(now - 2 * DAY))
]);

/** Same-origin check for state-changing requests (browsers send Origin on POST). */
function sameOrigin(request) {
  const o = request.headers.get('origin');
  if (!o) return request.headers.get('sec-fetch-site') !== 'cross-site';
  return o === new URL(request.url).origin;
}

// ---- the items that can be saved, read once per isolate from the published search index
let itemIndex = null;
async function items(env, request) {
  if (itemIndex) return itemIndex;
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/data/search-index.json', request.url)));
    const j = await r.json();
    itemIndex = new Map([...j.families.map(f => [`family:${f.id}`, f.n]), ...j.gens.map(g => [`generation:${g.id}`, g.n])]);
  } catch { itemIndex = new Map(); }
  return itemIndex;
}
const ITEM = /^(family|generation):[a-z0-9-]{1,100}$/;

// ---------- Dream garage counts ----------

async function postSave(request, env, ctx, now) {
  if (!sameOrigin(request)) return err(403, 'cross-site request refused');
  let b;
  try { b = await request.json(); } catch { return err(400, 'invalid JSON'); }
  const visitor = String(b.visitor || ''), item = String(b.item || ''), on = b.on === true;
  if (!/^[A-Za-z0-9-]{8,80}$/.test(visitor)) return err(400, 'invalid visitor id');
  if (!ITEM.test(item)) return err(400, 'invalid item');
  if (!(await items(env, request)).has(item)) return err(404, 'unknown item');
  const db = env.DB;
  const net = await networkCode(request, env, now);
  if (!(await allow(db, `save:${net}`, String(Math.floor(now / 3600000)), LIMITS.saveHour, now))) return err(429, 'too many changes, try again later');
  const vh = await sha256(`visitor|${visitor}`);
  if (on) {
    // count publicly only the first few browsers per network per day; others keep their save but uncounted
    await db.prepare('INSERT OR IGNORE INTO car_garage_networks (ip_day, visitor_hash, day) VALUES (?1, ?2, ?3)').bind(net, vh, today(now)).run();
    const seen = await db.prepare('SELECT COUNT(*) AS n FROM car_garage_networks WHERE ip_day = ?1').bind(net).first();
    const counted = seen.n <= LIMITS.saveNetworkVisitors ? 1 : 0;
    await db.prepare('INSERT INTO car_garage (visitor_hash, item, created_at, counted) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (visitor_hash, item) DO NOTHING')
      .bind(vh, item, now, counted).run();
  } else {
    await db.prepare('DELETE FROM car_garage WHERE visitor_hash = ?1 AND item = ?2').bind(vh, item).run();
  }
  if (Math.random() < 0.02) ctx.waitUntil(purge(db, now));
  const c = await db.prepare('SELECT COUNT(*) AS n FROM car_garage WHERE item = ?1 AND counted = 1').bind(item).first();
  return json({ ok: true, item, on, count: c.n });
}

async function getCount(url, env) {
  const item = url.searchParams.get('item') || '';
  if (!ITEM.test(item)) return err(400, 'invalid item');
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM car_garage WHERE item = ?1 AND counted = 1').bind(item).first();
  return json({ item, count: c.n }, 200, { 'cache-control': 'public, max-age=60' });
}

/** Popular in dream garages. all = saves currently held; 30d = saved in the last 30 days and still held. Minimum 3. */
async function getTop(url, env, request, now) {
  const w = url.searchParams.get('window') === 'all' ? 'all' : '30d';
  const since = w === 'all' ? 0 : now - 30 * DAY;
  const { results } = await env.DB.prepare(
    `SELECT item, COUNT(*) AS count FROM car_garage WHERE counted = 1 AND created_at >= ?1
     GROUP BY item HAVING COUNT(*) >= 3 ORDER BY count DESC, item ASC LIMIT 50`).bind(since).all();
  const names = await items(env, request);
  return json({ window: w, minimum: 3, items: results.filter(r => names.has(r.item)).map(r => ({ item: r.item, name: names.get(r.item), count: r.count })) },
    200, { 'cache-control': 'public, max-age=60' });
}

// ---------- suggestions ----------

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
function publicUrl(s) {
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password) return null;
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/.test(u.hostname)) return null;
  return u.toString();
}
/** Validates a suggestion. Returns {ok, value} or {ok:false, error}. Links are checked for form only, never fetched. */
export function validateSubmission(b, now = Date.now()) {
  const v = {
    type: TYPES.includes(b.type) ? b.type : '',
    make: clean(b.make, 60), model: clean(b.model, 80), generation: clean(b.generation, 80), market: clean(b.market, 60),
    year: clean(b.year, 4), year_kind: ['model', 'calendar'].includes(b.yearKind) ? b.yearKind : null,
    source_url: clean(b.sourceUrl, 500), photo_url: clean(b.photoUrl, 500),
    note: clean(b.note, 2000), target: clean(b.target, 140), page: clean(b.page, 200)
  };
  if (!v.type) return { ok: false, error: 'Please choose what you are sending.' };
  if (v.make.length < 2) return { ok: false, error: 'Please give the manufacturer.' };
  if (v.model.length < 1) return { ok: false, error: 'Please give the model.' };
  if (v.year && !/^(19|20)\d\d$/.test(v.year)) return { ok: false, error: 'The year should look like 2016.' };
  const y = v.year ? Number(v.year) : null;
  if (y && y > new Date(now).getUTCFullYear() + 2) return { ok: false, error: 'That year is too far in the future.' };
  if (v.source_url) { v.source_url = publicUrl(v.source_url); if (!v.source_url) return { ok: false, error: 'Please give the source as a public web link starting with https://' }; }
  else if (v.type === 'correction') return { ok: false, error: 'Please give a source link.' };
  if (v.photo_url) { v.photo_url = publicUrl(v.photo_url); if (!v.photo_url) return { ok: false, error: 'Please give the photo page as a public web link.' }; }
  if (v.type === 'source' && !v.source_url && !v.photo_url) return { ok: false, error: 'Please give a source or photo link.' };
  if (v.note.length < 10) return { ok: false, error: 'Please explain briefly what should change (at least 10 characters).' };
  if ((v.note.match(/https?:\/\//g) || []).length > 2) return { ok: false, error: 'Please put links in the link fields and keep the explanation short.' };
  if (v.target && !/^[a-z0-9-]{1,100}(#[a-z0-9-]{1,30})?$/.test(v.target)) v.target = '';
  if (v.page && !v.page.startsWith('/')) v.page = '';
  return { ok: true, value: { ...v, year: y, generation: v.generation || null, market: v.market || null, source_url: v.source_url || null, photo_url: v.photo_url || null, target: v.target || null, page: v.page || null } };
}

async function turnstileOk(env, token, request) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: request.headers.get('cf-connecting-ip') || '' })
  });
  return (await r.json()).success === true;
}

async function postSubmission(request, env, ctx, now) {
  if (!sameOrigin(request)) return err(403, 'cross-site request refused');
  const isJson = (request.headers.get('content-type') || '').includes('application/json');
  let b;
  try { b = isJson ? await request.json() : Object.fromEntries(await request.formData()); } catch { return err(400, 'invalid request'); }
  const done = () => isJson ? json({ ok: true }) : Response.redirect(new URL('/suggest/?sent=1', request.url).toString(), 303);
  // honeypot and fill-time trap: answer as if accepted, store nothing
  if (b.website || (b.ts && now - Number(b.ts) < LIMITS.minFillMs)) return done();
  const v = validateSubmission(b, now);
  if (!v.ok) return isJson ? err(400, v.error) : new Response(v.error, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (!(await turnstileOk(env, b['cf-turnstile-response'], request))) return err(400, 'Please complete the check.');
  const net = await networkCode(request, env, now);
  const hourOk = await allow(env.DB, `sub:${net}`, String(Math.floor(now / 3600000)), LIMITS.subHour, now);
  const dayOk = await allow(env.DB, `subday:${net}`, today(now), LIMITS.subDay, now);
  if (!hourOk || !dayOk) return err(429, 'Too many suggestions from your network. Please try again later.');
  const s = v.value;
  await env.DB.prepare(`INSERT INTO car_submissions (created_at, type, make, model, generation, market, year, year_kind, source_url, photo_url, note, target, page, ip_day)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`)
    .bind(now, s.type, s.make, s.model, s.generation, s.market, s.year, s.year_kind, s.source_url, s.photo_url, s.note, s.target, s.page, net).run();
  if (Math.random() < 0.05) ctx.waitUntil(purge(env.DB, now));
  return done();
}

// ---------- admin ----------

function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
function authorised(request, env) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) return false;
  const h = request.headers.get('authorization') || '';
  return h.startsWith('Bearer ') && timingSafeEqual(h.slice(7), env.ADMIN_TOKEN);
}

/**
 * The overlay entry proposed for a submission; the reviewer completes it before approving (see data/SCHEMA.md,
 * Overlay). A suggestion that needs research (a missing car, a photo) can be approved without an entry: it is then
 * kept as an accepted lead and nothing is exported.
 */
export function draftOverlay(s) {
  const host = (() => { try { return new URL(s.source_url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const source = s.source_url ? { url: s.source_url, title: 'TODO: title of the page', publisher: host, type: 'secondary', accessed: new Date(s.created_at).toISOString().slice(0, 10) } : undefined;
  if (s.type === 'correction' && s.target) {
    return { op: 'set', target: s.target, field: 'TODO: field to change, e.g. length or dates.productionStart', value: { value: 'TODO: corrected value', src: '$source', quote: 'TODO: exact sentence from the source' }, source, reason: s.note, submission: s.id };
  }
  return null;
}
const LISTS = ['bodyStyles', 'dimensions', 'cargo', 'powertrains', 'changes', 'revisions', 'assembly', 'codes', 'names', 'drivetrains', 'notes'];
const TARGET = /^[a-z0-9-]{1,100}(#[a-z0-9-]{1,30})?$/;
/** Shape check of an overlay entry. The build re-checks targets against the data and fails on unknown ones. */
export function validOverlayEntry(e) {
  if (e == null) return null; // approved as a lead, nothing to export
  if (typeof e !== 'object') return 'the entry must be a JSON object or null';
  if (JSON.stringify(e).includes('TODO:')) return 'replace every TODO placeholder';
  if (!TARGET.test(e.target || '')) return 'target must be a family or generation id, optionally #item';
  if (e.source && !/^https?:\/\//.test(e.source.url || '')) return 'source needs an http(s) url';
  if (e.op === 'set') return typeof e.field === 'string' && /^[a-zA-Z.]{1,60}$/.test(e.field) && 'value' in e ? null : 'a set needs a field and a value';
  if (e.op === 'add') return LISTS.includes(e.list) && e.item && typeof e.item === 'object' ? null : `an add needs list (one of ${LISTS.join(', ')}) and item`;
  if (e.op === 'remove') return e.target.includes('#') ? null : 'a removal targets an item: <generation id>#<item id>';
  return 'op must be set, add or remove';
}

async function admin(request, env, url, now) {
  if (!env.ADMIN_TOKEN) return err(503, 'admin is not configured');
  if (!authorised(request, env)) return err(401, 'unauthorised');
  const db = env.DB;
  const p = url.pathname;
  if (p === '/api/admin/submissions' && request.method === 'GET') {
    const st = url.searchParams.get('status') || 'pending';
    const q = st === 'all' ? db.prepare('SELECT * FROM car_submissions ORDER BY created_at DESC LIMIT 200')
      : db.prepare('SELECT * FROM car_submissions WHERE status = ?1 ORDER BY created_at ASC LIMIT 200').bind(st);
    const { results } = await q.all();
    return json({ submissions: results.map(s => ({ ...s, ip_day: undefined, draft: s.overlay ? JSON.parse(s.overlay) : draftOverlay(s) })) });
  }
  const m = p.match(/^\/api\/admin\/submissions\/(\d+)\/review$/);
  if (m && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch { return err(400, 'invalid JSON'); }
    const id = Number(m[1]);
    const s = await db.prepare('SELECT * FROM car_submissions WHERE id = ?1').bind(id).first();
    if (!s) return err(404, 'no such submission');
    if (b.action === 'reject') {
      await db.prepare("UPDATE car_submissions SET status = 'rejected', reviewed_at = ?2, review_note = ?3, overlay = NULL WHERE id = ?1").bind(id, now, clean(b.note, 500)).run();
      return json({ ok: true, status: 'rejected' });
    }
    if (b.action === 'approve') {
      const entry = b.overlay === undefined ? draftOverlay(s) : b.overlay;
      const problem = validOverlayEntry(entry);
      if (problem) return err(400, `overlay entry: ${problem}`);
      if (entry) entry.submission = id;
      await db.prepare("UPDATE car_submissions SET status = 'approved', reviewed_at = ?2, review_note = ?3, overlay = ?4 WHERE id = ?1")
        .bind(id, now, clean(b.note, 500), entry ? JSON.stringify(entry) : null).run();
      return json({ ok: true, status: 'approved', overlay: entry });
    }
    return err(400, 'action must be approve or reject');
  }
  if (p === '/api/admin/export' && request.method === 'GET') {
    const { results } = await db.prepare("SELECT id, overlay FROM car_submissions WHERE status = 'approved' AND overlay IS NOT NULL AND exported_at IS NULL ORDER BY reviewed_at").all();
    return json({ entries: results.map(r => JSON.parse(r.overlay)), submissions: results.map(r => r.id) });
  }
  if (p === '/api/admin/export/mark' && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch { return err(400, 'invalid JSON'); }
    const ids = (b.submissions || []).map(Number).filter(Number.isInteger);
    for (const id of ids) await db.prepare("UPDATE car_submissions SET exported_at = ?2 WHERE id = ?1 AND status = 'approved'").bind(id, now).run();
    return json({ ok: true, marked: ids.length });
  }
  return err(404, 'not found');
}

// ---------- entry ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const now = Date.now();
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      return new Response(ADMIN_HTML, { headers: {
        'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
        'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' } });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) return err(503, 'interaction service unavailable');
      // Without the salt, network hashes would be keyed by a value anyone can read here: store nothing until it is set.
      if (!env.HASH_SALT && !url.pathname.startsWith('/api/admin/')) return err(503, 'interaction service is not configured');
      try {
        if (url.pathname === '/api/health') return json({ ok: true });
        if (url.pathname === '/api/garage' && request.method === 'POST') return await postSave(request, env, ctx, now);
        if (url.pathname === '/api/garage/count' && request.method === 'GET') return await getCount(url, env);
        if (url.pathname === '/api/garage/top' && request.method === 'GET') return await getTop(url, env, request, now);
        if (url.pathname === '/api/submissions' && request.method === 'POST') return await postSubmission(request, env, ctx, now);
        if (url.pathname.startsWith('/api/admin/')) return await admin(request, env, url, now);
        return err(404, 'not found');
      } catch (e) {
        console.error(e);
        return err(503, 'interaction service unavailable');
      }
    }
    return env.ASSETS.fetch(request);
  }
};
