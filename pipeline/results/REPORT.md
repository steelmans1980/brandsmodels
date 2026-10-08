# Image coverage: attribution fix, recheck and Google-first batch (updated 2026-10-08)

This section supersedes the attribution figures below; the earlier sections are kept as history.
Nothing is pushed to `main` or deployed. The batch photos are candidates only (`pipeline/candidates/photos`, not deployed).

## A. Attribution rule (what changed)

A photo is now attributed to a model only when **its own caption or alt text names her**, or a person records it in
`results/review_attributions.json` (empty so far: no human attributions yet). Removed as attribution sources:
- "the article is about this model alone" (the Seafolly failure: four pictures of other models tagged as her);
- file names, and file names copied into the alt ("irina-shayk-bebe-…-campaign0", "Rose saint laurent fall 2026 campaign02");
- the page title, which was copied onto the page's og:image as if it were its caption;
- search-result titles, which were passed in as alt text for pictures suggested by a search;
- alt text repeated on three or more pictures of a page, or equal to the headline (gallery boilerplate).

Visual review checks content type only (campaign picture or not: events, backstage, products, lookbooks, other lines). No
one is identified from appearance.

**Season conflicts:** a headline/body conflict is no longer settled by the publication date. The page stays a candidate
and contributes no photos; a campaign is illustrated only from a page that states its season without conflict. No published
photo had relied on the old rule. (Celine Winter 2026 is now supported by theimpression.com, not the conflicting page.)

## B. Recheck of published photos

All 3,211 published photos that carried a model tag were rechecked against their source page (matched by original URL or
perceptual hash; robots.txt respected). 2,767 of them had been tagged only because the credit names one model.

| Outcome | Photos |
|---|---:|
| Tag kept: the picture's own caption or alt text names the model | **779** |
| No captioned picture of her on the source page | 1,620 |
| A captioned picture exists, but it is a different picture | 429 |
| Only a file name named her | 115 |
| Source page unreadable now (404, 202 holding page, blocked, …) or not recorded | 268 |

Removed tags leave the photo on its campaign as "models not identified individually"; the site then shows it under
"Campaign photos" rather than as her photo. Only image tags changed in `data/campaigns.json` (10,540 records, same order,
no other field touched). Per-photo decisions with the supporting caption: `results/attribution_recheck.json`.

## C. Trial (50 campaigns), final after visual review

Both arms re-scored under the new rules from cached searches ($0). 9 further pictures rejected visually.

| | Brave | Google Images | Combined |
|---|---:|---:|---:|
| Verified galleries | 11 | 13 | 13 |
| Photos kept | 56 | 69 | 89 |
| Photos attributed, automated (caption) | 1 | 1 | 2 |
| Photos attributed, human review | 0 | 0 | 0 |
| Credited models newly illustrated | 1 (Hanni, UGG 2024) | 1 (Eva Herzigová, Armani 2016) | 2 |

## D. Google-first batch `gfirst-b1` (100 campaigns)

**Selection** (`results/gfirst-b1_selection.json`): dated campaigns where no credited model had a model-specific photo,
not dated from a photo page, at most two per label. Tier 1 (45): a cited or earlier-verified page already confirms label,
period and credited model. Tier 2 (55): season known and a press source other than Wikipedia.

**Order:** cited sources and earlier results → Google Images (SerpApi) → Brave web only where nothing was verified.

**Usage, checked against the SerpApi account:**

| | Value |
|---|---:|
| SerpApi HTTP requests | 83 |
| of which 503 retries (not billed) | 15 |
| Searches that could be billed | 68 |
| **Billed per account** (921 → 853 left this month) | **68** (cap 200) |
| Brave requests | 18 ($0.09, cap $1) |
| Value used (68 × $0.025 of the Starter plan + Brave) | **$1.79** |

No upgrade, no extra charge; 853 searches remain this month. Replays for this report used the cache only (0 requests).

**Results after visual review** (626 pictures reviewed, 57 rejected: events and red carpet, a runway show, backstage,
lookbooks and catalogues, a model-profile page's runway/cover/portrait pictures, products, logos and placeholders, collages,
Tom Ford Eyewear; reasons per picture in `results/gfirst-b1.visual_review.json`):

| | Count |
|---|---:|
| Campaigns with a verified gallery | **83 / 100** (tier 1: 32, tier 2: 51) |
| … where no photo identifies a credited model (gallery only) | 66 |
| Photos kept | 569 (394 not yet on the site) |
| Photos attributed to a credited model: automated (caption/alt) | 25 |
| Photos attributed to a credited model: human review | 0 |
| **Model credits newly illustrated** | **19** |
| Cost per verified gallery | $0.022 |
| **Cost per newly illustrated model credit** | **$0.094** |

A gallery whose models are not identified individually is not counted as a model photo. Most galleries came from cited
sources (free); Google Images found 16 and Brave 4.

**Not applied yet.** `python3 -m pipeline apply --run gfirst-b1 --reject pipeline/results/review_rejected.txt` would add
442 photo placements to 70 credits (dry run). Contact sheet with model, campaign, caption evidence, period evidence and
source for every picture: `results/gfirst-b1_review.html`.

## E. Validation

- 25 unit tests pass (attribution, boilerplate, file-name alts, conflicts).
- `python3 -m pipeline validate`: every image reference resolves and decodes; no problems.
- Browser (Chromium): home + 12 model pages, 367 images, 0 broken, 156 "Campaign photos" links, viewer opens, no JS errors.
- 91 unreviewed trial downloads moved out of `assets/photos` into `pipeline/candidates/photos`. (`main` separately
  holds 602 unreferenced photo files from earlier removals; untouched.)
- No product-feature branch exists on GitHub; this branch changes only image tags in `data/campaigns.json`.

---

# Image coverage: review, audit and trial (updated 2026-10-08)

This replaces the first version of this report. Its trial and coverage figures changed after the verification
review below. No 500-group batch was run, and nothing is pushed to `main`. Paid spend: **289 Brave requests,
$1.445**, plus **79 SerpApi searches** from the Starter plan's included 1,000 (no extra charge; ledger in
`pipeline/cache/search.sqlite`). The Google Images arm has now run (section 4).

## 1. Verification review

### Celine Winter 2026, accepted from `…/celine-hiver-2024-campaign` (anneofcarversville.com)

Evidence on the page itself, ignoring the URL:

| Where | Text |
|---|---|
| Headline (`<title>`, og:title, JSON-LD headline) | "Celine **Hiver 2025** Campaign by Zoe Ghertner Leans into Linear Shapes" |
| Meta description | "These Celine **Hiver 2026** campaign images feature Alaina Rae, Fai…" |
| Body, first sentence | "Celine is out with their **winter 2026** campaign today, the same day that Givenchy … releases their new Fall 2026 Campaign" |
| Body | "These new Celine Hiver 2026 campaign images feature models **Alaina Rae, Faith Johnson**, Frej Larsen and Milo Flaviani" |
| JSON-LD datePublished | 2026-08-27T21:13:02-0400 |
| Image files | `Another-Celine-Fall-campaign-by-Zoe-Ghertner-1…8.png`, Squarespace upload stamps 1787887168755 / 1787887590315 = 2026-08-28 03:19–03:26 UTC, i.e. the evening the post went up |

**Decision: correct, but for the wrong reason.**
- The body, meta description, publication date and image upload times all point to Winter 2026; the headline's
  2025 and the slug's 2024 are author slips.
- The pipeline never saw the conflict: it could not read "Hiver", so the headline produced no season at all.
- It also never checked whether the body's season belonged to Celine or to the Givenchy sentence next to it.
- The page carries a second, unrelated article (Louis Vuitton/Dior in China). None of its images were accepted:
  all 8 accepted files are the `…Zoe-Ghertner-N` series.

The same campaign now also verifies on theimpression.com ("Celine Hiver 2026"). That page names all six credited
models, and its 8 images replace the anneofcarversville set.

### Dolce & Gabbana SS 2003, "rejected as FW"

| Page | Headline | Page text | Verdict |
|---|---|---|---|
| scannedfashionworld.com/2021/01/campaign-d-ss-2003.html | "CAMPAIGN: D&G SS 2003" | none (one scan, no caption) | candidate: label and SS 2003 confirmed, **Eva Riccobono not named** |
| scannedfashionworld.com/2021/07/campaign-dolce-fw-2003.html | "CAMPAIGN: DOLCE&GABBANA FW 2003" | none | candidate: page is FW 2003 |
| 1stdibs.com/buy/dolce-gabbana-2003 | "Dolce Gabbana 2003 - 101 For Sale" | resale listing | candidate: FW 2003 |

**Decision: the rejection is correct; the report was wrong.**
- The SS 2003 page was never read as FW. It was held back because it doesn't name the model, and it is a D&G
  (diffusion line) scan, which the data treats as an alias.
- The group's failure reason was the most common reason across all its pages ("about FW 2003", from the other two
  pages). The report's example URL was simply the first page in the list. That is how "FW" ended up next to the
  "ss-2003" link.
- Fix: each failure reason is now reported together with the page it comes from. The closest page wins
  (campaign confirmed, model missing). 1stdibs and other resale sites are no longer fetched.

### Systematic re-check of every accepted page

I re-ran all 178 accepted source pages with the corrected rules (`results/recheck_accepted_pages.json`). Confirmed
mistakes, all fixed and covered by regression tests (`pipeline/tests/test_verify.py`, 17 tests, run with
`python3 -m unittest discover -s pipeline/tests -t .`):

| Mistake | Example (credit — page — text that was matched) | Fix |
|---|---|---|
| Foreign season words ignored | Celine — "Hiver 2025" headline unread | Hiver, Automne, Printemps, Été, Autunno, Inverno, Primavera, Estate, Otoño, Invierno, Verano, Herbst, Frühling, Sommer |
| Headline and body disagree, unnoticed | Celine — headline FW 2025, body FW 2026 | Conflict recorded; exact only when the publication date fits the body's period and not the headline's |
| Season next to another label | Celine — "Givenchy … Fall 2026" | A body season counts only if no other label is closer to it |
| **Byline date read as campaign year** | Marc Jacobs 2023 — "Mar 8, 2023 8:51 AM EST"; Nike 2017 — "May 25, 2017 10:15 AM EDT"; Mulberry 2015; Beach Bunny 2013 — "Published : Aug 28, 2013" | Bylines blanked (dates after Published/Updated/Posted, dates with a clock time, ISO dates); dates inside a sentence ("walked … on September 26, 2021") still count |
| **Related-headline list / profile page** | Tom Ford 2025 — fashiongonerogue.com/models/julia-nobis — "Tom Ford Embraces Sleek Tailoring for Fall 2025 Campaign" in a sidebar list | `/models/`, `/tag/`, `/category/`, `/archive/`, `/author/` and "ARCHIVE" pages rejected |
| **Editorial credit read as campaign** | Mugler 1989 — strip-project.com tag archive — "1989 \| ROLLING STONE \| PHOTOGRAPHY PETER LINDBERGH THIERRY MUGLER" | same |
| **Year dated something else** | Louis Vuitton 2020 runway — "debut in only 2020 at the Louis Vuitton FW21 show"; Victoria's Secret 1997 — "named a so-called Angel in 1997 … who's also in the campaign" | No other season or year allowed near the year; the campaign word must be within ~60 characters of the year |
| Red-carpet site | Valentino 2025 — redcarpet-fashionawards.com (ambassador at an event) | host excluded, including already-cached pages |

After the fixes, 161 of the accepted pages still verify. The rest were legitimate downgrades: their only evidence was a
byline, a listing page or a conflicting season.

## 2. Audit with corrected definitions

A dated relationship is not automatically a campaign. Every one of the 10,540 credits is counted exactly once
(`results/audit.json`):

- **Identified appearance:**
  - a cover with its issue month;
  - a show or campaign with its season;
  - a named campaign;
  - or a source page verified for this model, label and season/year.
- **Dated relationship:** a year only. She worked with the label that year, but which campaign or show is not known.
- **Undated relationship.**

| Credits | Identified 2,042 | Dated only 1,778 | Undated 6,720 | Total 10,540 |
|---|---:|---:|---:|---:|
| Photo verified to show the model (caption or file name names her, or hand-curated) | 125 | 2 | 0 | 127 |
| Photo tagged to the model by an earlier search (visual check only, no caption evidence) | 810 | 586 | 592 | 1,988 |
| Campaign gallery only (models not identified individually) | 95 | 5 | 1 | 101 |
| Portrait/press fallback only | 754 | 892 | 5,003 | 6,649 |
| No picture | 258 | 293 | 1,124 | 1,675 |

The 592 undated credits with a photo all have a source page that names both the model and the label. No dates were
added to them.

Dated credits (identified + dated-only) without a model photo: **2,297**. Primary reasons:

| Reason | Identified | Dated only |
|---|---:|---:|
| No relevant results | 552 | 554 |
| Relevant result, source inaccessible | 352 | 385 |
| Rejected: campaign, season or identity not confirmed | 112 | 219 |
| Accessible source, extraction failed | 40 | 32 |
| Not searched yet | 51 | 0 |

### Data after this update (compared with the last `main`)

- **New photos:** 158 credits newly illustrated, 852 placements.
- **Dates:** 259 dates read off a photo page are confirmed by that page; 255 are not and were removed.
- **Undated credits:**
  - 520 photos were removed because their page does not name the label (413) or the model (107).
  - 326 credits lost their only photo and now show the portrait fallback.
- **Rendering:** 4,991 image references, all local files decode. 33 model pages (483 images) were rendered in
  Chromium with no errors.

## 3. Trial, Brave arm (re-scored)

The frozen 50 dated campaign/ambassador groups were missing a photo after the free pass. They span five year bands
and 50 labels.
- Two of them (Tommy Hilfiger 2016, H&M 2021) were dated only from a photo page that does not state the year, so
  they are not truly dated. Both arms still run on all 50, using the frozen group definitions.
- After the review, the Brave arm verifies **11 / 50** galleries (11 / 48 valid). The figure was 12; Carven (a
  magazine editorial) and Roberto Cavalli 2015 (no stated campaign year) dropped out.
- Cost of the searches for these 50: 138 requests, $0.69, or **$0.063 per verified gallery**. Total trial spend
  across re-runs: $1.445.

**What "11/50 recovered" means for model listings:**
- **What 11 means:** 11 campaigns have a verified gallery. Those 11 groups hold 12 credits and 17 credited models.
- **Photos of the model herself:** only **3 credited models** appear in a photo verified to show *her*:
  - Jisoo, Dior Fall 2021
  - Hanni, UGG 2024
  - Rebecca Leigh Longendyke, Zara 2020
- **The other 14:** the listing shows a "Campaign photos (N) — the models in them are not identified individually"
  link. It doesn't show a photo of her.
- **Campaign-only:** one more campaign is confirmed but doesn't name the model (Miu Miu FW 2019, pradagroup.com),
  so it isn't applied.
- **Cross-page evidence:** the new rule, where one page confirms the campaign and another names the cast, recovered
  one older group: Miu Miu SS 1999. That's a scannedfashionworld scan plus miumiu.com's own "SS99 campaign" page
  naming May Andersen.

**Sample limitations:**
- n = 50, so the 95% interval for 11/50 is **13%–35%**.
- The sample is the harder remainder: campaigns the free pass couldn't recover.
- It's stratified by year band and uses one campaign per label, so it isn't proportional to the archive.
- Campaigns and ambassadorships only: no runway shows or covers.
- About half the archive's dated credits name no season, and "dated-only" credits cannot be verified as a specific
  campaign at all.

So 22% shouldn't be multiplied across the archive. For the 1,190 dated-only credits without a model photo, expect
far less.

| Campaign | Credited models | Brave arm | Photos (tagged) | Evidence page, or failure reason and the page it comes from |
|---|---|---|---|---|
| Anne Klein 1991 campaign | Yasmeen Ghauri | not recovered | 0 | unverified: not about a campaign — https://www.louisdellolio.com/blog/?p=3139 |
| Aquascutum 2012 campaign | Guinevere Van Seenus | not recovered | 0 | unverified: no season/year stated — https://www.trendhunter.com/slideshow/30-guinevere-van-seenus-photoshoots |
| Armani 2016 campaign | Eva Herzigová | not recovered | 0 | unverified: none of the credited models is named — http://www.fashiongonerogue.com/giorgio-armani-fall-2016-campaign-preview/ |
| BCBG Max Azria 2007 campaign | Tanya Diagileva | not recovered | 0 | unverified: label not named in the article — https://www.zippia.com/bcbg-max-azria-group-careers-16431/history/ |
| Badgley Mischka Spring/Summer 2020 campaign | Vlada Roslyakova | not recovered | 0 | extraction failed: no campaign image found in the verified article — https://www.prnewswire.com/news-releases/badgley-mischka-launches-spring-2020-campaign-300985105.html |
| Balenciaga 2024 campaign | Dixie D'Amelio | not recovered | 0 | unverified: none of the credited models is named — https://www.balenciaga.com/en-us/summer-24-campaign |
| Banana Republic 2015 campaign | Macarena Achaga | not recovered | 0 | unverified: none of the credited models is named — https://www.designscene.net/2015/04/lily-donaldson-banana-republic-ss15.html |
| Barneys New York Spring/Summer 2011 campaign | Lindsey Wixson | not recovered | 0 | unverified: none of the credited models is named — https://www.prnewswire.com/news-releases/barneys-new-york-announces-backstage-black-and-white-spring-2011-campaign-115571779.html |
| Belstaff Fall/Winter 2008 campaign | Lara Stone | not recovered | 0 | unverified: no season/year stated — https://trendland.com/lara-stone-model-of-the-year-2008/ |
| Calvin Klein 2023 campaign | Kelsey Merritt | not recovered | 0 | unverified: none of the credited models is named — https://www.pvh.com/news/calvin-klein-spring-2023-campaign |
| Carven Spring/Summer 2015 campaign | Magdalena Jasek | not recovered | 0 | extraction failed: no campaign image found in the verified article — https://maydele.blogspot.com/2015/06/top-spring-summer-2015-campaigns.html |
| Celine Winter 2026 campaign | Alaina Rae, Esther Kim … | verified gallery | 8 (0) | https://theimpression.com/celine-hiver-2026-ad-campaign-review/ |
| Chanel Spring/Summer 1985 campaign | Kristen McMenamy | not recovered | 0 | unverified: article is about FW 1985, FW 1992 — https://www.wmagazine.com/fashion/karl-lagerfeld-final-chanel-show-models-tributes |
| Chloé 1998 campaign | Gisele Bündchen | not recovered | 0 | unverified: article is about FW 2007, FW 2008, SS 2007 — https://forums.thefashionspot.com/threads/chlo%C3%A9-the-campaign-archive.104217/page-6 |
| Coach Fall/Winter 2016 campaign | Jing Wen | verified gallery | 9 (0) | https://ww.fashionnetwork.com/news/Coach-unveils-1941-fall-2016-ad-campaign,710813.html |
| David Jones 2011 campaign | Samantha Harris | not recovered | 0 | unverified: none of the credited models is named — https://www.ragtrader.com.au/news/david-jones-bites-back |
| Dior Fall 2021 campaign | Jisoo | verified gallery | 1 (1) | https://www.lofficielmalaysia.com/fashion/blackpink-s-jisoo-is-back-again-to-launch-the-dior-fall-2021-collection |
| Dolce & Gabbana Spring/Summer 2003 campaign | Eva Riccobono | not recovered | 0 | unverified: none of the credited models is named — https://www.scannedfashionworld.com/2021/01/campaign-d-ss-2003.html |
| Fendi Fall/Winter 1991 campaign | Kristen McMenamy | not recovered | 0 | unverified: not about a campaign — https://www.lipstickalley.com/threads/fashion-classic-fendi-spring-summer-1991.5286751/ |
| Gianfranco Ferré 1998 campaign | Gisele Bündchen | not recovered | 0 | unverified: none of the credited models is named — https://www.scannedfashionworld.com/2019/10/ad-campaign-gianfranco-ferre-fw-1998.html |
| Givenchy 2025 campaign | Vittoria Ceretti | verified gallery | 8 (0) | https://theimpression.com/givenchy-fall-winter-2025-ad-campaign-review/ |
| Gucci Fall/Winter 2021 campaign | Kristen McMenamy | verified gallery | 8 (0) | https://www.fashiongonerogue.com/gucci-fall-2021-campaign-aria/ |
| H&M 2021 campaign ⚠ date unsupported | Josephine Skriver, Élise Crombez | not recovered | 0 | unverified: none of the credited models is named — https://www.fashiongonerogue.com/hm-spring-2021-campaign/ |
| Hugo Boss 2017 campaign | Devon Aoki | verified gallery | 1 (0) | https://ph.fashionnetwork.com/news/Hugo-campaign-features-stars-plus-a-hadid,785312.html |
| Jil Sander 2006 campaign | Małgosia Bela | not recovered | 0 | unverified: no season/year stated — https://forums.thefashionspot.com/threads/jil-sander-the-campaign-archive.104411/ |
| Levi's 1988 campaign | Tatjana Patitz | not recovered | 0 | unverified: none of the credited models is named — https://www.fashionsoundtrack.co.uk/2013/09/25/levis-music-history/ |
| Louis Vuitton Spring/Summer 2010 campaign | Amanda Sudano | not recovered | 0 | extraction failed: no campaign image found in the verified article — https://articlebio.com/amanda-sudano |
| Marc Jacobs 2016 campaign | Kiki Willems | verified gallery | 1 (0) | https://www.designscene.net/2016/02/marc-jacobs-ss2016-ad-campaign.html |
| Marc O'Polo Spring 2014 campaign | Amber Valletta | not recovered | 0 | extraction failed: no campaign image found in the verified article — https://www.thefashionisto.com/jeff-bridges-marc-opolo-springsummer-2014-campaign/ |
| Marks & Spencer 2011 campaign | Rosie Huntington-Whiteley | not recovered | 0 | extraction failed: too small (300x300) (1) — https://www.justjared.com/2011/10/06/rosie-huntington-whiteley-ryan-reynolds-marks-spencers-video/ |
| Miu Miu Fall/Winter 2019 campaign | Mona Tougaard | campaign only, model not named | 6 (0) | https://www.pradagroup.com/en/news-media/news-section/miu-miu-fw-2019-advertising-campaign.html |
| Moschino Spring/Summer 1999 campaign | Hannelore Knuts | not recovered | 0 | unverified: none of the credited models is named — https://www.scannedfashionworld.com/2020/02/campaign-moschino-ss-1999.html |
| Nicole Farhi Spring/Summer 2009 campaign | Sigrid Agren | not recovered | 0 | unverified: none of the credited models is named — https://www.thefashionisto.com/campaign-nicole-farhi-spring-2009/ |
| Old Navy 2011 campaign | Melissa Molinaro | not recovered | 0 | extraction failed: no campaign image found in the verified article — https://www.mandourlaw.com/gap-settles-kim-kardashians-old-navy-ad-likeness-suit/ |
| Oscar de la Renta 2007 campaign | Caroline Trentini | not recovered | 0 | unverified: article is about FW 2008 — https://forums.thefashionspot.com/threads/oscar-de-la-renta-the-campaign-archive.126379/ |
| Pepe Jeans 2009 campaign | Richa Gangopadhyay | not recovered | 0 | unverified: label not named in the article — http://www.idlebrain.com/celeb/interview/richagangopadhyay.html |
| Philipp Plein 2010 campaign | Mischa Barton | verified gallery | 3 (0) | https://www.glamcheck.com/fashion/2010/06/27/face-of-philipp-plein-couture-a-w-2010/ |
| Prada Spring 2013 campaign | Maartje Verhoef, Vanessa Axente | verified gallery | 8 (0) | https://www.designscene.net/2012/12/prada-spring-summer-2013-campaign-steven-meisel.html |
| Ralph Lauren Fall/Winter 2011 campaign | Sui He | not recovered | 0 | extraction failed: no campaign image found in the verified article — https://fashionmagazine.com/sui-he/ |
| Roberto Cavalli 2015 campaign | Edita Vilkevičiūtė | not recovered | 0 | unverified: none of the credited models is named — http://wardrobetrendsfashion.com/roberto-cavalli-fall-2015/ |
| Seafolly 2016 campaign | Shanina Shaik | not recovered | 0 | extraction failed: image http 404 (1), rejected in an earlier review (1) — https://underlinesmagazine.com/2016/07/18/seafolly-ss16-campaign/ |
| Tommy Hilfiger 2016 campaign ⚠ date unsupported | Josephine Skriver | not recovered | 0 | unverified: none of the credited models is named — https://www.fashiongonerogue.com/tommy-hilfiger-denim-fall-2016-campaign/ |
| Topshop 2007 campaign | Chloe Hayward | not recovered | 0 | unverified: none of the credited models is named — https://forums.thefashionspot.com/threads/fall-2007-campaigns.120589/ |
| UGG 2024 campaign | Hanni | verified gallery | 2 (2) | https://news.designrush.com/newjeans-hanni-and-alex-consani-join-uggs-for-its-comeback |
| Valentino 2008 campaign | Isabeli Fontana | not recovered | 0 | unverified: not about a campaign — https://www.hautfashion.com/designer-collection/valentino-couture-fall-2008 |
| Vera Wang 2006 campaign | Bruna Tenório | not recovered | 0 | unverified: label not named in the article — https://insights.citeline.com/RS014165/Fragrance-In-Brief/ |
| Versace 1992 campaign | Yasmeen Ghauri | not recovered | 0 | unverified: none of the credited models is named — https://www.scannedfashionworld.com/2023/02/campaign-v2-versace-ss-1992.html |
| Victoria's Secret 1997 campaign | Helena Christensen, Karen Mulder … | not recovered | 0 | unverified: article is about HOL 2020 — https://www.foxnews.com/entertainment/helena-christensen-models-victorias-secret-24-years-later |
| Wonderbra 1996 campaign | Patrizia Deitos, Sophie Anderton | not recovered | 0 | unverified: no season/year stated — https://uk.themedialeader.com/wonderbra-tops-ad-poll/ |
| Zara 2020 campaign | Rebecca Leigh Longendyke | verified gallery | 8 (2) | https://www.designscene.net/2020/12/zara-holiday-2020.html |

## 4. Google Images arm (SerpApi): results

Run on 2026-10-08 on the same frozen 50 campaigns, one model-first query each, within the Starter plan's included
searches (`python3 -m pipeline trial --google --plans starter`, then `python3 -m pipeline compare`).

| | Brave arm | Google Images arm |
|---|---:|---:|
| Campaigns with a verified gallery | 11 / 50 | **14 / 50** |
| Credited models shown in a verified photo | 3 | 5 |
| Photos accepted by the rules | 57 | 82 (6 then rejected visually, below) |
| Photos tagged to a named model | 5 | 19 |
| Relevant results on hosts never fetched (social, stock, resale) | 270 | 110 |
| Relevant results on pages that disallow Claude | 188 | 33 |
| Requests | 136 ($0.68) | 79 searches from the plan (≈ $1.98 of the $25 allowance) |

- **Overlap:** Google recovered all 11 campaigns Brave recovered, plus 3 Brave missed: **Ralph Lauren FW 2011**
  (Sui He, asianmodelsblog.blogspot.com), **Seafolly 2016** (Shanina Shaik, seafolly.com), **Armani SS 2016**
  (Eva Herzigová, fashiongonerogue.com). Brave found nothing Google missed.
- **Visual review of the 17 Google-only photos:** 11 kept. Rejected 6 (added to `results/review_rejected.txt`, now
  142): 4 Seafolly pictures on the "Meet Shanina Shaik" page that show a different model but were tagged as her by
  the single-model-article rule, and 2 Armani behind-the-scenes shots. The single-model-article rule should not tag
  every picture on a brand blog page; that is the next rule fix.
- **Remaining failures (Google, 36):** 16 unverified (5 not about a campaign, 4 model not named), 12 inaccessible
  source, 4 no relevant results, 3 empty from both engines (Levi's 1988, Aquascutum 2012, Marc O'Polo SS 2014),
  1 extraction failed.

**SerpApi engine problems found and fixed in `pipeline/search/serpapi.py`:**
- `engine=google_images` answered "Google Images hasn't returned any results" for 27 of 50 queries, including
  "Helena Christensen Victoria's Secret 1997 campaign", also with `no_cache=true`. `engine=google_images_light`
  returns 100 results with the same fields for those queries. The adapter now falls back to it once, and no longer
  caches an empty answer from the full engine.
- `google_images_light` answers HTTP 503 under the pipeline's 8 parallel workers; the same query succeeds alone.
  The adapter retries 502/503/504 twice with a short wait.
- The ledger counts every SerpApi request at $0.025 (133 rows, $3.33). That overstates use: SerpApi serves an
  identical query within an hour from its cache for free, and re-runs repeated queries. The account itself
  (`account.json`) went from 1,000 to 921 searches left, so **79 searches** were used.

## 5. Decision

- **Use Google Images as a discovery step.** It recovered 14/50 against Brave's 11/50, everything Brave found
  plus 3, and pointed far less often to pages that cannot be fetched (143 against 458). It also tags more photos
  to a named model (19 against 5), which is what model listings need.
- The earlier threshold was "5 or more campaigns Brave missed" for a combined workflow. Google added 3, but Brave
  added none, so Google alone does better than Brave alone. The recommended order is free sources → Google Images
  → Brave web only for what is still unrecovered.
- **Cost:** on Starter, 1,000 searches a month are already paid for. A 500-campaign batch needs about 500–1,000
  searches (one query, plus the light-engine fallback when the full engine returns nothing). That fits in one
  month only if the fallback is rare, so run batches of about 400 campaigns per month, or upgrade to Developer
  ($75, 5,000) for larger ones.
- **Before any larger batch:** fix the single-model-article tagging rule (Seafolly case above), and keep the
  visual review mandatory. 142 photos are on the reject list.

---
The first version of this report (pre-review figures) is in git history: `git show 647806a:pipeline/results/REPORT.md`.
