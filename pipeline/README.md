# Image pipeline

Finds, verifies and stores photos for the credits in `data/campaigns.json`. It runs offline from the
site: nothing in `pipeline/` is deployed (see `.assetsignore`), and no key reaches the frontend.

```
python3 -m pipeline audit                       # coverage + why each dated credit lacks a photo -> results/audit.json
python3 -m pipeline batch --run NAME [...]      # process campaign groups (cached, resumable, budgeted)
python3 -m pipeline trial --n 50 --budget 5     # controlled comparison on 50 dated campaigns (Brave arm)
python3 -m pipeline trial --google --plans free,starter   # Google Images arm on the same 50, <= 50 searches from the plan's allowance
python3 -m pipeline compare                     # Brave vs Google on the trial, contact sheet of Google-only finds
python3 -m unittest discover -s pipeline/tests -t .   # regression checks for verification mistakes found in review
python3 -m pipeline sheet --run NAME            # contact sheets of accepted photos for visual review
python3 -m pipeline apply --run NAME [--reject results/review_rejected.txt] [--dry-run]
python3 -m pipeline general [--dry-run]         # re-check photos/dates on undated relationships
python3 -m pipeline validate                    # every referenced image exists, decodes, is deployable
```

## How a group is processed

1. **Groups.** Credits are grouped by brand, kind, year, season family (SS / FW / Holiday / Resort /
   Pre-fall) and campaign title (`groups.py`). One group is searched once; all its models share the
   discovered pages.
2. **Free stages first.** The group's cited source URLs, then pages found by earlier search runs
   (`legacy/`). Paid search runs only if these do not cover the group.
3. **Paid stages** (only with `--providers` naming them and `--budget` > 0):
   campaign-first Brave web, then Brave images, then model-first Brave web, then Google Images via
   SerpApi. Each stage stops once every one of the group's first three models has a photo, or the
   group has six photos.
4. **Extraction** (`extract.py`): the article body only, without related/recommended/sidebar/ad
   blocks. It reads `srcset`, lazy-load attributes (`data-src`, `data-orig-file`, …), `<noscript>`
   images, `<picture>` sources, links to full-size image files and JSON-LD `ImageObject`s.
5. **Verification** (`verify.py`): the page must name the label and the kind (campaign / runway /
   cover / ambassador). It must also state the same year and a compatible season (`seasons.py`
   understands FW15, A/W 2013, Fall/Winter 2015-16, Spring '16, …) in the title or near the label.
   Year ±1 or a matching publication date only makes a **candidate**, which is never accepted.
   Images naming another label or another season are dropped.
6. **Attribution.** An image is tagged with a model only when its alt text, caption or file name
   names her, or the article is about that model alone. Otherwise it is stored with `talent: []`. The
   site then shows it as "campaign photos, models not identified individually", never as her photo.
7. **Storage** (`images.py`): at least 400×300; resized to 720×900 JPEG in `assets/photos`;
   perceptual-hash dedupe against every stored photo. Evidence for every accepted photo (page URL,
   image URL, matched title and season, models named) goes to `results/evidence.json` on apply.

## Caching, cost and resuming

- `cache/search.sqlite` (committed): every paid response, keyed by provider and query. An
  identical query is never paid for twice, by any run.
- `cache/pages.sqlite` (not committed): fetched pages, robots.txt, image fetch outcomes and photo
  hashes.
- Results per run are stored as each group finishes. Re-running the same `--run` skips completed
  groups. `--redo` re-processes them, using caches.
- `--dry-run` makes no paid request and downloads nothing new. It replays cached responses and prints
  the uncached queries and the worst-case cost.
- A run stops issuing paid requests when `--budget` (US$) is reached. Prices are in `config.PRICE`.

Example of a capped, resumable batch:

```
python3 -m pipeline batch --run camp-2026-10 --providers sources,legacy,brave_web,brave_images \
    --kinds campaign,ambassador --budget 10 --dry-run      # see what it would cost
python3 -m pipeline batch --run camp-2026-10 --providers sources,legacy,brave_web,brave_images \
    --kinds campaign,ambassador --budget 10                # run; re-run the same line to resume
python3 -m pipeline sheet --run camp-2026-10              # review; list bad files in results/review_rejected.txt
python3 -m pipeline apply --run camp-2026-10 --reject pipeline/results/review_rejected.txt
python3 -m pipeline validate
```

## Keys

Keys are read from the environment only and never written to the repository or the site.

- **Brave Search API:** the session proxy injects the subscription token for `api.search.brave.com`.
  Elsewhere, set `BRAVE_API_KEY`.
- **SerpApi (Google Images):** create an account at serpapi.com and set
  `SERPAPI_API_KEY=...` in the environment. In Claude Code on the web, add it under the
  environment's secrets. The free plan has 250 searches a month; Starter is $25 a month for 1,000.
  Only successful searches are billed. Without the variable the adapter is skipped. `trial --google` reads the
  account first (not billed) and refuses to run unless the plan is in `--plans` and this month's plan still includes
  the searches, so it never causes overage or an early renewal.

## Access and permission

Pages and images are fetched with an honest user agent. Each page and image host's robots.txt is
checked for ClaudeBot, Claude-User and anthropic-ai, and sites that forbid it are recorded as
`blocked`. Hosts that never allow reuse (Instagram, Facebook, Pinterest, Getty, Shutterstock,
models.com, …) are never fetched. Finding an image in search results does not give permission to
download or republish it. Every stored photo keeps its source page so it can be credited or
removed.
