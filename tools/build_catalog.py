"""Builds data/catalog.json from tools/sites.txt.

Coordinates and photos come from Wikipedia / Wikimedia Commons (photo author and
licence are kept, because they must be credited). Run again after editing sites.txt:

    python tools/build_catalog.py
"""
import html
import json
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://en.wikipedia.org/w/api.php"
UA = {"User-Agent": "TravelPlannerBuild/0.1 (personal project)"}

# Used when Wikipedia has no coordinates, or they point at the wrong spot.
COORDS = {
    "Moai": (-27.1257, -109.2769), "Galápagos Islands": (-0.75, -90.31), "Bukhara": (39.775, 64.415),
    "Antarctic Peninsula": (-64.8, -62.9), "Great Barrier Reef": (-16.9, 146.2), "Golden Circle (Iceland)": (64.3136, -20.2995),
    "Guna Yala": (9.57, -78.85), "Maldives": (4.17, 73.51), "Samoa": (-13.75, -171.8), "Pitons (Saint Lucia)": (13.807, -61.067),
    "Svalbard": (78.22, 15.65), "Borgund Stave Church": (61.047, 7.812), "Socotra": (12.51, 53.92),
    "Okavango Delta": (-19.3, 22.9), "Serengeti National Park": (-2.33, 34.83), "Raja Ampat Islands": (-0.56, 130.65),
    "Haida Gwaii": (53.0, -132.0), "Vallée de Mai": (-4.33, 55.738), "Mỹ Sơn": (15.7633, 108.1241),
    "Hạ Long Bay": (20.9, 107.1), "Terracotta Army": (34.3847, 109.2733),
    "Petra": (30.3285, 35.4444), "Ani": (40.5075, 43.5728), "Lumbini": (27.4692, 83.2758),
    "Itsukushima Shrine": (34.2960, 132.3198), "Nelson's Dockyard": (17.0072, -61.7640), "Isle of Pines (New Caledonia)": (-22.6167, 167.4833),
    "Great Mosque of Kairouan": (35.6817, 10.1042), "Tsingy de Bemaraha National Park": (-18.75, 44.75),
    "Tana Toraja Regency": (-2.97, 119.90), "Haʻamonga ʻa Maui": (-21.1367, -175.0481),
}
# Wikipedia article to take the photo from, when the main one has a map or logo.
PHOTO_FROM = {
    "Hawaii (island)": "Kīlauea", "Samoa": "To-Sua Ocean Trench", "Maldives": "Tourism in the Maldives",
    "Haida Gwaii": "SGang Gwaay", "Great Barrier Reef": "Whitsunday Islands", "Pico Island": "Mount Pico",
    "Göreme": "Cappadocia", "Knossos": "Minoan palaces", "Old Havana": "Havana", "Nuku Hiva": "Ua Pou",
    "Bora Bora": "Mount Otemanu", "Fakarava": "Rangiroa", "Yasawa Islands": "Yasawa", "Saint Helena": "Jamestown, Saint Helena",
    "Madeira": "Pico Ruivo", "São Nicolau, Cape Verde": "Santo Antão, Cape Verde", "Antarctic Peninsula": "Paradise Harbor",
    "Socotra": "Dracaena cinnabari", "Bwindi Impenetrable National Park": "Mountain gorilla", "Rarotonga": "Muri, Cook Islands",
    "Ayutthaya Historical Park": "Wat Chaiwatthanaram", "Raja Ampat Islands": "Wayag", "Kinabalu Park": "Mount Kinabalu",
    "Vallée de Mai": "La Digue", "Cusco": "Sacsayhuamán", "Cartagena, Colombia": "Castillo San Felipe de Barajas",
    "Isle of Pines (New Caledonia)": "Isle of Pines (New Caledonia)", "Svalbard": "Polar bear", "Hegra (Mada'in Salih)": "Qasr al-Farid",
    "Ellora Caves": "Kailasa Temple, Ellora", "Palenque": "Temple of the Inscriptions", "Piton de la Fournaise": "Cirque de Mafate",
}

# Exact Wikimedia Commons file, for the few places where the article photo is poor.
PHOTO_FILE = {
    "Samoa": "To Sua Ocean Trench, Upolu, Samoa - August 2016.jpg", "Maldives": "Guriadhoo-2019-aerial-view-Luka-Peternel.jpg",
    "Great Barrier Reef": "Whitehaven Beach - Northern End.jpg", "Nuku Hiva": "Hatiheu Bay, Nuku Hiva (French Polynesia).jpg",
    "Fakarava": "Fakarava - Lagon plage Ohavana.jpg", "São Nicolau, Cape Verde": "Xôxô Ribeira da Torre valley Santo Antão, Cabo Verde.jpg",
    "Rarotonga": "Maina Island, Aitutaki Lagoon, Cook Islands.jpg", "Raja Ampat Islands": "Wayag Island, Raja Ampat (14467281965).jpg",
    "Palenque": "Temple of Inscriptions, Palenque (2088170629).jpg", "Ellora Caves": "Ellora Cave 16 Kailasa Temple.jpg",
    "Hegra (Mada'in Salih)": "Qasr al Farid.JPG",
}


def get(params):
    params = dict(params, format="json", formatversion="2")
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers=UA)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as e:  # rate limit or network hiccup
            print("  retry:", e)
            time.sleep(4 * (attempt + 1))
    raise SystemExit("Wikipedia did not answer")


def months(spec):
    out = set()
    for part in spec.split(","):
        a, _, b = part.partition("-")
        a, b = int(a), int(b or a)
        m = a
        while True:
            out.add(m)
            if m == b:
                break
            m = m % 12 + 1
    return sorted(out)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def pages_for(titles):
    """title -> page (following redirects), batched."""
    found = {}
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        q = get({"action": "query", "prop": "coordinates|pageimages", "piprop": "thumbnail|name", "pithumbsize": 500,
                 "pilimit": 50, "colimit": 500, "redirects": 1, "titles": "|".join(chunk)})["query"]
        alias = {}
        for k in ("normalized", "redirects"):
            for r in q.get(k, []):
                alias[r["from"]] = r["to"]
        by = {p["title"]: p for p in q["pages"]}
        for t in chunk:
            x = t
            for _ in range(4):
                x = alias.get(x, x)
            found[t] = by.get(x, {"missing": True})
    return found


def credits_for(files):
    out = {}
    files = sorted(set(files))
    for i in range(0, len(files), 40):
        q = get({"action": "query", "prop": "imageinfo", "iiprop": "extmetadata|url",
                 "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl",
                 "titles": "|".join("File:" + f for f in files[i:i + 40])})["query"]
        for p in q["pages"]:
            ii = (p.get("imageinfo") or [{}])[0]
            em = ii.get("extmetadata", {})
            artist = html.unescape(re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", ""))).strip()
            artist = re.sub(r"\s+", " ", artist)[:60]
            out[p["title"][5:].replace("_", " ")] = {
                "by": artist or "Unknown", "lic": em.get("LicenseShortName", {}).get("value", ""),
                "src": ii.get("descriptionurl", "")}
    return out


def main():
    rows = []
    with open(os.path.join(ROOT, "tools", "sites.txt"), encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            p = line.split("|")
            if len(p) != 9:
                raise SystemExit(f"sites.txt line {n}: expected 9 fields, got {len(p)}: {line[:60]}")
            rows.append(p)

    titles = [r[0] for r in rows]
    pages = pages_for(titles)
    photos = pages_for(list(PHOTO_FROM.values()))
    imgs = {}
    for t in titles:
        src = photos.get(PHOTO_FROM.get(t)) if t in PHOTO_FROM else None
        if not (src or {}).get("pageimage"):
            src = pages[t]
        imgs[t] = (src.get("pageimage", "").replace("_", " "), (src.get("thumbnail") or {}).get("source", "").split("?")[0])
    if PHOTO_FILE:
        q = get({"action": "query", "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 500,
                 "titles": "|".join("File:" + f for f in PHOTO_FILE.values())})["query"]
        thumbs = {p["title"][5:]: p["imageinfo"][0]["thumburl"].split("?")[0] for p in q["pages"] if p.get("imageinfo")}
        for t, f in PHOTO_FILE.items():
            if f in thumbs:
                imgs[t] = (f, thumbs[f])
            else:
                print("NO SUCH FILE  ", f)
    cred = credits_for([i[0] for i in imgs.values() if i[0]])

    out, ids = [], set()
    for title, name, country, kind, region, days, when, why, flags in rows:
        pg = pages[title]
        c = COORDS.get(title) or next(((x["lat"], x["lon"]) for x in pg.get("coordinates", [])), None)
        if pg.get("missing"):
            print("MISSING PAGE ", title)
        if not c:
            print("NO COORDINATES", title)
            continue
        fname, url = imgs[title]
        if not url:
            print("NO PHOTO      ", title)
        sid = slug(name or title)
        if sid in ids:
            raise SystemExit("duplicate id " + sid)
        ids.add(sid)
        s = {"id": sid, "name": name or title, "country": country, "type": kind, "region": region, "days": float(days),
             "months": months(when), "why": why, "lat": round(c[0], 4), "lon": round(c[1], 4),
             "wiki": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(pg.get("title", title).replace(" ", "_"))}
        if url:
            s["img"] = url
            s["credit"] = cred.get(fname, {})
        if "w" in flags:
            s["advice"] = True
        if "S" in flags:
            s["force"] = "sail"
        if "F" in flags:
            s["force"] = "fly"
        out.append(s)

    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "catalog.json"), "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(s, ensure_ascii=False) for s in out) + "\n]\n")
    print(len(out), "places written,", sum("img" in s for s in out), "with photos")


main()
