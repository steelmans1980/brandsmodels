# The Campaign Edit

A searchable archive of the women who fronted clothing-brand campaigns, by brand, year and season.
Example: search **bebe** and you'll see that Hailey Clauson fronted its Spring 2017 campaign.

## How it works

Plain static site, no build step, deployed by Cloudflare Pages straight from this repo.

| File | Purpose |
|---|---|
| `index.html` | Page shell (header, search box, footer) |
| `styles.css` | All styling |
| `app.js` | Loads the data and renders every page (hash routes: `#/brand/bebe`, `#/model/hailey-clauson`, `#/year/2017`, `#/search/...`) |
| `data/campaigns.json` | **The data.** Edit this to add campaigns |
| `assets/` | Campaign images (only those from credited press coverage) |

Cloudflare Pages settings: framework preset **None**, build command empty, output directory `/`.

## Adding a campaign

Add one object to the `campaigns` array in `data/campaigns.json`:

```json
{
  "brand": "bebe", "year": 2017, "season": "Spring",
  "talent": ["Hailey Clauson"],
  "photographer": "optional",
  "title": "optional campaign name",
  "note": "optional one-line note",
  "image": "optional, e.g. assets/bebe-ss17.jpg",
  "sources": [{ "name": "Bellazon", "url": "https://…" }]
}
```

- `season`: one of `Full year` (use when only the year is known), `Resort`, `Cruise`, `Spring`, `Spring/Summer`, `Summer`, `Pre-Fall`, `Fall`, `Fall/Winter`, `Winter`, `Holiday`.
- If the brand is new, also add it to the `brands` object (country and search aliases, e.g. `"bébé"`). Search ignores accents and case.
- Always include at least one source link.
- Bump `"updated"` at the top of the file.

## Local preview

The page loads JSON with `fetch`, so open it through a server rather than as a file:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```
