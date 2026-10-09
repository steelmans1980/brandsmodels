// Turns the reviewer's index-based picks (research/image-picks.json, indexes as printed on the contact sheets) into
// research/image-decisions.json keyed by Commons file name, which scripts/research/images.mjs apply reads.
import fs from 'node:fs';
const cand = JSON.parse(fs.readFileSync('research/cache/images/candidates.json', 'utf8'));
const picks = JSON.parse(fs.readFileSync('research/image-picks.json', 'utf8'));
const out = { _about: 'Generated from research/image-picks.json; edit the picks file, not this one.' };
for (const [gid, list] of Object.entries(picks)) {
  if (gid.startsWith('_')) continue;
  out[gid] = list.map(([i, d]) => {
    const c = cand[gid]?.[i];
    if (!c) throw new Error(`${gid}: no candidate ${i}`);
    return { file: c.file, ...d };
  });
}
fs.writeFileSync('research/image-decisions.json', JSON.stringify(out, null, 1) + '\n');
console.log(Object.keys(out).length - 1, 'generations');
