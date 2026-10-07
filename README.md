# The Campaign Edit

A searchable archive of the women who fronted clothing-brand campaigns, by brand, year and season.
Example: search **bebe** and you'll see that Hailey Clauson fronted its Spring 2017 campaign.

## Where the data comes from

- **Recent and high-street campaigns**: added by hand from fashion press (Fashion Gone Rogue, The Impression, NYLON, The Zoe Report, models.com credits…), each with its source link.
- **Historical archive**: extracted from the career sections of female models' Wikipedia biographies (and brands' Wikipedia articles), using the article and the press article it cites as sources. Every dated entry that wasn't a simple "In 2014, she was the face of X" sentence was checked by hand.
- Entries whose source gives no year are kept with `"year": null` and shown under "Year not recorded".
- Model portraits are thumbnails from Wikimedia Commons, credited on each model page.
- Instagram and Facebook require a login and forbid automated collection, so they are not used.

Entries generated from Wikipedia carry `"via": "wikipedia"`; hand-written entries don't. Edit hand-written entries freely.

## How it works

Plain static site, no build step, deployed by Cloudflare straight from this repo.

| File | Purpose |
|---|---|
| `index.html` | Page shell (header, search box, footer) |
| `styles.css` | All styling |
| `app.js` | Loads the data and renders every page (hash routes: `#/brand/bebe`, `#/model/hailey-clauson`, `#/year/2017`, `#/search/...`) |
| `data/campaigns.json` | **The data.** Edit this to add campaigns |
| `assets/` | Campaign images (only those from credited press coverage) |

Cloudflare (Workers): build command empty, deploy command `npx wrangler deploy`. `wrangler.jsonc` serves the repo root as static files; `.assetsignore` keeps `.git`, this README and the config files off the site.

## Adding a campaign

Add one object to the `campaigns` array in `data/campaigns.json`:

```json
{
  "brand": "bebe", "year": 2017, "season": "Spring",
  "talent": ["Hailey Clauson"],
  "photographer": "optional",
  "title": "optional campaign name",
  "note": "optional one-line note",
  "images": [
    { "src": "assets/campaigns/bebe-2017-spring-1.jpg", "talent": ["Hailey Clauson"] }
  ],
  "sources": [{ "name": "Bellazon", "url": "https://…" }]
}
```

- `season`: one of `Full year` (use when only the year is known), `Resort`, `Cruise`, `Spring`, `Spring/Summer`, `Summer`, `Pre-Fall`, `Fall`, `Fall/Winter`, `Winter`, `Holiday`.
- If the brand is new, also add it to the `brands` object (country and search aliases, e.g. `"bébé"`). Search ignores accents and case.
- Always include at least one source link.
- Photos go in `assets/campaigns/`, named `brand-year-season-N.jpg`, resized to at most 1200px on the long side.
  Tag each photo with who is in it (`talent`); leave it out for group shots. A model's page shows her
  tagged photos plus group shots, and never another model's solo shot. The first photo is the cover.
- Bump `"updated"` at the top of the file.

## Local preview

The page loads JSON with `fetch`, so open it through a server rather than as a file:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```
