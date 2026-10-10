import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../site/lib.mjs';
import { compareTable, Refs } from '../site/render.mjs';
import { manufacturers, family } from './fixtures.mjs';

const db = () => L.buildIndex(manufacturers, [structuredClone(family)], { updated: '2026-10-01', currentYear: 2026 });

test('production years, model years and reveal dates stay distinct', () => {
  const d = db();
  const r1 = d.gens.get('acme-trek-r1');
  assert.equal(L.period(r1), '2007–2013');
  assert.equal(L.fmtDate('2010-09'), 'September 2010');
  assert.deepEqual(L.modelYearGens(d, 2008).map(x => x.g.id), ['acme-trek-r1']);
  assert.deepEqual(L.modelYearGens(d, 2007), [], 'model year 2008 starts in 2007 production, but 2007 is not a model year');
  assert.ok(L.inProduction(d, 2007).some(g => g.id === 'acme-trek-r1'));
  const ev = L.yearEvents(d);
  assert.ok(ev.get(2000).some(e => e.type === 'revealed'));
  assert.ok(ev.get(2010).some(e => e.type === 'revision'));
  assert.equal(L.period({ dates: {}, ongoing: false }), 'Production dates not documented');
});

test('two market lines: predecessors per line, shared successor', () => {
  const d = db();
  const fam = d.families.get('acme-trek');
  assert.deepEqual(fam.pairs.map(p => `${p.prev.slug}>${p.next.slug}`).sort(), ['r1>t2', 't1>t2']);
  const t2 = d.gens.get('acme-trek-t2');
  assert.deepEqual(L.predecessors(t2).map(g => g.slug).sort(), ['r1', 't1']);
});

test('dimensions are compared only within one market and the standard body', () => {
  const d = db();
  const [t1, r1, t2] = ['t1', 'r1', 't2'].map(s => d.gens.get('acme-trek-' + s));
  const cd = L.commonDims([t1, t2]);
  assert.equal(cd.market, 'EU');
  assert.deepEqual(cd.records.map(r => r.id), ['d1', 'd1'], 'the coupé record is not used');
  assert.deepEqual(cd.values.find(v => v.key === 'length').mm, [4500, 4640]);
  assert.equal(L.commonDims([r1, t2]), null, 'a US Roam and a European Trek are not compared');
  const refs = new Refs();
  const html = compareTable(refs, [r1, t2]);
  assert.match(html, /no dimension figures for the same market/);
  assert.match(compareTable(new Refs(), [t1, t2]), /\+140 mm/);
});

test('derived changes say what they compare and units keep the source unit first', () => {
  const d = db();
  const [t1, t2] = ['t1', 't2'].map(s => d.gens.get('acme-trek-' + s));
  const ch = L.derivedChanges(t1, t2).map(c => c.text).join(' ');
  assert.match(ch, /plug-in hybrid/);
  assert.match(ch, /5 seats \(T1\) → 5 or 7 seats \(T2\)/);
  assert.equal(L.fmtLength(4640, 'mm'), '4,640 mm (182.7 in)');
  assert.equal(L.fmtLength(182.9, 'in'), '182.9 in (4,646 mm)');
  assert.equal(L.fmtPower({ value: 150, unit: 'PS' }), '150 PS (110 kW)');
  assert.equal(L.fmtPower({ value: 300, unit: 'hp' }), '300 hp (224 kW)');
  assert.match(L.fmtCargo({ value: 38, unit: 'cu ft' }), /38\.0 cu ft \(1,076 L converted\)/);
  assert.equal(L.topPower(t2).id, 'p2');
});

test('overlay: set, add and remove by stable id; unknown targets stop the build', () => {
  const ov = { entries: [
    { op: 'set', target: 'acme-trek-t2#d1', field: 'length', value: 4641, source: { url: 'https://example.org/b', title: 'B', publisher: 'Acme', type: 'manufacturer' } },
    { op: 'add', target: 'acme-trek-t2', list: 'powertrains', item: { id: 'p3', market: 'EU', fuel: 'diesel', src: '$source', quotes: ['x'] }, source: { url: 'https://example.org/c', title: 'C', publisher: 'Acme', type: 'manufacturer' } },
    { op: 'remove', target: 'acme-trek-t2#r1c1' },
    { op: 'set', target: 'acme-trek-t1', field: 'dates.productionEnd', value: { value: '2007', src: 's1', quote: 'q' } }
  ] };
  const [out] = L.applyOverlay([family], ov);
  const t2 = out.generations.find(g => g.slug === 't2');
  assert.equal(t2.dimensions[0].length, 4641);
  assert.equal(t2.powertrains.at(-1).src, 'ov2');
  assert.equal(out.sources.ov2.url, 'https://example.org/c');
  assert.equal(t2.revisions[0].changes.length, 0);
  assert.equal(out.generations[0].dates.productionEnd.value, '2007');
  assert.equal(family.generations[2].dimensions[0].length, 4640, 'the source data is not mutated');
  assert.throws(() => L.applyOverlay([family], { entries: [{ op: 'set', target: 'acme-trek-t9', field: 'x', value: 1 }] }), /unknown target/);
  assert.throws(() => L.applyOverlay([family], { entries: [{ op: 'remove', target: 'acme-trek-t2#zz' }] }), /unknown item/);
  assert.throws(() => L.applyOverlay([family], { entries: [{ op: 'add', target: 'acme-trek-t2', list: 'powertrains', item: { id: 'p1' } }] }), /already exists/);
});

test('filters classify body styles and fuels from the documented lists', () => {
  assert.equal(L.bodyGroup('Coupé SUV'), 'Coupé SUV');
  assert.equal(L.bodyGroup('5-door SUV'), 'SUV');
  assert.equal(L.bodyGroup('3-door SUV'), '3-door');
  assert.equal(L.bodyGroup('Long-wheelbase SUV (Allspace)'), 'Long wheelbase');
  const t2 = db().gens.get('acme-trek-t2');
  assert.deepEqual(L.fuelsOf(t2), ['petrol', 'plug-in hybrid']);
  assert.deepEqual(L.seatsOf(t2), [5, 7]);
});
