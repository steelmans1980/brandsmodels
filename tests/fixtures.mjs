// Small invented data for unit tests (not real cars): one family with two market lines, as for X-Trail/Rogue.
export const manufacturers = [{ id: 'acme', slug: 'acme', name: 'Acme' }];
const f = (value, src = 's1', quote = 'q') => ({ value, src, quote });
export const family = {
  id: 'acme-trek', slug: 'trek', manufacturer: 'acme', name: 'Acme Trek',
  lines: [{ id: 'trek', name: 'Trek' }, { id: 'roam', name: 'Roam' }],
  sources: { s1: { url: 'https://example.org/a', title: 'A', publisher: 'Acme Media', type: 'manufacturer', accessed: '2026-10-01' } },
  generations: [
    { id: 'acme-trek-t1', slug: 't1', ordinal: 1, lines: ['trek'], name: 'First generation', codes: [{ value: 'T1', src: 's1', quote: 'T1' }],
      dates: { revealed: f('2000-03'), productionStart: f('2000'), productionEnd: f('2006') },
      bodyStyles: [{ id: 'b1', value: '5-door SUV', src: 's1', quote: 'q' }], seating: { options: [5], src: 's1', quote: '5' },
      dimensions: [{ id: 'd1', market: 'EU', unit: 'mm', length: 4500, width: 1800, height: 1700, wheelbase: 2600, src: 's1', quotes: ['q'] },
        { id: 'd2', market: 'US', unit: 'in', length: 180, src: 's1', quotes: ['q'] }],
      powertrains: [{ id: 'p1', market: 'EU', fuel: 'petrol', name: '2.0', power: { value: 110, unit: 'kW' }, src: 's1', quotes: ['q'] }] },
    { id: 'acme-trek-r1', slug: 'r1', ordinal: 1, lines: ['roam'], name: 'First generation (Roam)', codes: [{ value: 'R1', src: 's1', quote: 'R1' }],
      dates: { productionStart: f('2007'), productionEnd: f('2013'), modelYears: [{ market: 'US', from: 2008, to: 2013, src: 's1', quote: '2008 2013' }] },
      dimensions: [{ id: 'd1', market: 'US', unit: 'in', length: 182.9, src: 's1', quotes: ['q'] }] },
    { id: 'acme-trek-t2', slug: 't2', ordinal: 2, lines: ['trek', 'roam'], name: 'Second generation', codes: [{ value: 'T2', src: 's1', quote: 'T2' }],
      dates: { productionStart: f('2007'), productionEnd: f('2013') },
      seating: { options: [5, 7], src: 's1', quote: '5 7' },
      bodyStyles: [{ id: 'b1', value: '5-door SUV', src: 's1', quote: 'q' }, { id: 'b2', value: 'Coupé SUV', src: 's1', quote: 'q' }],
      dimensions: [{ id: 'd1', market: 'EU', unit: 'mm', version: 'pre-facelift', length: 4640, width: 1820, src: 's1', quotes: ['q'] },
        { id: 'd2', market: 'EU', unit: 'mm', version: 'Coupé', length: 4700, src: 's1', quotes: ['q'] }],
      powertrains: [{ id: 'p1', market: 'EU', fuel: 'petrol', power: { value: 150, unit: 'PS' }, src: 's1', quotes: ['q'] },
        { id: 'p2', market: 'EU', fuel: 'plug-in hybrid', power: { value: 300, unit: 'hp' }, src: 's1', quotes: ['q'] }],
      changes: [{ id: 'c1', topic: 'dimensions', text: 'Longer than the T1.', vs: 'acme-trek-t1', src: 's1', quote: 'q' },
        { id: 'c2', topic: 'design', text: 'Replaces the Roam R1.', vs: 'acme-trek-r1', src: 's1', quote: 'q' },
        { id: 'c3', topic: 'technology', text: 'Applies to both.', src: 's1', quote: 'q' }],
      revisions: [{ id: 'r1', slug: '2010-facelift', kind: 'facelift', name: 'Facelift', dates: { revealed: f('2010-09') }, changes: [{ id: 'r1c1', topic: 'design', text: 'New lights.', src: 's1', quote: 'q' }] }],
      ongoing: false }
  ]
};
