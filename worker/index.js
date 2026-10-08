// Cloudflare Worker for brandsmodels.com.
// Static pages and assets are served from public/ by the assets binding; this script runs first only for /api/* and
// /admin (see wrangler.jsonc). Visitor interactions live in D1 (binding DB) and never touch the archive data.
//
// Secrets (wrangler secret put):  ADMIN_TOKEN  (admin API; admin is disabled while unset)
//                                 HASH_SALT    (keys the daily network hashes; required in production)
// Optional:                       TURNSTILE_SECRET (verify a Turnstile token on suggestions when set)
import { ADMIN_HTML } from './admin.js';

const KINDS = ['campaign', 'runway', 'cover', 'ambassador'];
const SEASONS = ['', 'Spring/Summer', 'Fall/Winter', 'Resort', 'Pre-Fall', 'Holiday'];
const LIMITS = {
  favHour: 120,          // favourite changes per network per hour
  favNetworkVisitors: 20, // browsers per network per day whose favourites are counted publicly (shared networks: offices, mobile carriers)
  subHour: 5,            // suggestions per network per hour
  subDay: 20,            // suggestions per network per day
  minFillMs: 3000        // a form sent faster than this is treated as automated
};
const DAY = 86400000;

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }
});
const err = (status, error) => json({ error }, status);

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
/** A per-day hash of the client network: no IP is stored, and codes cannot be linked across days. */
async function networkCode(request, env, now) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  return (await sha256(`${env.HASH_SALT || 'dev-only-salt'}|${today(now)}|${ip}`)).slice(0, 32);
}

/** Fixed-window counter. Returns true while under the limit. */
async function allow(db, key, bucket, limit, now) {
  const row = await db.prepare(
    `INSERT INTO rate_limits (key, bucket, count, day) VALUES (?1, ?2, 1, ?3)
     ON CONFLICT (key, bucket) DO UPDATE SET count = count + 1 RETURNING count`).bind(key, bucket, today(now)).first();
  return row.count <= limit;
}
/** Remove rate-limit and network rows older than two days (opportunistic, after the response). */
const purge = (db, now) => db.batch([
  db.prepare('DELETE FROM rate_limits WHERE day < ?1').bind(today(now - 2 * DAY)),
  db.prepare('DELETE FROM fav_networks WHERE day < ?1').bind(today(now - 2 * DAY))
]);

/** Same-origin check for state-changing requests (browsers send Origin on POST). */
function sameOrigin(request) {
  const o = request.headers.get('origin');
  if (!o) return request.headers.get('sec-fetch-site') !== 'cross-site';
  return o === new URL(request.url).origin;
}

// ---- model names, read once per isolate from the published search index
let modelIndex = null;
async function models(env, request) {
  if (modelIndex) return modelIndex;
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/data/search-index.json', request.url)));
    const j = await r.json();
    modelIndex = new Map(j.models.map(m => [m[1], m[0]]));
  } catch { modelIndex = new Map(); }
  return modelIndex;
}

// ---------- favourites ----------

async function postFavourite(request, env, ctx, now) {
  if (!sameOrigin(request)) return err(403, 'cross-site request refused');
  let b;
  try { b = await request.json(); } catch { return err(400, 'invalid JSON'); }
  const visitor = String(b.visitor || ''), model = String(b.model || ''), on = b.on === true;
  if (!/^[A-Za-z0-9-]{8,80}$/.test(visitor)) return err(400, 'invalid visitor id');
  if (!/^[a-z0-9-]{1,100}$/.test(model)) return err(400, 'invalid model');
  if (!(await models(env, request)).has(model)) return err(404, 'unknown model');
  const db = env.DB;
  const net = await networkCode(request, env, now);
  if (!(await allow(db, `fav:${net}`, String(Math.floor(now / 3600000)), LIMITS.favHour, now))) return err(429, 'too many changes, try again later');
  const vh = await sha256(`visitor|${visitor}`);
  if (on) {
    // count publicly only the first few browsers per network per day; others keep their favourite but uncounted
    await db.prepare('INSERT OR IGNORE INTO fav_networks (ip_day, visitor_hash, day) VALUES (?1, ?2, ?3)').bind(net, vh, today(now)).run();
    const seen = await db.prepare('SELECT COUNT(*) AS n FROM fav_networks WHERE ip_day = ?1').bind(net).first();
    const counted = seen.n <= LIMITS.favNetworkVisitors ? 1 : 0;
    await db.prepare('INSERT INTO favourites (visitor_hash, model, created_at, counted) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (visitor_hash, model) DO NOTHING')
      .bind(vh, model, now, counted).run();
  } else {
    await db.prepare('DELETE FROM favourites WHERE visitor_hash = ?1 AND model = ?2').bind(vh, model).run();
  }
  if (Math.random() < 0.02) ctx.waitUntil(purge(db, now));
  const c = await db.prepare('SELECT COUNT(*) AS n FROM favourites WHERE model = ?1 AND counted = 1').bind(model).first();
  return json({ ok: true, model, on, count: c.n });
}

async function getCount(url, env) {
  const model = url.searchParams.get('model') || '';
  if (!/^[a-z0-9-]{1,100}$/.test(model)) return err(400, 'invalid model');
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM favourites WHERE model = ?1 AND counted = 1').bind(model).first();
  return json({ model, count: c.n }, 200, { 'cache-control': 'public, max-age=60' });
}

/** Fan favourites. all = favourites currently held; 30d = added in the last 30 days and still held. Minimum 3. */
async function getTop(url, env, request, now) {
  const w = url.searchParams.get('window') === 'all' ? 'all' : '30d';
  const since = w === 'all' ? 0 : now - 30 * DAY;
  const { results } = await env.DB.prepare(
    `SELECT model, COUNT(*) AS count FROM favourites WHERE counted = 1 AND created_at >= ?1
     GROUP BY model HAVING COUNT(*) >= 3 ORDER BY count DESC, model ASC LIMIT 50`).bind(since).all();
  const names = await models(env, request);
  return json({ window: w, minimum: 3, models: results.map(r => ({ model: r.model, name: names.get(r.model) || r.model, count: r.count })) },
    200, { 'cache-control': 'public, max-age=60' });
}

// ---------- suggestions ----------

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
/** Validates a suggestion. Returns {ok, value} or {ok:false, error}. The URL is checked for form only, never fetched. */
export function validateSubmission(b, now = Date.now()) {
  const v = {
    type: b.type === 'correction' ? 'correction' : 'missing',
    model: clean(b.model, 120), brand: clean(b.brand, 120), kind: clean(b.kind, 20),
    year: clean(b.year, 4), season: clean(b.season, 20), source_url: clean(b.source, 500),
    note: clean(b.note, 1000), record_id: clean(b.record, 20), page: clean(b.page, 200)
  };
  if (v.model.length < 2) return { ok: false, error: 'Please give the model’s name.' };
  if (v.brand.length < 2) return { ok: false, error: 'Please give the brand or magazine.' };
  if (!KINDS.includes(v.kind)) return { ok: false, error: 'Please choose the type of appearance.' };
  if (v.year && !/^(19|20)\d\d$/.test(v.year)) return { ok: false, error: 'The year should look like 2016.' };
  const y = v.year ? Number(v.year) : null;
  if (y && y > new Date(now).getUTCFullYear() + 1) return { ok: false, error: 'That year is in the future.' };
  if (!SEASONS.includes(v.season)) return { ok: false, error: 'Unknown season.' };
  let u;
  try { u = new URL(v.source_url); } catch { return { ok: false, error: 'Please give a source link starting with https://' }; }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password) return { ok: false, error: 'Please give a public web link as the source.' };
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname)) return { ok: false, error: 'Please give a public web link as the source.' };
  if (v.note.length < 10) return { ok: false, error: 'Please explain briefly what is missing or wrong (at least 10 characters).' };
  if (v.record_id && !/^r[a-z2-7]{9}$|^u[a-z0-9]{6,16}$/.test(v.record_id)) v.record_id = '';
  if (v.page && !v.page.startsWith('/')) v.page = '';
  const links = (v.note.match(/https?:\/\//g) || []).length;
  if (links > 2) return { ok: false, error: 'Please put the source in the source field and keep the explanation short.' };
  return { ok: true, value: { ...v, year: y, season: v.season || null, source_url: u.toString(), record_id: v.record_id || null, page: v.page || null } };
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
  await env.DB.prepare(`INSERT INTO submissions (created_at, type, model, brand, kind, year, season, source_url, note, record_id, page, ip_day)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
    .bind(now, s.type, s.model, s.brand, s.kind, s.year, s.season, s.source_url, s.note, s.record_id, s.page, net).run();
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

/** The overlay entry proposed for a submission; the reviewer can edit it before approving. */
export function draftOverlay(s) {
  if (s.type === 'correction' && s.record_id) {
    return { op: 'patch', id: s.record_id, set: {}, reason: s.note, source: s.source_url, submission: s.id };
  }
  const host = (() => { try { return new URL(s.source_url).hostname.replace(/^www\./, ''); } catch { return 'source'; } })();
  return { op: 'add', record: { id: `u${s.id.toString(36)}${s.created_at.toString(36).slice(-4)}`, brand: s.brand, kind: s.kind,
    year: s.year ?? null, ...(s.season ? { season: s.season } : {}), talent: [s.model], sources: [{ name: host, url: s.source_url }], via: 'community' },
    reason: s.note, submission: s.id };
}
export function validOverlayEntry(e) {
  if (!e || typeof e !== 'object') return 'missing entry';
  if (e.op === 'add') {
    const r = e.record || {};
    if (!/^u[a-z0-9]{4,24}$/.test(r.id || '')) return 'an added record needs an id starting with u';
    if (!r.brand || !Array.isArray(r.talent) || !r.talent.length) return 'an added record needs a brand and talent';
    if (!KINDS.includes(r.kind || 'campaign')) return 'unknown kind';
    if (!Array.isArray(r.sources) || !r.sources.every(x => /^https?:\/\//.test(x.url || ''))) return 'sources need http(s) URLs';
    return null;
  }
  if (e.op === 'patch') return /^r[a-z2-7]{9}$|^u[a-z0-9]{4,24}$/.test(e.id || '') && e.set && typeof e.set === 'object' && Object.keys(e.set).length ? null : 'a patch needs a record id and fields to set';
  if (e.op === 'remove') return /^r[a-z2-7]{9}$|^u[a-z0-9]{4,24}$/.test(e.id || '') ? null : 'a removal needs a record id';
  return 'unknown op';
}

async function admin(request, env, url, now) {
  if (!env.ADMIN_TOKEN) return err(503, 'admin is not configured');
  if (!authorised(request, env)) return err(401, 'unauthorised');
  const db = env.DB;
  const p = url.pathname;
  if (p === '/api/admin/submissions' && request.method === 'GET') {
    const st = url.searchParams.get('status') || 'pending';
    const q = st === 'all' ? db.prepare('SELECT * FROM submissions ORDER BY created_at DESC LIMIT 200')
      : db.prepare('SELECT * FROM submissions WHERE status = ?1 ORDER BY created_at ASC LIMIT 200').bind(st);
    const { results } = await q.all();
    return json({ submissions: results.map(s => ({ ...s, ip_day: undefined, draft: s.overlay ? JSON.parse(s.overlay) : draftOverlay(s) })) });
  }
  const m = p.match(/^\/api\/admin\/submissions\/(\d+)\/review$/);
  if (m && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch { return err(400, 'invalid JSON'); }
    const id = Number(m[1]);
    const s = await db.prepare('SELECT * FROM submissions WHERE id = ?1').bind(id).first();
    if (!s) return err(404, 'no such submission');
    if (b.action === 'reject') {
      await db.prepare("UPDATE submissions SET status = 'rejected', reviewed_at = ?2, review_note = ?3, overlay = NULL WHERE id = ?1").bind(id, now, clean(b.note, 500)).run();
      return json({ ok: true, status: 'rejected' });
    }
    if (b.action === 'approve') {
      const entry = b.overlay || draftOverlay(s);
      const problem = validOverlayEntry(entry);
      if (problem) return err(400, `overlay entry: ${problem}`);
      entry.submission = id;
      await db.prepare("UPDATE submissions SET status = 'approved', reviewed_at = ?2, review_note = ?3, overlay = ?4 WHERE id = ?1")
        .bind(id, now, clean(b.note, 500), JSON.stringify(entry)).run();
      return json({ ok: true, status: 'approved', overlay: entry });
    }
    return err(400, 'action must be approve or reject');
  }
  if (p === '/api/admin/export' && request.method === 'GET') {
    const { results } = await db.prepare("SELECT id, overlay FROM submissions WHERE status = 'approved' AND exported_at IS NULL ORDER BY reviewed_at").all();
    return json({ entries: results.map(r => JSON.parse(r.overlay)), submissions: results.map(r => r.id) });
  }
  if (p === '/api/admin/export/mark' && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch { return err(400, 'invalid JSON'); }
    const ids = (b.submissions || []).map(Number).filter(Number.isInteger);
    for (const id of ids) await db.prepare("UPDATE submissions SET exported_at = ?2 WHERE id = ?1 AND status = 'approved'").bind(id, now).run();
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
      try {
        if (url.pathname === '/api/health') return json({ ok: true });
        if (url.pathname === '/api/favourites' && request.method === 'POST') return await postFavourite(request, env, ctx, now);
        if (url.pathname === '/api/favourites/count' && request.method === 'GET') return await getCount(url, env);
        if (url.pathname === '/api/favourites/top' && request.method === 'GET') return await getTop(url, env, request, now);
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
