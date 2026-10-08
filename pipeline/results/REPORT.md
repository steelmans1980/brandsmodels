# Image coverage: audit, pipeline changes and trial (2026-10-08)

No full-dataset paid run was started. Paid spend for this work: **289 Brave requests, $1.445**, all for the
trial (ledger in `pipeline/cache/search.sqlite`, namespace `ledger`). Nothing is pushed to `main`.

## 1. Audit (after this change)

`python3 -m pipeline audit` → `results/audit.json`. "Specific" = credit with a year; "general" = undated relationship.

| Relation, kind | Credits | Exact photo | Portrait/press fallback only | No picture |
|---|---:|---:|---:|---:|
| specific campaign | 1,108 | 597 (+55 with models not identified individually) | 440 | 71 |
| specific ambassador | 146 | 91 | 51 | 4 |
| specific cover | 1,130 | 535 | 351 | 244 |
| specific runway | 1,177 | 145 | 800 | 232 |
| specific, year confirmed on the photo's own page | 280 | 280 | – | – |
| general campaign | 3,131 | 350 | 2,339 | 442 |
| general runway | 3,457 | 191 | 2,590 | 676 |
| general ambassador | 111 | 32 | 73 | 6 |

Why the 2,193 dated credits still lack an exact photo (primary reason per credit):

| Reason | Credits | Representative examples |
|---|---:|---|
| No relevant results (earlier paid search found nothing naming model, label and year; or no usable source) | 1,083 | Anne Marie van Dijk — bebe Spring 2009 (only source is Wikipedia); Rebecca Romijn — bebe Spring 2007 |
| Relevant result, inaccessible source (robots.txt disallows Claude, 404, paywall) | 732 | Bruna Tenório — Gap 2006 (gapinc.com press release 404); Laura Neiva — Chanel 2012 (globo.com blocked); Linnea Regnander — Valentino 2010 (nymag.com blocked) |
| Rejected: campaign, season or identity not confirmed | 288 | Chu Wong — Fendi Fall 2027 (page is about FW 2026); Lulu Tenney — Calvin Klein FW 2017 runway (page about FW 2020); Kiko Mizuhara — Chanel 2012 (earlier image rejected in review) |
| Accessible source, extraction failed (no campaign image in the verified article, image host blocks, image too small) | 90 | Mika Schneider — Miu Miu 2021 runway (Vogue France video page); Malika Louback — Saint Laurent SS 2020 (interview page with portraits only) |

General relationships: 6,699 undated credits (the source names a model–label relationship but no campaign).
573 carry a photo whose source page names both the model and the label; the rest show the model's portrait
or press photo as an explicitly labelled fallback, never as a campaign photo.

Rendering: 5,011 image references, 5,008 local files exist and decode, 0 problems; 3 are remote Wikimedia
portraits. Browser check (Chromium): 36 model pages, 567 images, all rendered, no JS errors; campaign-gallery
button and lightbox tested. Source links: the 175 pages behind the 808 photos added here all returned HTTP 200.

## 2. Before → after

| | Before | After |
|---|---:|---:|
| Credits with an independently confirmed date | 3,561 | 3,841 |
| … of which with an exact photo | 1,300 | **1,648** |
| Credits dated only from a photo page (unverified) | 514 | 0 |
| Undated credits with a photo | 771 | 573 |
| Dated campaign groups with a photo | 1,424 / 3,424 | 1,476 / 3,293 |

- 167 credits newly illustrated (889 photo placements, 804 new files; 407 of the free-pass photos are tagged to a named model).
- 280 dates read from a photo page were confirmed by that page; 234 were not and were removed (credit is undated again).
- 524 photos on undated credits were removed because their page does not name the label (413) or the model (111);
  330 credits lost their only photo. Examples: tag-walk.com model pages, anneofcarversville model bios, stock runway
  photos of other shows. All of this is reversible from git; nothing was deleted from history.

## 3. Trial: 50 dated campaigns without an exact photo

Selection: dated campaign/ambassador groups still missing a photo after the free pass, spread across five year bands
(1980–99, 2000–09, 2010–14, 2015–19, 2020–27) and 50 different labels (`results/trial_selection.json`, frozen).

| Arm | Recovered with verified photos | Accepted photos | Paid requests | Cost | Cost per newly illustrated campaign |
|---|---:|---:|---:|---:|---:|
| Improved pipeline (cited sources → earlier results → Brave web campaign-first → Brave images → Brave web model-first) | **12 / 50** | 57 (5 tagged to a model, 52 "models not identified") | 138 | **$0.69** | **$0.058** |
| Google Images via SerpApi | not run — no `SERPAPI_API_KEY` | – | 0 | $0 | – |

Total trial spend was $1.445. The extra $0.755 was spent while the selection still moved between rule changes. The
selection is now frozen and re-runs replay the cache at $0.

Also found, not applied: 2 campaigns (13 photos) where the page confirms label, season and year but never names the
credited model (Miu Miu FW 2019 on pradagroup.com, French Connection Winter 2014).

Failure reasons for the 38 not recovered:

| Reason | n | Example |
|---|---:|---|
| Page confirms the campaign but never names the credited model | 11 | Gianfranco Ferré FW 1998 (scannedfashionworld.com scans, no captions); Calvin Klein 2023 (pvh.com press release does not name Kelsey Merritt) |
| Verified article, but no image tied to the campaign could be extracted | 9 | Ralph Lauren FW 2011 (womenmanagement.blogspot.com); Old Navy 2011 (retaildive.com article without campaign images) |
| No season/year on the page | 7 | Victoria's Secret 1997 (foxnews.com retrospective); Wonderbra 1996 (standard.co.uk) |
| Label not named / not about a campaign | 5 | Valentino 2008 → a 1stdibs listing; BCBG 2007 → a careers page |
| Page is about a different season (year ±1 only gives a candidate) | 4 | Dolce & Gabbana SS 2003 → page is FW 2003; Belstaff FW 2008 → SS 2008 |
| Other (image 404, too small, rejected in earlier review) | 2 | |

Per-campaign results:

| Campaign | Credited models | Outcome | Photos | Evidence page or failure reason |
|---|---|---|---|---|
| Anne Klein 1991 campaign | Yasmeen Ghauri | not recovered | 0 | extraction failed: no campaign image found in the verified article — e.g. https://www.louisdellolio.com/blog/?p=3139 |
| Aquascutum 2012 campaign | Guinevere Van Seenus | not recovered | 0 | unverified: no season/year stated — e.g. https://www.tatlerasia.com/style/fashion/tim-walker-captures-the-essence-of-aquascutum-in- |
| Armani 2016 campaign | Eva Herzigová | not recovered | 0 | unverified: none of the credited models is named — e.g. http://www.fashiongonerogue.com/giorgio-armani-fall-2016-campaign-preview/ |
| BCBG Max Azria 2007 campaign | Tanya Diagileva | not recovered | 0 | unverified: label not named in the article — e.g. https://www.zippia.com/bcbg-max-azria-group-careers-16431/history/ |
| Badgley Mischka Spring/Summer 2020 campaign | Vlada Roslyakova | not recovered | 0 | extraction failed: no campaign image found in the verified article — e.g. https://www.prnewswire.com/news-releases/badgley-mischka-debuts-spring-2020-collection-300 |
| Balenciaga 2024 campaign | Dixie D'Amelio | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.balenciaga.com/en-us/summer-24-campaign |
| Banana Republic 2015 campaign | Macarena Achaga | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.designscene.net/2015/04/lily-donaldson-banana-republic-ss15.html |
| Barneys New York Spring/Summer 2011 campaign | Lindsey Wixson | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.prnewswire.com/news-releases/barneys-new-york-announces-backstage-black-and-wh |
| Belstaff Fall/Winter 2008 campaign | Lara Stone | not recovered | 0 | unverified: article is about SS 2008 — e.g. https://www.belstaff.com/eu/en/about-us |
| Calvin Klein 2023 campaign | Kelsey Merritt | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.pvh.com/news/calvin-klein-spring-2023-campaign |
| Carven Spring/Summer 2015 campaign | Magdalena Jasek | not recovered | 0 | extraction failed: no campaign image found in the verified article — e.g. http://glamsugar.com/19-looks-by-fashion-designer-carven/ |
| Celine Winter 2026 campaign | Alaina Rae, Esther Kim … | **verified** | 8 | https://anneofcarversville.com/fashion/2026/8/27/celine-hiver-2024-campaign |
| Chanel Spring/Summer 1985 campaign | Kristen McMenamy | not recovered | 0 | unverified: article is about FW 1985, FW 1992 — e.g. https://www.wmagazine.com/fashion/karl-lagerfeld-final-chanel-show-models-tributes |
| Chloé 1998 campaign | Gisele Bündchen | not recovered | 0 | unverified: label not named in the article — e.g. https://forums.thefashionspot.com/threads/chlo%C3%A9-the-campaign-archive.104217/page-6 |
| Coach Fall/Winter 2016 campaign | Jing Wen | **verified** | 9 | https://ww.fashionnetwork.com/news/Coach-unveils-1941-fall-2016-ad-campaign,710813.html |
| David Jones 2011 campaign | Samantha Harris | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.weforum.org/people/david-jones/ |
| Dior Fall 2021 campaign | Jisoo | **verified** | 1 | https://www.lofficielmalaysia.com/fashion/blackpink-s-jisoo-is-back-again-to-launch-the-dior-fall-2021-collection |
| Dolce & Gabbana Spring/Summer 2003 campaign | Eva Riccobono | not recovered | 0 | unverified: article is about FW 2003 — e.g. https://www.scannedfashionworld.com/2021/01/campaign-d-ss-2003.html |
| Fendi Fall/Winter 1991 campaign | Kristen McMenamy | not recovered | 0 | unverified: not about a campaign — e.g. https://www.lipstickalley.com/threads/fashion-classic-fendi-spring-summer-1991.5286751/ |
| Gianfranco Ferré 1998 campaign | Gisele Bündchen | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.scannedfashionworld.com/2019/10/ad-campaign-gianfranco-ferre-fw-1998.html |
| Givenchy 2025 campaign | Vittoria Ceretti | **verified** | 8 | https://theimpression.com/givenchy-fall-winter-2025-ad-campaign-review/ |
| Gucci Fall/Winter 2021 campaign | Kristen McMenamy | **verified** | 8 | https://www.fashiongonerogue.com/gucci-fall-2021-campaign-aria/ |
| H&M 2021 campaign | Josephine Skriver, Élise Crombez | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.fashiongonerogue.com/hm-summer-vacation-style-liu-wen-josephine-edita/ |
| Hugo Boss 2017 campaign | Devon Aoki | **verified** | 1 | https://ph.fashionnetwork.com/news/Hugo-campaign-features-stars-plus-a-hadid,785312.html |
| Jil Sander 2006 campaign | Małgosia Bela | not recovered | 0 | unverified: no season/year stated — e.g. https://forums.thefashionspot.com/threads/jil-sander-the-campaign-archive.104411/ |
| Levi's 1988 campaign | Tatjana Patitz | not recovered | 0 | unverified: no season/year stated — e.g. https://www.herbritts.com/#/archive/video/herb-ritts-directs-cartier-the-gift-commercial/ |
| Louis Vuitton Spring/Summer 2010 campaign | Amanda Sudano | not recovered | 0 | extraction failed: no campaign image found in the verified article — e.g. http://www.handbag.com/fashion/news/the-new-face-of-louis-vuitton-104367 |
| Marc Jacobs 2016 campaign | Kiki Willems | **verified** | 1 | https://www.designscene.net/2016/02/marc-jacobs-ss2016-ad-campaign.html |
| Marc O'Polo Spring 2014 campaign | Amber Valletta | not recovered | 0 | extraction failed: no campaign image found in the verified article — e.g. https://grokipedia.com/page/Marc_O'Polo |
| Marks & Spencer 2011 campaign | Rosie Huntington-Whiteley | not recovered | 0 | extraction failed: too small (300x300) (1) — e.g. https://www.talentmanagement.com/blog/2011/04/marks-and-spencers%E2%80%99-chosen-models/ |
| Miu Miu Fall/Winter 2019 campaign | Mona Tougaard | campaign confirmed, model not named (not applied) | 6 | https://www.pradagroup.com/en/news-media/news-section/miu-miu-fw-2019-advertising-campaign.html |
| Moschino Spring/Summer 1999 campaign | Hannelore Knuts | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.scannedfashionworld.com/2020/02/campaign-moschino-ss-1999.html |
| Nicole Farhi Spring/Summer 2009 campaign | Sigrid Agren | not recovered | 0 | extraction failed: no campaign image found in the verified article — e.g. https://www.thefashionisto.com/campaign-nicole-farhi-spring-2009/ |
| Old Navy 2011 campaign | Melissa Molinaro | not recovered | 0 | extraction failed: no campaign image found in the verified article — e.g. https://www.retaildive.com/ex/mobilecommercedaily/old-navy-strengthens-multichannel-summer |
| Oscar de la Renta 2007 campaign | Caroline Trentini | not recovered | 0 | unverified: article is about FW 2008 — e.g. https://cfda.com/member/oscar-de-la-renta/ |
| Pepe Jeans 2009 campaign | Richa Gangopadhyay | not recovered | 0 | unverified: label not named in the article — e.g. http://www.idlebrain.com/celeb/interview/richagangopadhyay.html |
| Philipp Plein 2010 campaign | Mischa Barton | **verified** | 3 | https://www.glamcheck.com/fashion/2010/06/27/face-of-philipp-plein-couture-a-w-2010/ |
| Prada Spring 2013 campaign | Maartje Verhoef, Vanessa Axente | **verified** | 8 | https://www.designscene.net/2012/12/prada-spring-summer-2013-campaign-steven-meisel.html |
| Ralph Lauren Fall/Winter 2011 campaign | Sui He | not recovered | 0 | extraction failed: no campaign image found in the verified article — e.g. http://womenmanagement.blogspot.com/2011/07/ralph-lauren-fall-2011-campaign-bruna.html |
| Roberto Cavalli 2015 campaign | Edita Vilkevičiūtė | **verified** | 1 | https://www.beautyscene.net/fragrances-for-women/roberto-cavalli-to-launch-new-fragrance-in-2015-fronted-by-edita-vilkeviciute/ |
| Seafolly 2016 campaign | Shanina Shaik | not recovered | 0 | extraction failed: image http 404 (1), rejected in an earlier review (1) — e.g. https://www.fashiongonerogue.com/gigi-hadid-seafolly-spring-summer-2016-campaign/ |
| Tommy Hilfiger 2016 campaign | Josephine Skriver | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.fashiongonerogue.com/tommy-hilfiger-denim-fall-2016-campaign/ |
| Topshop 2007 campaign | Chloe Hayward | not recovered | 0 | unverified: no season/year stated — e.g. https://www.independent.co.uk/life-style/fashion/features/talent-issue--the-model-chloe-ha |
| UGG 2024 campaign | Hanni | **verified** | 1 | https://ir.deckers.com/news-events/press-releases/detail/393/ugg-unveils-feels-like-ugg-campaign-for-autumnwinter-2024 |
| Valentino 2008 campaign | Isabeli Fontana | not recovered | 0 | unverified: not about a campaign — e.g. https://www.1stdibs.com/buy/valentino-2008/ |
| Vera Wang 2006 campaign | Bruna Tenório | not recovered | 0 | unverified: no season/year stated — e.g. https://insights.citeline.com/RS014165/Fragrance-In-Brief/ |
| Versace 1992 campaign | Yasmeen Ghauri | not recovered | 0 | unverified: none of the credited models is named — e.g. https://www.scannedfashionworld.com/2023/02/campaign-v2-versace-ss-1992.html |
| Victoria's Secret 1997 campaign | Helena Christensen, Karen Mulder … | not recovered | 0 | unverified: no season/year stated — e.g. https://www.foxnews.com/entertainment/helena-christensen-models-victorias-secret-24-years- |
| Wonderbra 1996 campaign | Patrizia Deitos, Sophie Anderton | not recovered | 0 | unverified: no season/year stated — e.g. https://www.standard.co.uk/news/world/eva-herzigova-wonderbra-ad-empowered-women-9875267.h |
| Zara 2020 campaign | Rebecca Leigh Longendyke | **verified** | 8 | https://www.designscene.net/2020/12/zara-holiday-2020.html |

### Google Images (SerpApi)

Checked on serpapi.com: `engine=google_images` returns `images_results` with the page link, the original image
URL, source and size. Free plan: 250 searches/month. Paid: Starter $25 (1,000), Developer $75 (5,000),
Production $150 (15,000). Only successful searches count, and identical searches within an hour are cached
free. The adapter is `pipeline/search/serpapi.py`. Set `SERPAPI_API_KEY` in the environment (in Claude Code on the web:
the environment's secrets), then run `python3 -m pipeline trial --budget 6.5`. The Google arm uses the same 50
campaigns and the remaining budget. Results only point to pages: every page must still allow Claude in
robots.txt and pass the same verification. A search result is not permission to download or republish.
(Google's own Custom Search JSON API is closed to new customers and ends on 2027-01-01. Bing's API was retired in
August 2025.)

## 4. What changed in the pipeline

- **One search per campaign:** credits are grouped by label, kind, year, season family (SS/FW/Holiday/Resort/Pre-fall)
  and campaign title. A photo is tagged with a model only when its alt text, caption or file name names her, or a
  single-model article is about her. Otherwise it's stored untagged and shown as "Campaign photos — models not
  identified individually", never as her photo.
- **Free sources first:** cited source pages, then pages found by earlier paid runs, before any paid query.
  Extraction reads `srcset`, lazy-load attributes, `<noscript>`, `<picture>`, linked full-size files and JSON-LD.
  It drops related/recommended/sidebar/ad blocks.
- **Matching:** season variants (FW15, A/W 2013, Fall/Winter 2015-16, Spring '16, …); campaign-first, then
  model-first queries. Year ±1 or a matching publication date makes only a candidate. A named campaign title must be
  on the page. Sub-lines are rejected ("Armani Exchange", "Mango Teen", menswear). On magazine pages only pictures
  captioned with the label count. Pictures naming another label, season, year, issue month, a show, red carpet or
  street are dropped. Surname matches are refused when another first name precedes them ("Sienna Miller" ≠ Alyssa
  Miller).
- **Undated relationships:** no dates invented; a date read off a photo page is kept only when that page states it.
- **Evidence:** every applied photo has its page URL, image URL, matched headline, season and models named in
  `results/evidence.json`.
- **Repeatable:** paid responses are cached forever by (provider, query) and committed, so a query is never paid
  twice. Page, robots and image caches are kept locally. Results are stored per group, so runs resume. `--dry-run` never pays.
  Budgets are hard caps, and the trial cap is cumulative across re-runs. Every paid request is in a ledger. Photos
  are deduplicated by perceptual hash. Rejected files (`results/review_rejected.txt`, 134 so far) are never accepted
  again. Existing photos are only removed by the explicit `general` step.

## 5. Limitations

- Precision still needs a human pass. Of roughly 900 photos the rules accepted, 134 were rejected visually: event and
  street photos, products, author headshots, other covers. Most of these led to new rules. Expect a few percent after
  the current rules.
- Archive scans without captions (scannedfashionworld, fashion forums) cannot confirm the model, so they stay
  unapplied.
- 851 of 2,000 photo-less groups have no usable cited source and were never searched, and 465 cited pages disallow
  Claude in robots.txt.
- Runway and cover coverage were not part of the trial; the trial measured campaigns and ambassadorships only.
- The Google Images arm was not run (no key).
- 330 undated credits lost their only photo under the stricter rule. They now show the fallback portrait.

## 6. Recommended next batch

1. Free (no API cost): add a SerpApi free-plan key and run the Google arm on the same 50 campaigns (≤ 50 searches) for
   a real comparison.
2. Brave, campaigns and ambassadorships only, the next 500 groups, budget $10. Worst case about 1,500 requests ($7.50);
   at the trial rate, about 120 campaigns recovered at about $0.06 each. Review the contact sheets before apply:
   ```
   python3 -m pipeline batch --run camp-b1 --providers sources,legacy,brave_web,brave_images --kinds campaign,ambassador --limit 500 --budget 10 --dry-run
   python3 -m pipeline batch --run camp-b1 --providers sources,legacy,brave_web,brave_images --kinds campaign,ambassador --limit 500 --budget 10
   python3 -m pipeline sheet --run camp-b1
   python3 -m pipeline apply --run camp-b1 --reject pipeline/results/review_rejected.txt
   ```
3. Covers next (1,130 dated, 244 with no picture). Issue month and year are now checked per image.
