# TravelPlanner

A life planner for two: rate the temples and places you want to see, plan holidays around your priorities, and plan a sailing tour of the world.

## Start

Double-click `start.bat` and keep its window open. It needs Python and an internet connection (the maps and photos are streamed). The page opens at http://localhost:5173.

## What is in it

- **Discover**: one place at a time with several photos, its age and its story. Pick one of four levels (keys 1 to 4) and the next place comes up. Both people rate separately, and the average sets the priority.
- **Catalogue**: all 247 places, grouped by priority. Hover a photo to rate it there.
- **Travel**: type a place or paste a list, and it is pinned on the globe. Click a pin for photos, links, notes and best months.
- **Holidays**: say how many days you have and see which trips fit, best first.
- **Sailing**: click countries to get a route, dates and duration that avoid storm seasons. It also shows which places to leave for the boat and which to fly to.

Ratings are saved in the browser. Use Settings to save a backup file.

Sailing results are planning estimates. Not for navigation.

## Files

| Path | What it does |
|---|---|
| `js/store.js` | Everything you enter. The only file to change for Firebase. |
| `js/data.js` | Loads the data and decides sail or fly |
| `js/sailplan.js` | Sailing route, calendar and best order |
| `js/holidays.js` | Holiday suggestions |
| `js/map.js` | Globe, pins and storm zones |
| `js/scale.js` | The four rating levels |
| `tools/facts.txt` | Age, civilisation and story. Edit, then run `python tools/build_facts.py` |
| `tools/build_photos.py` | Collects the extra photos into `data/photos.json` |
| `tools/sites.txt` | The catalogue. Edit, then run `python tools/build_catalog.py` |
| `tools/sailing.txt` | Ports, passages and seasons. Edit, then run `python tools/build_sailing.py land-10m.json` (the file comes from the `world-atlas` npm package) |

## Data credits

NASA Blue Marble, Sentinel-2 cloudless 2016 by EOX (CC BY 4.0), OpenStreetMap via OpenFreeMap, Natural Earth, and Wikipedia/Wikimedia Commons (each photo shows its author and licence).

Before selling this: the free place search (Nominatim) and map servers are for light use and need a paid or self-hosted replacement, and the Google-hosted fonts should be moved into the project.
