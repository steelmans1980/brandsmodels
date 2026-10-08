// The Worker's API against a real SQLite database (node:sqlite) behind a minimal D1-compatible shim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { validateSubmission, draftOverlay, validOverlayEntry } from '../worker/index.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args)
  });
  return { prepare: sql => stmt(sql), batch: async ss => Promise.all(ss.map(s => s.run())), raw: db };
}
const ASSETS = { fetch: async () => new Response(JSON.stringify({ models: [['Ann Model', 'ann-model', 3], ['Bea', 'bea', 2], ['Cleo', 'cleo', 1]] })) };
const ctx = { waitUntil() {} };
const ORIGIN = 'https://brandsmodels.com';
const env = (extra = {}) => ({ DB: d1(), ASSETS, HASH_SALT: 'test', ADMIN_TOKEN: 'a-long-admin-token-for-tests-123', ...extra });
const call = (e, path, { method = 'GET', body, headers = {}, ip = '1.1.1.1' } = {}) => worker.fetch(new Request(ORIGIN + path, {
  method, headers: { origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), e, ctx);
const fav = (e, visitor, model, on, ip) => call(e, '/api/favourites', { method: 'POST', body: { visitor, model, on }, ip });

test('favourites are idempotent: repeats and retries count once; removing undoes', async () => {
  const e = env();
  for (let i = 0; i < 4; i++) assert.equal((await (await fav(e, 'visitor-0001', 'ann-model', true)).json()).count, 1);
  assert.equal((await (await fav(e, 'visitor-0002', 'ann-model', true)).json()).count, 2);
  assert.equal((await (await fav(e, 'visitor-0001', 'ann-model', false)).json()).count, 1);
  assert.equal((await (await fav(e, 'visitor-0001', 'ann-model', false)).json()).count, 1, 'removing twice changes nothing');
  assert.equal((await (await call(e, '/api/favourites/count?model=ann-model')).json()).count, 1);
  const raw = e.DB.raw.prepare('SELECT visitor_hash FROM favourites').all();
  assert.ok(raw.every(r => /^[0-9a-f]{64}$/.test(r.visitor_hash) && !r.visitor_hash.includes('visitor')), 'browser ids are stored hashed');
});

test('favourites: validation, unknown models and cross-site requests are refused', async () => {
  const e = env();
  assert.equal((await fav(e, 'short', 'ann-model', true)).status, 400);
  assert.equal((await fav(e, 'visitor-0001', 'Ann Model', true)).status, 400);
  assert.equal((await fav(e, 'visitor-0001', 'nobody', true)).status, 404);
  const cross = await call(e, '/api/favourites', { method: 'POST', body: { visitor: 'visitor-0001', model: 'ann-model', on: true }, headers: { origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
});

test('favourites: only the first 20 browsers per network per day are counted; changes are rate limited', async () => {
  const e = env();
  let last;
  for (let i = 1; i <= 22; i++) last = await (await fav(e, `visitor-net-${i}`, "bea", true, "9.9.9.9")).json();
  assert.equal(last.count, 20);
  assert.equal((await (await fav(e, "visitor-other-1", "bea", true, "8.8.8.8")).json()).count, 21);
  let status = 200;
  for (let i = 0; i < 125 && status !== 429; i++) status = (await fav(e, 'visitor-spam-1', 'cleo', i % 2 === 0, '7.7.7.7')).status;
  assert.equal(status, 429);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) n FROM rate_limits WHERE key LIKE '%7.7.7.7%'").get().n, 0, 'no raw IPs stored');
});

test('fan favourites: minimum 3, all time vs last 30 days', async () => {
  const e = env();
  for (const [i, v] of ['a', 'b', 'c', 'd'].entries()) await fav(e, `visitor-top-${v}`, 'ann-model', true, `2.2.2.${i}`);
  for (const [i, v] of ['a', 'b'].entries()) await fav(e, `visitor-top-${v}`, 'bea', true, `2.2.2.${i}`);
  e.DB.raw.prepare("UPDATE favourites SET created_at = created_at - 40*86400000 WHERE model = 'ann-model' AND rowid IN (SELECT rowid FROM favourites WHERE model='ann-model' LIMIT 2)").run();
  const all = await (await call(e, '/api/favourites/top?window=all')).json();
  assert.deepEqual(all.models.map(m => [m.model, m.count, m.name]), [['ann-model', 4, 'Ann Model']]);
  const recent = await (await call(e, '/api/favourites/top?window=30d')).json();
  assert.deepEqual(recent.models, [], 'only 2 added in the last 30 days: below the minimum');
});

test('submissions: validation never fetches and rejects unsafe or private links', () => {
  const base = { model: 'Ann Model', brand: 'Vogue', kind: 'cover', source: 'https://www.vogue.com/x', note: 'Missing March 2016 cover.' };
  assert.equal(validateSubmission(base).ok, true);
  for (const source of ['javascript:alert(1)', 'ftp://x.example/a', 'http://localhost/a', 'http://192.168.1.1/x', 'https://user:pw@x.example/', 'not a url'])
    assert.equal(validateSubmission({ ...base, source }).ok, false, source);
  assert.equal(validateSubmission({ ...base, kind: 'photo' }).ok, false);
  assert.equal(validateSubmission({ ...base, year: '2099' }).ok, false);
  assert.equal(validateSubmission({ ...base, note: 'short' }).ok, false);
  assert.equal(validateSubmission({ ...base, note: 'see https://a.example https://b.example https://c.example' }).ok, false);
  assert.equal(validateSubmission({ ...base, model: '<b>' + 'x'.repeat(300) }).value.model.length, 120);
});

test('submissions: stored privately; honeypot and too-fast forms store nothing; rate limited', async () => {
  const e = env();
  const body = { type: 'missing', model: 'Ann Model', brand: 'Vogue', kind: 'cover', year: '2016', source: 'https://www.vogue.com/x', note: 'Missing March 2016 cover.', ts: '1' };
  assert.equal((await call(e, '/api/submissions', { method: 'POST', body })).status, 200);
  assert.equal((await call(e, '/api/submissions', { method: 'POST', body: { ...body, website: 'spam' } })).status, 200);
  assert.equal((await call(e, '/api/submissions', { method: 'POST', body: { ...body, ts: String(Date.now()) } })).status, 200);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM submissions').get().n, 1);
  const form = await call(e, '/api/submissions', { method: 'POST', body: new URLSearchParams({ ...body }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 303);
  assert.match(form.headers.get('location'), /\/suggest\/\?sent=1$/);
  let s = 200;
  for (let i = 0; i < 6; i++) s = (await call(e, '/api/submissions', { method: 'POST', body })).status;
  assert.equal(s, 429);
});

test('admin: disabled without a token, refuses wrong tokens, never exposes network codes', async () => {
  assert.equal((await call(env({ ADMIN_TOKEN: undefined }), '/api/admin/submissions')).status, 503);
  const e = env();
  assert.equal((await call(e, '/api/admin/submissions')).status, 401);
  assert.equal((await call(e, '/api/admin/submissions', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await call(e, '/api/admin/submissions', { headers: { authorization: 'Bearer a-long-admin-token-for-tests-12' } })).status, 401);
  assert.equal((await call(e, '/api/admin/export', { headers: { authorization: 'Basic x' } })).status, 401);
  assert.equal((await call(e, '/api/admin/submissions/1/review', { method: 'POST', body: { action: 'approve' } })).status, 401);
  await call(e, '/api/submissions', { method: 'POST', body: { model: 'Ann Model', brand: 'Vogue', kind: 'cover', source: 'https://www.vogue.com/x', note: 'Missing March 2016 cover.', ts: '1' } });
  const j = await (await call(e, '/api/admin/submissions', { headers: { authorization: 'Bearer a-long-admin-token-for-tests-123' } })).json();
  assert.equal(j.submissions.length, 1);
  assert.equal(j.submissions[0].ip_day, undefined);
  const page = await call(e, '/admin');
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.ok(!(await page.text()).includes('Ann Model'), 'the admin page itself carries no data');
});

test('admin: approve prepares a validated overlay entry; export and mark', async () => {
  const e = env();
  const auth = { authorization: 'Bearer a-long-admin-token-for-tests-123' };
  await call(e, '/api/submissions', { method: 'POST', body: { model: 'Ann Model', brand: 'Vogue', kind: 'cover', year: '2016', source: 'https://www.vogue.com/x', note: 'Missing March 2016 cover.', ts: '1' } });
  await call(e, '/api/submissions', { method: 'POST', ip: '3.3.3.3', body: { type: 'correction', record: 'raaaaaaaaa', model: 'Ann Model', brand: 'Vogue', kind: 'cover', source: 'https://www.vogue.com/y', note: 'The year should be 2015, see source.', ts: '1' } });
  const list = (await (await call(e, '/api/admin/submissions', { headers: auth })).json()).submissions;
  assert.equal(list[0].draft.op, 'add');
  assert.match(list[0].draft.record.id, /^u[a-z0-9]+$/);
  assert.equal(list[1].draft.op, 'patch');
  // a correction cannot be approved until the reviewer says what to change
  assert.equal((await call(e, `/api/admin/submissions/${list[1].id}/review`, { method: 'POST', headers: auth, body: { action: 'approve' } })).status, 400);
  assert.equal((await call(e, `/api/admin/submissions/${list[1].id}/review`, { method: 'POST', headers: auth, body: { action: 'approve', overlay: { ...list[1].draft, set: { year: 2015 } } } })).status, 200);
  assert.equal((await call(e, `/api/admin/submissions/${list[0].id}/review`, { method: 'POST', headers: auth, body: { action: 'reject', note: 'source does not show it' } })).status, 200);
  const exp = await (await call(e, '/api/admin/export', { headers: auth })).json();
  assert.equal(exp.entries.length, 1);
  assert.deepEqual(exp.entries[0].set, { year: 2015 });
  await call(e, '/api/admin/export/mark', { method: 'POST', headers: auth, body: { submissions: exp.submissions } });
  assert.equal((await (await call(e, '/api/admin/export', { headers: auth })).json()).entries.length, 0);
});

test('overlay entries are validated', () => {
  assert.equal(validOverlayEntry({ op: 'add', record: { id: 'u12345', brand: 'X', kind: 'campaign', talent: ['A'], sources: [{ url: 'https://x' }] } }), null);
  assert.ok(validOverlayEntry({ op: 'add', record: { id: 'r123', brand: 'X', talent: ['A'], sources: [] } }));
  assert.ok(validOverlayEntry({ op: 'add', record: { id: 'u12345', brand: 'X', talent: ['A'], sources: [{ url: 'javascript:x' }] } }));
  assert.ok(validOverlayEntry({ op: 'patch', id: 'raaaaaaaaa', set: {} }));
  assert.ok(validOverlayEntry({ op: 'drop', id: 'raaaaaaaaa' }));
  assert.equal(draftOverlay({ id: 7, created_at: 1791489231999, type: 'missing', model: 'A', brand: 'B', kind: 'campaign', year: 2016, season: null, source_url: 'https://b.example/x', note: 'n' }).record.talent[0], 'A');
});

test('the API reports unavailable instead of failing when the database is not configured', async () => {
  const r = await call({ ASSETS }, '/api/favourites/count?model=ann-model');
  assert.equal(r.status, 503);
});
