# The Model Archive (brandsmodels.com)

A sourced visual reference for female models' careers: documented campaigns, runway shows, magazine covers and
ambassadorships, by year, with every entry linked to its source.

- **Archive pages** are plain HTML generated from `data/campaigns.json` at deploy time. Every model, label, magazine and
  year page is complete without JavaScript and has its own URL, title, description and canonical link.
- **Visitor features** (favourites, saved appearances, suggestions) are small additions in plain JavaScript and a
  Cloudflare Worker with a D1 database. The archive keeps working when they are unavailable.

## Layout

| Path | What it is |
|---|---|
| `data/campaigns.json` | **The archive.** One credit per line; each credit has a persistent `id`. |
| `data/overlay.json` | Curated additions and corrections applied on top of the archive at build time. Kept across imports. |
| `assets/` | Campaign photos, press photos and portraits referenced by the data. |
| `site/lib.mjs` | Data rules shared by the build, the browser and the tests (appearance types, de-duplication, rankings, overlay). |
| `site/render.mjs` | HTML for every page. |
| `site/client.js` | Browser enhancements: photo viewer, timeline filters, favourites, saved appearances, search, ranking selector, forms. |
| `styles.css` | All styling. |
| `scripts/build.mjs` | Builds the public site into `public/` (the only folder that is served). |
| `scripts/assign-ids.mjs` | Gives new credits ids, reusing previous ids after an import. |
| `scripts/apply-overlay-export.mjs` | Adds approved community changes to `data/overlay.json`. |
| `worker/` | The Worker: `/api/*` (favourites, fan favourites, suggestions, admin) and `/admin`. Everything else is static. |
| `migrations/` | D1 schema. |
| `tests/` | `npm test`: data rules, the built HTML, and the API against SQLite. |
| `pipeline/` | The image-recovery pipeline (Python). Not deployed. See `pipeline/README.md`. |

URLs: `/model/<name>/`, `/model/<name>/<label>/` (only with ≥3 dated appearances, one identified),
`/model/<name>/covers/` (≥3 dated covers), `/brand/<label>/`, `/magazine/<title>/`, `/year/<yyyy>/`, `/models/`,
`/brands/`, `/magazines/`, `/years/`, `/most-featured/`, `/fan-favourites/`, `/favourites/`, `/suggest/`, `/search/`.
Old `#/model/...`-style links redirect in the browser; old `/brand/<magazine>/` paths redirect with a 301.

## Rules the pages follow

- **Appearance types.** *Identified appearance*: the campaign, show or issue is pinned down (season, named campaign,
  issue month, a source that states the year, or a verified photo naming her). *Dated relationship*: a year only — a
  year alone never establishes a specific campaign. *Undated relationship*: no year.
- **Photos.** A photo is shown as a particular model only when its own caption or alt text names her (see
  `pipeline/results/REPORT.md`) or a person confirmed it. The campaign's other photos stay behind
  "Other campaign photos", and the viewer shows each photo's own attribution. Portraits and press photos are labelled.
- **Earliest documented appearance in this archive** is the earliest dated record here, not necessarily the start of a career.
- **Most featured** counts distinct documented appearances (one model, label, kind, year and season family). Several
  records or photos of one appearance count once; a dated relationship counts once per label, kind and year and only
  when no identified appearance covers it; undated relationships are excluded. It reflects the archive's coverage.
- **Fan favourites** count browsers that hold a favourite (all time) or added it in the last 30 days, minimum 3, at most
  20 counted browsers per network per day. Anonymous, not one-person-one-vote. Never combined with Most featured.
- **Indexing.** Model and label pages with no dated appearance and no photo are `noindex` and left out of the sitemap;
  search, favourites and suggestion pages are `noindex`. Structured data: `Person` (name, Wikipedia link, portrait —
  all visible on the page), `BreadcrumbList`, `WebSite` search. No ratings or reviews.

## Local development

```
npm install                 # wrangler (pinned)
cp .dev.vars.example .dev.vars   # local-only admin token and salt
npm run dev                 # builds public/, applies migrations to a local D1, serves http://localhost:8787
npm test                    # data rules, built HTML, API (Node 22+, uses node:sqlite)
```

The local admin page is `http://localhost:8787/admin` with the token from `.dev.vars`.
`npm run build` alone builds `public/` (about 4 s); `python3 -m pipeline validate` still checks every image reference.

## Archive updates (quarterly)

1. Replace `data/campaigns.json` with the new export (keep the previous file).
2. `node scripts/assign-ids.mjs --previous previous-campaigns.json` — existing credits keep their ids; new ones get new ids.
3. `npm run build` — the build fails if an overlay entry points to an id that no longer exists, or if any credit lacks an id.
   Fix the overlay entry (or the import) before deploying.
4. `npm test`, then commit and push.

`data/overlay.json` is never overwritten by imports. Its entries (`add`, `patch`, `remove`, `rename-model`) are applied in order.
Favourites refer to model slugs and saved appearances to credit ids, so both survive refreshes; a renamed model gets a
`rename-model` entry, which also redirects her old URL.

## Community contributions

1. Visitors send a suggestion or correction with a source link (`/suggest/`). It is stored in D1, private, never published automatically. Links are validated but never fetched.
2. A reviewer opens `/admin`, checks the source, edits the proposed overlay entry if needed, and approves or rejects.
3. "Export approved changes" gives JSON; save it and run `node scripts/apply-overlay-export.mjs export.json`, review
   the diff of `data/overlay.json`, commit and push. The next deploy publishes it. Then "Mark these as exported".

## Cloudflare setup (one time)

The Worker already serves brandsmodels.com. This version adds a D1 database and secrets:

```
npx wrangler d1 create brandsmodels           # copy the database_id into wrangler.jsonc
npx wrangler d1 migrations apply brandsmodels --remote
npx wrangler secret put ADMIN_TOKEN           # a long random string (e.g. openssl rand -hex 32)
npx wrangler secret put HASH_SALT             # another long random string
```

- Workers Builds: keep the build command empty and the deploy command `npx wrangler deploy`; wrangler runs
  `node scripts/build.mjs` itself (see `wrangler.jsonc` → `build`). The build needs Node 20+.
- Until the D1 id is set, a deploy fails rather than shipping a broken API (the placeholder id is intentional).
- Recommended: put `/admin*` and `/api/admin/*` behind Cloudflare Access (free for small teams) in addition to the token.
- Optional: Turnstile on suggestions — set `TURNSTILE_SECRET` and add the widget to `/suggest/`.

## Measuring use without paid services

- **Cloudflare Web Analytics** (free, cookieless): page views, top pages, referrers (search engines), and visits.
  Enable it for the zone in the dashboard; no code change is needed with automatic setup.
- **Google Search Console** and **Bing Webmaster Tools**: submit `https://brandsmodels.com/sitemap.xml`; they report
  search queries, impressions, clicks and indexed pages — the direct measure of search traffic.
- **Returning visitors**: Web Analytics shows visits per period; for a privacy-friendly proxy, compare the number of
  browsers holding favourites over time (below) — no extra tracking is needed.
- **Favourites**: `npx wrangler d1 execute brandsmodels --remote --command "SELECT COUNT(*) favourites, COUNT(DISTINCT visitor_hash) browsers, COUNT(DISTINCT model) models FROM favourites"`
  and `... "SELECT date(created_at/1000,'unixepoch') d, COUNT(*) FROM favourites GROUP BY d ORDER BY d DESC LIMIT 30"`.
