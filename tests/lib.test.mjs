import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../site/lib.mjs';

const credit = (o) => ({ id: o.id || 'r' + Math.random().toString(36).slice(2, 11), brand: 'Calvin Klein', kind: 'campaign', talent: ['Ann Model'], sources: [{ name: 'x', url: 'https://x.example/a' }], images: [], ...o });
const db = (campaigns, extra = {}) => L.buildIndex({ updated: '2026-10-01', brands: { Vogue: { type: 'magazine' }, 'Calvin Klein': { type: 'designer' }, ...extra }, models: {}, campaigns });

test('appearance classes: a year alone is a dated relationship, not an identified campaign', () => {
  const d = db([credit({ year: 2016 }), credit({ year: 2016, season: 'Fall/Winter' }), credit({ year: null }), credit({ year: 2016, title: 'Eternity' }),
    credit({ brand: 'Vogue', kind: 'cover', year: 2016, title: 'March 2016 issue' }), credit({ brand: 'Vogue', kind: 'cover', year: 2016 })]);
  const cls = d.campaigns.map(c => [c.season || c.title || '-', c.kind, L.appearanceClass(c, 'Ann Model')]);
  assert.deepEqual(cls.find(x => x[0] === 'Fall/Winter')[2], 'identified');
  assert.deepEqual(cls.find(x => x[0] === 'Eternity')[2], 'identified');
  assert.deepEqual(cls.find(x => x[0] === 'March 2016 issue')[2], 'identified');
  assert.equal(cls.filter(x => x[0] === '-' && x[1] === 'campaign').map(x => x[2]).sort().join(), 'dated,undated');
  assert.equal(cls.find(x => x[0] === '-' && x[1] === 'cover')[2], 'dated');
});

test('a verified photo naming her identifies the appearance; an untagged gallery photo does not', () => {
  const d = db([credit({ id: 'ra', year: 2016, images: [{ src: 'a.jpg', talent: ['Ann Model'], match: 'exact' }] }),
    credit({ id: 'rb', year: 2015, images: [{ src: 'b.jpg', talent: [], match: 'exact' }] })]);
  assert.equal(L.appearanceClass(d.byId.get('ra'), 'Ann Model'), 'identified');
  assert.equal(L.appearanceClass(d.byId.get('rb'), 'Ann Model'), 'dated');
});

test('repeated records and several photos of one appearance count once', () => {
  const d = db([
    credit({ year: 2016, season: 'Fall', images: [{ src: '1.jpg', talent: ['Ann Model'] }, { src: '2.jpg', talent: ['Ann Model'] }] }),
    credit({ year: 2016, season: 'Fall/Winter', sources: [{ name: 'y', url: 'https://y.example' }] }),   // same season family
    credit({ year: 2016 }), credit({ year: 2016 }),                                                      // year-only, covered by the identified one
    credit({ year: 2017 }), credit({ year: 2017 }),                                                      // two year-only records, one relationship
    credit({ year: null }),                                                                              // undated: never counted
    credit({ year: 2016, kind: 'runway', season: 'Fall/Winter' })                                        // a different kind
  ]);
  const t = L.rankingTable(d);
  assert.deepEqual(t.years[2016]['ann-model'], [1, 1, 0, 0]);
  assert.deepEqual(t.years[2017]['ann-model'], [1, 0, 0, 0]);
  const r = L.rankModels(t, [2016, 2017]);
  assert.equal(r[0].total, 3);
  assert.equal(L.rankModels(t, [2016, 2017], { kind: 'runway' })[0].total, 1);
  assert.equal(L.rankModels(t, [2015]).length, 0);
});

test('rankings break ties by name and respect the period', () => {
  const d = db([credit({ talent: ['Bea'], year: 2020, season: 'Spring' }), credit({ talent: ['Ada'], year: 2020, season: 'Spring' }),
    credit({ talent: ['Bea'], year: 2010, season: 'Spring' })]);
  const t = L.rankingTable(d);
  assert.deepEqual(L.rankModels(t, [2020]).map(r => r.name), ['Ada', 'Bea']);
  assert.deepEqual(L.rankModels(t, [2010, 2020]).map(r => r.name), ['Bea', 'Ada']);
  const p = L.periods(t);
  assert.ok(p.find(x => x.id === '2010s').years.includes(2010));
  assert.ok(p.find(x => x.id === 'all').years.length === 2);
});

test('earliest documented appearance is the earliest dated record', () => {
  const d = db([credit({ year: 2019, season: 'Spring' }), credit({ year: 2012 }), credit({ year: null })]);
  const e = L.earliest(d.models.get('ann-model'));
  assert.equal(e.year, 2012);
});

test('overlay: add, patch, remove, rename; unknown ids fail the build', () => {
  const raw = { updated: 'x', brands: {}, models: {}, campaigns: [credit({ id: 'raaaaaaaaa', year: 2016 }), credit({ id: 'rbbbbbbbbb', year: 2017 })] };
  const out = L.applyOverlay(raw, { entries: [
    { op: 'add', record: credit({ id: 'u1abc', year: 2018, talent: ['New Face'] }) },
    { op: 'patch', id: 'raaaaaaaaa', set: { season: 'Fall/Winter' } },
    { op: 'remove', id: 'rbbbbbbbbb' },
    { op: 'rename-model', from: 'Ann Model', to: 'Ann B. Model' }
  ] });
  assert.equal(out.campaigns.length, 2);
  assert.equal(out.campaigns.find(c => c.id === 'raaaaaaaaa').season, 'Fall/Winter');
  assert.ok(out.campaigns.every(c => !c.talent.includes('Ann Model')));
  assert.equal(raw.campaigns[0].season, undefined, 'the original data is not mutated');
  assert.throws(() => L.applyOverlay(raw, { entries: [{ op: 'patch', id: 'rzzzzzzzzz', set: { year: 1 } }] }), /no credit with this id/);
  assert.throws(() => L.applyOverlay(raw, { entries: [{ op: 'add', record: { id: 'raaaaaaaaa' } }] }), /new unique id/);
});

test('combined model × label pages need 3 dated appearances, one identified', () => {
  const few = db([credit({ year: 2016, season: 'Spring' }), credit({ year: 2017 })]);
  assert.equal(L.comboPages(few).length, 0);
  const enough = db([credit({ year: 2016, season: 'Spring' }), credit({ year: 2017 }), credit({ year: 2018 })]);
  assert.equal(L.comboPages(enough).length, 1);
  const datedOnly = db([credit({ year: 2016 }), credit({ year: 2017 }), credit({ year: 2018 })]);
  assert.equal(L.comboPages(datedOnly).length, 0);
});

test('photosOf shows a model only her attributed photos; otherPhotos keeps the rest', () => {
  const d = db([credit({ year: 2016, talent: ['Ann Model', 'Bea'], images: [{ src: 'a', talent: ['Ann Model'] }, { src: 'b', talent: ['Bea'] }, { src: 'c', talent: [] }] })]);
  const c = d.campaigns[0];
  assert.deepEqual(L.photosOf(c, 'Ann Model').map(i => i.src), ['a']);
  assert.deepEqual(L.otherPhotos(c, 'Ann Model').map(i => i.src), ['b', 'c']);
});
