# Car data model

Each model family is one file, `data/families/<family id>.json`. Manufacturers are in `data/manufacturers.json`.
Nothing is guessed: a value the sources do not state is left out, and the site prints "Not documented here".

## Rules

1. **Every fact has a source and a quote.** A fact is an object with `src` (a key of the family's `sources`) and
   `quote`: a short passage copied *exactly* from that source's text (as printed by
   `node scripts/research/text.mjs <url>`), which states the value. `node scripts/check-data.mjs` re-reads every source
   and rejects quotes that are not in it. Matching ignores case, spacing, dash/quote styles and thousands separators.
   Keep quotes short (one table row, a phrase or one sentence) and make sure they contain the number or name used.
2. **Wikipedia sources are permalinks**: `https://en.wikipedia.org/w/index.php?title=Audi_Q7&oldid=1376476779`
   (get one with `node scripts/research/text.mjs --permalink en "Audi Q7"`). Other languages are allowed (de, fr, ja…).
3. **Prefer manufacturer sources** (press releases, media sites, brochures, official specifications) for dates,
   dimensions, capacities and outputs; use reputable secondary sources (Wikipedia, established motoring press) to fill
   gaps. When sources conflict, record the manufacturer's figure and mention the conflict in `notes`.
4. **Markets are never merged.** Specifications carry `market` (see codes below). If a source gives a figure without a
   market, use `"unstated"`. A US-market figure and a European figure are two records, never one.
5. **Dates are distinct**: `revealed` (first public showing / announcement), `productionStart`/`productionEnd`
   (factory production), `salesStart`, and `modelYears` (a market's model-year designation, mainly North America).
   Dates are `"YYYY"`, `"YYYY-MM"` or `"YYYY-MM-DD"` — only as precise as the source.
6. **Units as stated by the source** (`mm` or `in`; `L` or `cu ft`; `kW`, `PS` or `hp`; `Nm` or `lb-ft`). The site converts
   for display and always shows the source unit. Cargo volume also records the measuring `standard` when stated
   (`VDA`, `SAE`, `ISO 3832`, else `"not stated"`).
7. **Stable ids.** Ids are lowercase `a-z0-9-`, never reused or changed once published. Items inside a generation
   (dimensions, powertrains, cargo, changes, revisions, body styles) have short ids unique within the generation
   (`d1`, `p4`, `c2`…); their global id is `<generation id>#<item id>`. Corrections in `data/overlay.json` refer to them.
8. **No opinions**: no driving impressions, reliability ratings, safety results, prices or running costs.

Market codes: `global`, `EU` (Europe), `UK`, `US`, `CA`, `NA` (North America, when the source says so), `MX`, `BR`,
`CN`, `JP`, `KR`, `IN`, `AU`, `NZ`, `RU`, `ZA`, `ME` (Middle East), `ASEAN`, `TW`, `unstated`.

Fuel values: `petrol`, `diesel`, `mild hybrid`, `hybrid`, `plug-in hybrid`, `electric`, `hydrogen`, `LPG`, `flex-fuel`.
Drivetrain values: `FWD`, `RWD`, `AWD` (any permanent or on-demand all-wheel/four-wheel drive), `4WD` (part-time with
low range) — keep the manufacturer's name (e.g. `quattro`, `xDrive`, `4MATIC`) in `system`.

## Family file

```jsonc
{
  "id": "audi-q7",                      // stable
  "slug": "q7",                         // URL: /cars/<manufacturer slug>/<slug>/
  "manufacturer": "audi",               // id in data/manufacturers.json
  "name": "Audi Q7",
  "lines": [                            // usually one; two when markets sell different cars under one family
    { "id": "q7", "name": "Q7" }
  ],
  "sources": {
    "wp": { "url": "https://en.wikipedia.org/w/index.php?title=Audi_Q7&oldid=1376476779", "title": "Audi Q7",
            "publisher": "Wikipedia", "type": "secondary", "accessed": "2026-10-09" },
    "am1": { "url": "https://www.audi-mediacenter.com/en/press-releases/…", "title": "The new Audi Q7",
             "publisher": "Audi MediaCenter", "type": "manufacturer", "date": "2015-01-12", "accessed": "2026-10-09" }
  },
  "generations": [ /* oldest first */ ]
}
```

`type` is `manufacturer` (press release, media site, brochure, official spec sheet), `press` (motoring
publication) or `secondary` (encyclopaedia, database).

## Generation

```jsonc
{
  "id": "audi-q7-4l",                   // <family id>-<slug>
  "slug": "4l",                         // generation code when one is documented, else e.g. "first-generation"
  "ordinal": 1,                         // per line
  "lines": ["q7"],
  "name": "First generation",
  "codes": [ { "value": "4L", "kind": "model code", "src": "wp", "quote": "Model code 4L" } ],
  "names": [ { "value": "Q7", "markets": ["global"], "src": "wp", "quote": "…" } ],   // market-specific names
  "dates": {
    "revealed":        { "value": "2005-09", "event": "Frankfurt Motor Show", "src": "wp", "quote": "unveiled in September 2005 at the Frankfurt Motor Show" },
    "productionStart": { "value": "2005-11", "src": "wp", "quote": "Production November 2005 – 2015" },
    "productionEnd":   { "value": "2015", "src": "wp", "quote": "Production November 2005 – 2015" },
    "salesStart":      [ { "value": "2006", "market": "EU", "src": "…", "quote": "…" } ],
    "modelYears":      [ { "market": "NA", "from": 2007, "to": 2015, "src": "wp", "quote": "2007–2015 (North America)" } ]
  },
  "ongoing": false,                     // true while in production (then omit productionEnd)
  "platform": { "value": "Volkswagen Group PL71", "src": "wp", "quote": "Platform Volkswagen Group PL71 platform" },
  "assembly": [ { "value": "Bratislava, Slovakia", "src": "wp", "quote": "Slovakia: Bratislava (Volkswagen Bratislava Plant)" } ],
  "bodyStyles": [ { "id": "b1", "value": "5-door SUV", "markets": ["global"], "src": "wp", "quote": "Body style 5-door SUV" } ],
  "seating": { "options": [5, 7], "src": "…", "quote": "…" },   // all documented configurations
  "drivetrains": [ { "value": "AWD", "system": "quattro", "markets": ["global"], "src": "wp", "quote": "four-wheel-drive (quattro)" } ],
  "dimensions": [
    { "id": "d1", "market": "unstated", "version": "pre-facelift", "unit": "mm",
      "length": 5085, "width": 1984, "height": 1737, "wheelbase": 3002,     // any subset
      "src": "wp", "quotes": ["Wheelbase 3,002 mm", "Length 5,085 mm", "Width 1,984 mm", "Height 1,737 mm"] }
  ],
  "cargo": [
    { "id": "k1", "market": "EU", "version": "7-seat", "behind": "3rd row", "value": 330, "unit": "L",
      "standard": "VDA", "src": "…", "quote": "…" }       // behind: "3rd row" | "2nd row" | "1st row" (max) | "unstated"
  ],
  "powertrains": [
    { "id": "p1", "name": "3.0 TDI", "market": "EU", "fuel": "diesel", "years": "2006–2015",
      "engine": "3.0 L V6 turbo-diesel", "displacement": 2967, "cylinders": 6,
      "power": { "value": 171, "unit": "kW" }, "torque": { "value": 500, "unit": "Nm" },
      "transmission": "6-speed automatic", "drivetrain": "AWD",
      "src": "…", "quotes": ["…"] }                       // only the fields the quotes support
  ],
  "changes": [                          // what changed compared with the previous generation (omit for the first)
    { "id": "c1", "topic": "dimensions", "text": "Up to 325 kg lighter than the previous model.", "src": "am1", "quote": "…" }
  ],                                    // optional "vs": "<predecessor generation id>" when a generation has two predecessors
                                        // topic: design | dimensions | weight | powertrain | drivetrain | chassis | interior | technology | safety-equipment | other
  "revisions": [
    { "id": "r1", "slug": "2009-facelift", "kind": "facelift",        // facelift | update | rename | special
      "name": "Facelift",
      "dates": { "revealed": { … }, "productionStart": { … } },
      "names": [ … ],                    // only if the name changed (e.g. M-Class → GLE)
      "changes": [ { "id": "c1", "topic": "design", "text": "…", "src": "…", "quote": "…" } ] }
  ],
  "commons": {                           // Wikimedia Commons categories, checked to exist and to show this car
    "generation": "Category:Audi Q7 (4L)",
    "original": "Category:…",           // optional: the version before the first facelift
    "revisions": { "r1": "Category:Audi Q7 (4L) facelift" },
    "bodyStyles": { "b2": "Category:…" }
  },
  "notes": [ "Conflicts, gaps, market caveats — shown to readers when relevant." ]
}
```

`text` in `changes` is our own short neutral wording of what the quote says; it must not add anything the quote does
not support. Every array may be empty; every field except `id`, `slug`, `ordinal`, `lines` and `name` is optional.

## Images

Images are added by `scripts/research/images.mjs` from the Commons categories above and stored as
`generation.images[]`: `{ id, file, src, width, height, revision, bodyStyle, view, representative, author, license,
licenseUrl, page, evidence }`. `evidence` records the Commons category (and file description) that ties the photo to the
generation/revision; `representative: true` marks a photo that only shows the generation in general (for example the
wrong market's bumper), and the page labels it.

## Overlay

`data/overlay.json` holds reviewed corrections applied on top of the family files at build time, so they survive
re-imports: `{ "op": "set", "target": "<generation id>[#<item id>]", "field": "length", "value": 5063, "src": {…}, "quote": "…" }`,
`{ "op": "add", "target": "<generation id>", "list": "powertrains", "item": {…} }`, `{ "op": "remove", "target": "<generation id>#<item id>" }`.
