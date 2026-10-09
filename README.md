# The Car Archive

A sourced visual reference to car model families, generations, facelifts and model years: what changed between
generations, compared like for like, with every figure linked to its source and labelled by market.
("The Car Archive" is a provisional name; the site is currently served at brandsmodels.com and the final domain is undecided.)

- **Pages** are plain HTML generated at deploy time from `data/`. Every manufacturer, model family, generation,
  consecutive-generation comparison and year page is complete without JavaScript, with its own URL, title,
  description and canonical link.
- **Visitor features** (Dream garage, comparison tool, search, suggestions) are small additions in plain JavaScript and
  a Cloudflare Worker with a D1 database. The archive keeps working when they are unavailable.

The previous website at this address (a fashion archive) is preserved in git history — `main` at `668ba93` and the
unmerged `claude/archive-product-phase` at `43e78f9` — and none of its content or images is part of this build.

## Layout

| Path | What it is |
|---|---|
| `data/SCHEMA.md` | **The data model and sourcing rules.** Read this first. |
| `data/manufacturers.json` | Manufacturers. |
| `data/families/<id>.json` | One file per model family: lines, generations, revisions, specifications, sources. |
| `data/images.json` | Photos chosen from Wikimedia Commons, keyed by generation, with author, licence and evidence. |
| `data/overlay.json` | Reviewed corrections applied on top of the family files at build time; kept across data updates. |
| `assets/cars/` | The photos (1600 px and 640 px). |
| `site/lib.mjs` | Data rules shared by the build, the browser and the tests (dates, units, like-for-like comparison, overlay). |
| `site/render.mjs` | HTML for every page; also used in the browser for the comparison table. |
| `site/client.js` | Photo viewer, filters, comparison tool, Dream garage, search, popularity list, suggestion form. |
| `styles.css` | All styling. |
| `scripts/build.mjs` | Builds the public site into `public/` (the only folder that is served). |
| `scripts/check-data.mjs` | Validates the data and re-reads every source to confirm each quoted fact. |
| `scripts/research/` | Research tools (source text, Commons photos). Not deployed. |
| `research/` | Research notes and photo decisions. `research/cache/` is local only (git-ignored). Not deployed. |
| `worker/` | The Worker: `/api/*` (garage counts, suggestions, admin) and `/admin`. Everything else is static. |
| `migrations/` | D1 schema. |
| `tests/` | `npm test`: data rules, the built HTML, and the API against SQLite. |

## URLs

`/manufacturers/`, `/manufacturers/<make>/`, `/cars/` (all generations, with filters), `/cars/<make>/<family>/`,
`/cars/<make>/<family>/<generation>/`, `/cars/<make>/<family>/compare/<a>-vs-<b>/` (consecutive generations only),
`/compare/` (any three), `/years/`, `/years/<yyyy>/` (only years with a documented event), `/search/`, `/garage/`,
`/popular/`, `/suggest/`, `/about/`, `/credits/`, `/privacy/`.
Search, garage and suggestion pages are `noindex`. Addresses of the earlier fashion site are not redirected; they 404.

## Rules the data and pages follow

- **Every fact is sourced and checked.** Each fact records its source and a short quote; `npm run check-data` re-reads
  every source (Wikipedia by exact revision) and fails if a quote is missing or does not contain the value used.
- **Manufacturer sources first**, then reference works and the motoring press.
- **Markets are never merged.** Dimensions, capacities and powertrains carry their market. Comparisons show dimensions
  side by side only when every generation has figures for the same market and standard body; otherwise they say so.
- **Dates are distinct**: first shown (reveal), production start/end, sales start, model years by market. The timeline
  and year pages use production years; model years are listed separately.
- **Units** are shown as the source states them with conversions in brackets; luggage volumes keep their measuring
  method (VDA vs SAE), which are not comparable.
- **Photos** come from Commons categories for the specific generation, facelift or body style and are checked by eye;
  photos that only show the generation in general are labelled "Representative image". Author and licence are shown
  with every photo and on `/credits/`.
- **No opinions**: no driving impressions, reliability or safety ratings, prices or running costs. Structured data:
  `BreadcrumbList`, `WebSite` search and `Car` (only fields visible on the page). No ratings, reviews or offers.

## Local development

```
npm install                      # wrangler (pinned)
cp .dev.vars.example .dev.vars   # local-only admin token and salt
npm run dev                      # builds public/, applies migrations to a local D1, serves http://localhost:8787
npm test                         # data rules, built HTML, API (Node 22+, uses node:sqlite)
npm run check-data               # verifies every quoted fact against its source (needs network; cached in research/cache/)
```

The local admin page is `http://localhost:8787/admin` with the token from `.dev.vars`.
`SITE_URL=https://example.com npm run build` builds with another public base URL.

## Updating the data

1. Edit or add `data/families/<id>.json` following `data/SCHEMA.md`. Research helpers:
   `node scripts/research/text.mjs --permalink en "<article>"`, `node scripts/research/text.mjs <url> --find "<quote>"`.
2. `npm run check-data` must report 0 errors.
3. Photos: add Commons categories to the generation (`commons`), run `node scripts/research/images.mjs candidates <family id>`,
   look at the contact sheets in `research/cache/images/sheets/`, record choices in `research/image-decisions.json`,
   then `node scripts/research/images.mjs apply`.
4. `npm test`, commit, push. Ids never change once published; `data/overlay.json` is never overwritten.

## Community suggestions

1. Visitors send "Suggest a car", "Suggest a source or photo" or "Report a correction" (`/suggest/`). Links only, no
   uploads. Stored privately in D1 (`car_submissions`), never published automatically; links are never fetched.
2. A reviewer opens `/admin`, checks the source, and either completes the proposed overlay entry and approves it,
   approves the suggestion as a lead (research needed, no data change), or rejects it.
3. "Export approved changes" gives JSON: save it and run `node scripts/apply-overlay-export.mjs export.json`, then
   `npm run check-data`, review the diff of `data/overlay.json`, commit and push. Then "Mark these as exported".

## Cloudflare setup

The Worker and the D1 database `brandsmodels` already exist (the database id is in `wrangler.jsonc`).

```
npx wrangler d1 migrations apply brandsmodels --remote   # adds the car_* tables (0002); earlier tables are untouched
npx wrangler secret put ADMIN_TOKEN                      # a long random string (e.g. openssl rand -hex 32)
npx wrangler secret put HASH_SALT                        # another long random string
```

Or in the dashboard: run `migrations/0002_car_archive.sql` in the D1 console, and after the first deploy of this
version add the two secrets under Workers & Pages → brandsmodels → Settings → Variables and Secrets (the dashboard
only accepts secrets once the Worker has a script). Until `HASH_SALT` is set the public API answers 503 and stores
nothing; until `ADMIN_TOKEN` is set the admin is off. The pages work throughout.

- **Domain:** set the final address in `site.config.json` (`url`) or as the `SITE_URL` build variable in Workers Builds;
  add the custom domain to the Worker in the dashboard.
- Workers Builds: keep the deploy command `npx wrangler deploy`; wrangler runs `node scripts/build.mjs` itself. Node 20+.
- Recommended: put `/admin*` and `/api/admin/*` behind Cloudflare Access (free for small teams) in addition to the token.
- Optional: Turnstile on suggestions — set `TURNSTILE_SECRET` and add the widget to `/suggest/`.

## Measuring use without paid services

- **Cloudflare Web Analytics** (free, cookieless): page views, top pages, referrers. Enable it for the site in the dashboard.
- **Google Search Console** and **Bing Webmaster Tools**: submit `<site url>/sitemap.xml` for search queries and indexing.
- **Dream garage**: `npx wrangler d1 execute brandsmodels --remote --command "SELECT item, COUNT(*) FROM car_garage WHERE counted = 1 GROUP BY item ORDER BY 2 DESC LIMIT 20"`.
