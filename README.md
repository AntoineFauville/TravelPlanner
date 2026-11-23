# TravelPlanner

A life planner for two: rate the temples and places you want to see, plan holidays around your priorities, and plan a sailing tour of the world.

## Start

Double-click `start.bat` and keep its window open. It needs Python and an internet connection (the maps and photos are streamed). The page opens at http://localhost:5173.

## What is in it

- **Discover**: one place at a time with several photos, its age and its story. Pick one of five levels (keys 1 to 5: not interested, maybe, cool, interesting, must visit) and the next place comes up. Both people rate separately, and the average sets the priority. When you are through, a second round shows your Must visit places again so you can keep only the real ones. Countries with an official travel warning show "High risk zone".
- **Catalogue**: about 2,070 places, grouped by priority: temples and ancient sites, castles, cities, national parks, theme parks, zoos, festivals and big events, train journeys, regions, and spots for surfing, diving, windsurfing, kayaking, skiing and trekking. There are more of them close to home than far away. Hover a photo to rate it there.
- **Settings**: how much you want to go to each part of the world. Discover and the holiday ideas follow it.
- **Travel**: type a place or paste a list, and it is pinned on the globe. Click a pin for photos, links, notes and best months.
- **Holidays**: long weekend, 1–2 weeks or 2–3 weeks, as road, regular, city or sailing trip. Say how many days you have and how relaxed you want it. It suggests realistic trips with few bases and real driving times, with links to itineraries, tours and Google Maps. Every trip has a cost estimate for two that follows your own limits.
- **Sailing world tour**: click a country or port to read about it and add it as a must. Keep several editions, compare them, and see what each costs, which visas it needs and how much the boat may cost. You get a route, dates and duration that avoid storm seasons. It also shows which places to leave for the boat and which to fly to.

## Accounts and the shared plan

You sign in with Google, or with an email and password (the email must be confirmed). Everything you rate and plan is saved in Firebase (project `travelplanner-847e5`) and shared between the two of you: invite your partner by email in Settings. Without signing in, the site shows a plain "404" page and loads nothing.

- The very first sign-in uploads what this browser already has. Do it on the computer where you rated so far (start.bat, http://localhost:5173).
- Invite your partner before they rate: when they join, their browser takes over your plan.
- The access rules are in `firestore.rules`. Paste them in the Firebase console under Firestore Database > Rules, then Publish.
- It works offline too, and catches up when the connection is back. Settings still saves a backup file.

## Online with GitHub Pages

Push to GitHub, then in the repository: Settings > Pages > Deploy from a branch > `main`, folder `/ (root)`. The site appears at https://antoinefauville.github.io/TravelPlanner/. In Firebase, add `antoinefauville.github.io` under Authentication > Settings > Authorised domains.

Sailing results are planning estimates. Not for navigation.

## Files

| Path | What it does |
|---|---|
| `js/store.js` | Everything you enter, kept in this browser |
| `js/cloud.js` | Sign-in, the 404 page, and keeping the shared plan in Firebase |
| `firestore.rules` | Who may read and change what in Firebase |
| `js/data.js` | Loads the data and decides sail or fly |
| `js/sailplan.js` | Sailing route, calendar and best order |
| `js/holidays.js` | Holiday suggestions |
| `js/costs.js`, `js/tourcost.js` | Cost estimates and visas |
| `js/compare.js` | Comparing world tour editions |
| `tools/build_countries.py` | Prices, fuel, visas and boat fees per country |
| `js/gear.js` | Packing lists and car rules |
| `js/port.js` | The port panel in the world tour |
| `js/map.js` | Globe, pins and storm zones |
| `js/scale.js` | The five rating levels |
| `js/summary.js` | A few lines from Wikipedia, fetched only for the place on screen |
| `tools/build_wikidata.py` | Castles, theme parks, zoos, parks, cities and more from Wikidata into `data/catalog_more.json`. Run after `build_catalog.py` |
| `tools/sites_extra.txt` | Events, train journeys, regions, activity spots and castles near home |
| `tools/facts.txt` | Age, civilisation and story. Edit, then run `python tools/build_facts.py` |
| `tools/build_photos.py` | Collects the extra photos into `data/photos.json` |
| `tools/trips.txt`, `trips_road.txt`, `trips_city.txt`, `trips_sail.txt` | Holiday trips. Edit, then run `python tools/build_trips.py` |
| `tools/sites_prehistory.txt`, `tools/sites_nature.txt` | More places, with their facts |
| `tools/sites.txt` | The catalogue. Edit, then run `python tools/build_catalog.py` |
| `tools/sailing.txt` | Ports, passages and seasons. Edit, then run `python tools/build_sailing.py land-10m.json` (the file comes from the `world-atlas` npm package) |

## Data credits

NASA Blue Marble, Sentinel-2 cloudless 2016 by EOX (CC BY 4.0), OpenStreetMap via OpenFreeMap, Natural Earth, OSRM driving times, World Bank ICP price levels (CC BY 4.0), EU Weekly Oil Bulletin, visa tables from Wikipedia (CC BY-SA 4.0), and Wikipedia/Wikimedia Commons (each photo shows its author and licence), Wikidata (CC0), travel warnings from the German Federal Foreign Office and the US State Department.

Before selling this: the free place search (Nominatim), routing (OSRM) and map servers are for light use and need a paid or self-hosted replacement, and the Google-hosted fonts should be moved into the project. Photos of the places from Wikidata only link to their Commons page: their author and licence should be shown like the others.
