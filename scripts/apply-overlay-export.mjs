#!/usr/bin/env node
// Appends approved community changes (the JSON from the admin page's "Export approved changes") to data/overlay.json,
// after checking each entry against the current data. Commit the result; the next deploy publishes it.
//   node scripts/apply-overlay-export.mjs export.json
import fs from 'node:fs';
import path from 'node:path';
import { applyOverlay } from '../site/lib.mjs';

const exp = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const overlay = JSON.parse(fs.readFileSync('data/overlay.json', 'utf8'));
const raw = fs.readdirSync('data/families').filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join('data/families', f), 'utf8')));
const have = new Set((overlay.entries || []).map(e => e.submission).filter(Boolean));
const add = (exp.entries || []).filter(e => !have.has(e.submission));
const next = { ...overlay, entries: [...(overlay.entries || []), ...add.map(e => ({ ...e, approved: new Date().toISOString().slice(0, 10) }))] };
applyOverlay(raw, next); // throws if an entry refers to a missing family, generation or item
fs.writeFileSync('data/overlay.json', JSON.stringify(next, null, 2) + '\n');
console.log('Next: node scripts/check-data.mjs (verifies the quotes of added facts) and npm run build.');
console.log(`added ${add.length} entries (${(exp.entries || []).length - add.length} already present); overlay now has ${next.entries.length}`);
