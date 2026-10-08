#!/usr/bin/env node
// Gives every credit in data/campaigns.json a persistent id, reusing the ids of a previous version.
// Run after a quarterly import that replaced campaigns.json:
//   node scripts/assign-ids.mjs --previous path/to/previous/campaigns.json
// A credit keeps its old id when its key (label, kind, year, season, title, models, first source) matches, or when
// the same label, kind, year and models match a single previous credit. Other credits get a new id. Ids are never
// reused for a different credit. The file keeps its one-record-per-line layout.
import fs from 'node:fs';
import crypto from 'node:crypto';

const file = 'data/campaigns.json';
const argPrev = process.argv.indexOf('--previous');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const prev = argPrev > 0 ? JSON.parse(fs.readFileSync(process.argv[argPrev + 1], 'utf8')).campaigns : [];

const fullKey = c => [c.brand, c.kind || 'campaign', c.year ?? 'None', c.season || '', c.title || '', [...c.talent].sort().join(','), c.sources?.[0]?.url || ''].join('|');
const looseKey = c => [c.brand, c.kind || 'campaign', c.year ?? 'None', [...c.talent].sort().join(',')].join('|');
const byFull = new Map(), byLoose = new Map();
for (const c of prev) {
  if (!c.id) continue;
  byFull.set(fullKey(c), c.id);
  byLoose.set(looseKey(c), byLoose.has(looseKey(c)) ? null : c.id); // ambiguous loose keys are not reused
}
const used = new Set(raw.campaigns.filter(c => c.id).map(c => c.id));
const known = new Set(prev.map(c => c.id).filter(Boolean));
const b32 = buf => { const a = 'abcdefghijklmnopqrstuvwxyz234567'; let bits = 0, v = 0, out = ''; for (const x of buf) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += a[(v >>> (bits - 5)) & 31]; bits -= 5; } } return out; };
let reused = 0, created = 0;
for (const c of raw.campaigns) {
  if (c.id) continue;
  let id = byFull.get(fullKey(c)) || byLoose.get(looseKey(c));
  if (id && !used.has(id)) { reused++; } else {
    let n = 0;
    do { id = 'r' + b32(crypto.createHash('sha1').update(fullKey(c) + (n ? '#' + n : '')).digest()).slice(0, 9); n++; } while (used.has(id) || known.has(id));
    created++;
  }
  used.add(id);
  const rest = { ...c }; for (const k of Object.keys(c)) delete c[k]; Object.assign(c, { id }, rest);
}
// one record per line, as the site's data file has always been written
const j = o => JSON.stringify(o);
const lines = ['{', `  "updated": ${j(raw.updated)},`, '  "brands": {', Object.entries(raw.brands).map(([k, v]) => `    ${j(k)}: ${j(v)}`).join(',\n'),
  '  },', '  "models": {', Object.entries(raw.models).map(([k, v]) => `    ${j(k)}: ${j(v)}`).join(',\n'), '  },', '  "campaigns": [',
  raw.campaigns.map(c => '    ' + j(c)).join(',\n'), '  ]', '}'];
fs.writeFileSync(file, lines.join('\n') + '\n');
console.log(`ids reused: ${reused}, created: ${created}, total: ${raw.campaigns.length}`);
