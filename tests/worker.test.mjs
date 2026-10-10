// The Worker's API against a real SQLite database (node:sqlite) behind a minimal D1-compatible shim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { validateSubmission, draftOverlay, validOverlayEntry } from '../worker/index.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  // Both migrations, in order, as on the real database.
  for (const m of ['0001_init.sql', '0002_car_archive.sql', '0003_drop_retired_tables.sql']) db.exec(fs.readFileSync(new URL('../migrations/' + m, import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args)
  });
  return { prepare: sql => stmt(sql), batch: async ss => Promise.all(ss.map(s => s.run())), raw: db };
}
const INDEX = { families: [{ id: 'acme-trek', n: 'Acme Trek' }], gens: [{ id: 'acme-trek-t1', n: 'Acme Trek (T1)' }, { id: 'acme-trek-t2', n: 'Acme Trek (T2)' }] };
const ASSETS = { fetch: async () => new Response(JSON.stringify(INDEX)) };
const ctx = { waitUntil() {} };
const ORIGIN = 'https://cars.example';
const TOKEN = 'a-long-admin-token-for-tests-123';
const env = (extra = {}) => ({ DB: d1(), ASSETS, HASH_SALT: 'test', ADMIN_TOKEN: TOKEN, ...extra });
const call = (e, path, { method = 'GET', body, headers = {}, ip = '1.1.1.1' } = {}) => worker.fetch(new Request(ORIGIN + path, {
  method, headers: { origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), e, ctx);
const save = (e, visitor, item, on, ip) => call(e, '/api/garage', { method: 'POST', body: { visitor, item, on }, ip });
const auth = { authorization: `Bearer ${TOKEN}` };
const car = { type: 'car', make: 'Acme', model: 'Trek', generation: 'T3', market: 'Europe', year: '2024', yearKind: 'calendar', sourceUrl: 'https://media.acme.example/t3', note: 'The third generation was revealed in 2024.', ts: '1' };

test('without HASH_SALT the public API stores nothing', async () => {
  const e = env({ HASH_SALT: undefined });
  assert.equal((await save(e, 'visitor-0001', 'family:acme-trek', true)).status, 503);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM car_garage').get().n, 0);
  assert.equal((await call(e, '/api/garage/top?window=all')).status, 503);
});

test('garage saves are idempotent: repeats and retries count once; removing undoes', async () => {
  const e = env();
  for (let i = 0; i < 4; i++) assert.equal((await (await save(e, 'visitor-0001', 'generation:acme-trek-t2', true)).json()).count, 1);
  assert.equal((await (await save(e, 'visitor-0002', 'generation:acme-trek-t2', true)).json()).count, 2);
  assert.equal((await (await save(e, 'visitor-0001', 'generation:acme-trek-t2', false)).json()).count, 1);
  assert.equal((await (await save(e, 'visitor-0001', 'generation:acme-trek-t2', false)).json()).count, 1, 'removing twice changes nothing');
  assert.equal((await (await call(e, '/api/garage/count?item=generation:acme-trek-t2')).json()).count, 1);
  const raw = e.DB.raw.prepare('SELECT visitor_hash FROM car_garage').all();
  assert.ok(raw.every(r => /^[0-9a-f]{64}$/.test(r.visitor_hash)), 'browser ids are stored hashed');
});

test('migrations leave only the car tables', () => {
  const e = env();
  const names = e.DB.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name).sort();
  assert.deepEqual(names, ['car_garage', 'car_garage_networks', 'car_rate_limits', 'car_submissions']);
});

test('garage: validation, unknown items and cross-site requests are refused', async () => {
  const e = env();
  assert.equal((await save(e, 'short', 'family:acme-trek', true)).status, 400);
  assert.equal((await save(e, 'visitor-0001', 'acme-trek', true)).status, 400);
  assert.equal((await save(e, 'visitor-0001', 'model:acme-trek', true)).status, 400);
  assert.equal((await save(e, 'visitor-0001', 'generation:acme-trek-t9', true)).status, 404);
  const cross = await call(e, '/api/garage', { method: 'POST', body: { visitor: 'visitor-0001', item: 'family:acme-trek', on: true }, headers: { origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
});

test('garage: only the first 20 browsers per network per day are counted; changes are rate limited', async () => {
  const e = env();
  let last;
  for (let i = 1; i <= 22; i++) last = await (await save(e, `visitor-net-${i}`, 'family:acme-trek', true, '9.9.9.9')).json();
  assert.equal(last.count, 20);
  assert.equal((await (await save(e, 'visitor-other-1', 'family:acme-trek', true, '8.8.8.8')).json()).count, 21);
  let status = 200;
  for (let i = 0; i < 125 && status !== 429; i++) status = (await save(e, 'visitor-spam-1', 'generation:acme-trek-t1', i % 2 === 0, '7.7.7.7')).status;
  assert.equal(status, 429);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) n FROM car_rate_limits WHERE key LIKE '%7.7.7.7%'").get().n, 0, 'no raw addresses stored');
});

test('popular: minimum 3, all time vs last 30 days, names from the published index', async () => {
  const e = env();
  for (const [i, v] of ['a', 'b', 'c', 'd'].entries()) await save(e, `visitor-top-${v}`, 'generation:acme-trek-t2', true, `2.2.2.${i}`);
  for (const [i, v] of ['a', 'b'].entries()) await save(e, `visitor-top-${v}`, 'family:acme-trek', true, `2.2.2.${i}`);
  e.DB.raw.prepare("UPDATE car_garage SET created_at = created_at - 40*86400000 WHERE rowid IN (SELECT rowid FROM car_garage WHERE item='generation:acme-trek-t2' LIMIT 2)").run();
  const all = await (await call(e, '/api/garage/top?window=all')).json();
  assert.deepEqual(all.items.map(m => [m.item, m.count, m.name]), [['generation:acme-trek-t2', 4, 'Acme Trek (T2)']]);
  const recent = await (await call(e, '/api/garage/top?window=30d')).json();
  assert.deepEqual(recent.items, [], 'only 2 saved in the last 30 days: below the minimum');
});

test('submissions: three types; links are validated, never fetched; unsafe links refused', () => {
  assert.equal(validateSubmission(car).ok, true);
  assert.equal(validateSubmission({ ...car, sourceUrl: '' }).ok, true, 'a missing car may come without a link');
  assert.equal(validateSubmission({ ...car, type: 'correction', sourceUrl: '' }).ok, false, 'a correction needs a source');
  assert.equal(validateSubmission({ ...car, type: 'source', sourceUrl: '', photoUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg' }).ok, true);
  assert.equal(validateSubmission({ ...car, type: 'review' }).ok, false);
  for (const u of ['javascript:alert(1)', 'ftp://x.example/a', 'http://localhost/a', 'http://192.168.1.1/x', 'http://172.20.0.1/', 'https://user:pw@x.example/', 'not a url'])
    assert.equal(validateSubmission({ ...car, sourceUrl: u }).ok, false, u);
  assert.equal(validateSubmission({ ...car, photoUrl: 'javascript:x' }).ok, false);
  assert.equal(validateSubmission({ ...car, year: '2099' }).ok, false);
  assert.equal(validateSubmission({ ...car, note: 'short' }).ok, false);
  assert.equal(validateSubmission({ ...car, note: 'see https://a.example https://b.example https://c.example' }).ok, false);
  assert.equal(validateSubmission({ ...car, model: 'x'.repeat(300) }).value.model.length, 80);
  assert.equal(validateSubmission({ ...car, target: '"><script>' }).value.target, null);
  assert.equal(validateSubmission({ ...car, yearKind: 'galactic' }).value.year_kind, null);
});

test('submissions: stored privately; honeypot and too-fast forms store nothing; rate limited', async () => {
  const e = env();
  assert.equal((await call(e, '/api/submissions', { method: 'POST', body: car })).status, 200);
  assert.equal((await call(e, '/api/submissions', { method: 'POST', body: { ...car, website: 'spam' } })).status, 200);
  assert.equal((await call(e, '/api/submissions', { method: 'POST', body: { ...car, ts: String(Date.now()) } })).status, 200);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM car_submissions').get().n, 1);
  assert.equal(e.DB.raw.prepare("SELECT status FROM car_submissions").get().status, 'pending');
  const form = await call(e, '/api/submissions', { method: 'POST', body: new URLSearchParams({ ...car }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 303);
  assert.match(form.headers.get('location'), /\/suggest\/\?sent=1$/);
  let s = 200;
  for (let i = 0; i < 6; i++) s = (await call(e, '/api/submissions', { method: 'POST', body: car })).status;
  assert.equal(s, 429);
});

test('admin: disabled without a token, refuses wrong tokens, never exposes network codes', async () => {
  assert.equal((await call(env({ ADMIN_TOKEN: undefined }), '/api/admin/submissions')).status, 503);
  const e = env();
  assert.equal((await call(e, '/api/admin/submissions')).status, 401);
  assert.equal((await call(e, '/api/admin/submissions', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await call(e, '/api/admin/submissions', { headers: { authorization: `Bearer ${TOKEN.slice(0, -1)}` } })).status, 401);
  assert.equal((await call(e, '/api/admin/export', { headers: { authorization: 'Basic x' } })).status, 401);
  assert.equal((await call(e, '/api/admin/submissions/1/review', { method: 'POST', body: { action: 'approve' } })).status, 401);
  await call(e, '/api/submissions', { method: 'POST', body: car });
  const j = await (await call(e, '/api/admin/submissions', { headers: auth })).json();
  assert.equal(j.submissions.length, 1);
  assert.equal(j.submissions[0].ip_day, undefined);
  const page = await call(e, '/admin');
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  const html = await page.text();
  assert.ok(!html.includes('Trek'), 'the admin page itself carries no data');
  assert.match(html, /The Car Archive/);
});

test('admin: corrections need a completed overlay entry; leads approve without one; export and mark', async () => {
  const e = env();
  await call(e, '/api/submissions', { method: 'POST', body: car });
  await call(e, '/api/submissions', { method: 'POST', ip: '3.3.3.3', body: { ...car, type: 'correction', target: 'acme-trek-t2#d1', note: 'The length is 4,641 mm per the press kit.' } });
  const list = (await (await call(e, '/api/admin/submissions', { headers: auth })).json()).submissions;
  const [lead, corr] = list;
  assert.equal(lead.draft, null);
  assert.equal(corr.draft.op, 'set');
  assert.equal(corr.draft.target, 'acme-trek-t2#d1');
  // the TODO placeholders must be replaced first
  assert.equal((await call(e, `/api/admin/submissions/${corr.id}/review`, { method: 'POST', headers: auth, body: { action: 'approve', overlay: corr.draft } })).status, 400);
  const entry = { ...corr.draft, field: 'length', value: 4641, source: { ...corr.draft.source, title: 'Acme Trek press kit' } };
  assert.equal((await call(e, `/api/admin/submissions/${corr.id}/review`, { method: 'POST', headers: auth, body: { action: 'approve', overlay: entry } })).status, 200);
  assert.equal((await call(e, `/api/admin/submissions/${lead.id}/review`, { method: 'POST', headers: auth, body: { action: 'approve', overlay: null } })).status, 200);
  const exp = await (await call(e, '/api/admin/export', { headers: auth })).json();
  assert.equal(exp.entries.length, 1, 'a lead has nothing to export');
  assert.equal(exp.entries[0].value, 4641);
  await call(e, '/api/admin/export/mark', { method: 'POST', headers: auth, body: { submissions: exp.submissions } });
  assert.equal((await (await call(e, '/api/admin/export', { headers: auth })).json()).entries.length, 0);
});

test('overlay entries are validated', () => {
  assert.equal(validOverlayEntry(null), null);
  assert.equal(validOverlayEntry({ op: 'set', target: 'acme-trek-t2#d1', field: 'length', value: 4641 }), null);
  assert.equal(validOverlayEntry({ op: 'add', target: 'acme-trek-t2', list: 'powertrains', item: { id: 'p9' } }), null);
  assert.ok(validOverlayEntry({ op: 'add', target: 'acme-trek-t2', list: 'images', item: {} }));
  assert.ok(validOverlayEntry({ op: 'remove', target: 'acme-trek-t2' }));
  assert.ok(validOverlayEntry({ op: 'set', target: 'Acme Trek', field: 'x', value: 1 }));
  assert.ok(validOverlayEntry({ op: 'set', target: 'acme-trek-t2', field: 'x', value: 1, source: { url: 'javascript:x' } }));
  assert.ok(validOverlayEntry({ op: 'drop', target: 'acme-trek-t2' }));
  assert.equal(draftOverlay({ id: 7, created_at: 1791489231999, type: 'car', source_url: null }), null);
});

test('the API reports unavailable instead of failing when the database is not configured', async () => {
  const r = await call({ ASSETS }, '/api/garage/count?item=family:acme-trek');
  assert.equal(r.status, 503);
});
