# Image coverage: current results

State of branch `claude/female-models-database-uwbimc` after commit "Apply reviewed batch gfirst-b1" (2026-10-08).
This is the only current set of figures; earlier reports are in `REPORT_HISTORY.md`. Nothing is on `main` or deployed.

Review pages (private): batch evidence and before/after https://claude.ai/artifact/UFvRCTJxc4VvQDpc65bNmF ·
working preview of the site code on a 21-model subset https://claude.ai/artifact/4Q1uf8CeU2bXsg4BxrSdaJ .
Contact sheet in the repo: `results/gfirst-b1_review.html`.

## 1. Rules in force

- **Attribution.** A photo is shown as a particular model only when its own caption or alt text names her (automated),
  or a person records it in `results/review_attributions.json` (human review; none yet). A page about one model, a file
  name (also when copied into the alt), a page title, a search-result title, or alt text repeated across a gallery does
  not attribute. Uncertain identities stay unassigned.
- **Galleries.** A photo verified to belong to a campaign but naming no credited model stays on the campaign as
  "Campaign photos — models not identified individually". It is never shown as a photo of a particular model.
- **Portraits.** Where a credit has no photo of the model, the site shows her Wikimedia portrait labelled "Model portrait".
- **Periods.** A headline/body season conflict makes the page a candidate only; a publication date supports but never
  settles it. Photos come only from a page that states the campaign's season and year without conflict.
- **Visual review** checks content type only (campaign picture, not an event, backstage, product, lookbook, other line).
  No one is identified from appearance.

## 2. Coverage audit (`results/audit.json`)

10,540 credits. "Identified" = issue, show or campaign pinned down (season, named campaign, or verified page);
"dated" = year only; "undated" = a relationship without a date. Each credit is counted once, by its best picture.

| Credits | photo attributed by human review | photo whose own caption names the model (automated) | campaign gallery only (models not identified individually) | portrait/press fallback only | no picture | Total |
|---|---:|---:|---:|---:|---:|---:|
| Identified | 0 | 308 | 730 | 749 | 256 | 2,043 |
| Dated | 0 | 140 | 453 | 892 | 292 | 1,777 |
| Undated | 0 | 209 | 384 | 5,003 | 1,124 | 6,720 |
| **All** | 0 | 657 | 1,567 | 6,644 | 1,672 | 10,540 |

Photo placements in the data: 4,159, of which 804 are attributed to a credited model by caption and 0 by human review.
2,224 credits carry at least one photo.

Why dated or identified credits have no model-specific photo (primary reason per credit):

| Reason | Credits |
|---|---:|
| no relevant search results | 1,509 |
| relevant result, inaccessible source | 737 |
| not searched yet | 633 |
| rejected: campaign/identity not confirmed | 422 |
| accessible source, image extraction failed | 71 |

Rendering: 5,385 image references, 5,382 local files decode, 3 remote Wikimedia
portraits; no problems.

## 3. Attribution recheck of earlier photos

Every published photo that carried a model tag (3,211) was checked against its source page; the picture was matched to
the stored file by original URL or perceptual hash. Decisions with the supporting caption:
`results/attribution_recheck.json`.

| Outcome | Photos |
|---|---:|
| Tag kept: the picture's own caption or alt text names the model | 779 |
| No captioned picture of her on the source page | 1,620 |
| A captioned picture exists, but it is a different picture | 429 |
| Only a file name named her | 115 |
| Source page unreadable now, or never recorded | 268 |

No photo was deleted: untagged photos remain on their campaigns as galleries.

## 4. Trial: 50 dated campaigns (after visual review)

| | Brave | Google Images | Combined |
|---|---:|---:|---:|
| Verified galleries | 11 | 13 | 13 |
| Photos kept | 56 | 69 | 89 |
| Photos attributed, automated | 1 | 1 | 2 |
| Photos attributed, human review | 0 | 0 | 0 |
| Credited models newly illustrated | 1 | 1 | 2 |

The trial galleries are not applied.

## 5. Batch `gfirst-b1`: 100 campaigns, applied on this branch

Selection: dated campaigns where no credited model had a model-specific photo; tier 1 (45) already confirmed by a cited or
earlier-verified page, tier 2 (55) season known with a non-Wikipedia press source; at most two per label.
Order: cited sources and earlier results, then Google Images (SerpApi), then Brave web only where nothing was verified.

**Units.** These figures count different things:

| Unit | What it counts | Value |
|---|---|---:|
| Campaign | one label + season + year (a group of credits) | 100 selected, holding 107 credits |
| Verified gallery | a campaign with at least one accepted photo after review | **83** (89 credits) |
| … adding nothing new | every accepted photo was already on the site as an untagged gallery photo | 19 |
| … adding photos | | 64 |
| Credit changed | one model's line on one campaign that receives at least one new photo | **70** |
| Placement | one photo on one credit (a gallery photo is placed on each credit of its campaign) | **442** (393 distinct new files) |
| Newly illustrated model credit | a credit whose model is named in an accepted photo's own caption | **19** (25 photos) |

The 19 model credits are a subset of the 70 changed credits; the other 51 changed credits gain campaign galleries only,
which are not counted as model photos.

**Review.** 626 pictures reviewed, 57 rejected (reasons per picture: `results/gfirst-b1.visual_review.json`).
569 photos kept, 175 of them already on the site.

**Usage and cost** (checked against the SerpApi account):

| | Value |
|---|---:|
| SerpApi HTTP requests | 83 (15 were 503 retries, not billed) |
| SerpApi searches billed (account 921 → 853 this month) | 68 of a 200 cap |
| Brave requests | 18 ($0.09 of a $1 cap) |
| Value used (68 × $0.025 of the Starter plan + Brave) | $1.79 |
| Per verified gallery | $0.022 |
| Per newly illustrated model credit | $0.094 |

## 6. Validation of this branch

- Unit tests (25) pass; `python3 -m pipeline validate` reports no problems.
- Chromium, desktop (1280 px) and phone (390 px): home, labels, models and years indexes, 3 label pages, a year page and
  24 model pages (32 routes per size), 639 images, 0 broken, no horizontal scrolling, no script errors. 24/24 "Campaign
  photos" links open the lightbox, page forward and close; 22/22 model photos open with the model named in the caption.
- All 25 caption-attributed batch photos appear on their model's page (19 credits).
- Applying the batch changed only image lists (70 records, no other field). Revert commit "Apply reviewed batch gfirst-b1"
  to undo it.

## 7. Next phase

Improve attribution for galleries already collected before collecting more photos: look for each gallery picture's own
caption, alt or credit line on its source page and on independent pages carrying the same picture (matched by perceptual
hash), and record human attributions in `results/review_attributions.json`. Keep identities unassigned when no
image-specific evidence exists.
