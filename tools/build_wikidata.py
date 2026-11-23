"""Grows the catalogue with well-known places from Wikidata: castles, theme parks,
zoos, national parks, big cities, museums, cathedrals, temples and ruins.

Popularity is the number of Wikipedia languages that have an article (sitelinks).
Places close to home need fewer languages to get in, and regions you care less
about (sub-Saharan Africa, South Asia, a little Latin America) need more, so the
catalogue gets denser the closer you get to Europe.

Writes data/catalog_more.json (compact: photos and articles are only file names).
Answers are cached in tools/.cache, delete it to fetch again.

    python tools/build_wikidata.py
"""
import hashlib
import json
import math
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")
UA = {"User-Agent": "TravelPlannerBuild/0.1 (personal project)"}
HOME = (49.967, 7.895)

# type, classes, fewest languages, how many to keep, days on site
CATS = [
    ("castle", "wd:Q23413 wd:Q751876 wd:Q57831 wd:Q16560", 12, 360, 0.5),
    ("themepark", "wd:Q2416723 wd:Q194195", 7, 90, 1),
    ("zoo", "wd:Q43501 wd:Q2281788", 8, 100, 0.5),
    ("park", "wd:Q46169", 18, 190, 2),
    ("city", "wd:Q515 wd:Q1549591 wd:Q5119 wd:Q1637706 wd:Q200250 wd:Q133442 wd:Q484170 wd:Q747074 wd:Q2074737 wd:Q262166 wd:Q3957", 110, 200, 2),
    ("museum", "wd:Q33506 wd:Q207694", 35, 80, 0.5),
    ("sacred", "wd:Q2977 wd:Q44539", 30, 110, 0.3),
    ("ancient", "wd:Q839954", 25, 120, 1),
    ("nature", "wd:Q34038", 25, 30, 0.5),
    ("landmark", "wd:Q570116 wd:Q4989906 wd:Q12518 wd:Q1440300", 45, 90, 0.3),
]
# how much a region is wanted by default (the app lets you change it later)
ZONE_WANT = {"SSF": 0.4, "SAS": 0.4, "LCN": 0.7}
PER_COUNTRY = 28                     # never more of one type in one country
NEAR = {"city": 0.3, "castle": 0.7}                # big cities matter wherever they are: home counts less
ENGLISH = {"USA": 0.3, "CAN": 0.4, "AUS": 0.4, "NZL": 0.5, "GBR": 0.6, "IRL": 0.6, "IND": 0.4, "PAK": 0.4, "PHL": 0.5, "NGA": 0.4}   # English readers favour their own cities
RISK = 0.3                           # a country with a full travel warning
SKIP = {"Wikipedia Monument", "Platonic Academy", "Poggiomarino", "Hollywood Walk of Fame", "Gorky Park", "Pripyat amusement park", "City of Space"}


def fetch(url, tries=8):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "wd-" + hashlib.sha1(url.encode()).hexdigest()[:16] + ".json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                data = json.load(r)
            json.dump(data, open(path, "w", encoding="utf-8"))
            time.sleep(2 if "sparql" in url else 0.3)
            return data
        except Exception as e:
            wait = int(getattr(e, "headers", None) and e.headers.get("Retry-After") or 0) or 10 * (i + 1)
            print("  waiting", wait, "s:", e)
            time.sleep(min(90, wait))
    raise SystemExit("no answer from " + url[:80])


def sparql(classes, floor):
    q = f"""SELECT ?item ?label ?desc ?coord ?sl ?cc ?cname ?img ?article ?inc WHERE {{
  VALUES ?cls {{ {classes} }}
  ?item wdt:P31 ?cls; wikibase:sitelinks ?sl; wdt:P625 ?coord.
  FILTER(?sl >= {floor})
  FILTER NOT EXISTS {{ ?item wdt:P576 [] }}
  ?item rdfs:label ?label FILTER(lang(?label) = "en")
  OPTIONAL {{ ?item schema:description ?desc FILTER(lang(?desc) = "en") }}
  OPTIONAL {{ ?item wdt:P17 ?c. ?c rdfs:label ?cname FILTER(lang(?cname) = "en") OPTIONAL {{ ?c wdt:P298 ?cc }} }}
  OPTIONAL {{ ?item wdt:P18 ?img }}
  OPTIONAL {{ ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }}
  OPTIONAL {{ ?item wdt:P571 ?inc }}
}}"""
    return fetch("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q))["results"]["bindings"]


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def months(lat):
    a = abs(lat)
    if a < 23:
        return []
    m = [6, 7, 8] if a > 56 else [5, 6, 7, 8, 9] if a > 45 else [4, 5, 6, 9, 10] if a > 34 else [3, 4, 10, 11]
    return m if lat > 0 else sorted((x + 5) % 12 + 1 for x in m)


# Approximate start years for well-known sites where Wikidata has no usable date (negative = BC)
YEARS = {
    "Schwerin Castle": 973, "Bergpark Wilhelmshöhe": 1696, "Thracian Tomb of Kazanlak": -350, "Royal Palace of Aranjuez": 1564,
    "Museo di Capodimonte": 1738, "Heliopolis": -3000, "Lala Mustafa Pasha Mosque": 1298, "Temple of Heaven": 1420,
    "Saint Sophia Cathedral": 1209, "Bayon": 1190, "Pashupatinath Temple": 400, "Hedeby": 770, "Djemila": 96, "Thermopylae": -480,
    "Avebury": -2850, "Birka": 750, "Carnuntum": 6, "Sardis": -700, "Maison Carrée": 2, "Pella": -400, "Tiryns": -1400,
    "Sirmium": -100, "Philippi": -356, "Abu Mena": 350, "Alesia": -52, "Igel Column": 250, "Veii": -900, "Kerkouane": -600,
    "Stari Ras": 900, "M'zab": 1012, "Hill of Tara": -3000, "Köneürgenç": 1000, "Sammallahdenmäki": -1500, "Dorestad": 600,
    "Tanis": -1070, "Bethsaida": -1000, "Offa's Dyke": 785, "Stabiae": -700, "Abusir": -2450, "Mozia": -800,
    "Colonia Iulia Urbs Triumphalis Tarraco": -218, "Cannae": -216, "Myra": -500, "Gordion": -900, "Esna": -180, "Biskupin": -738,
    "Gorham's Cave": -55000, "Bubastis": -2500, "Nemea": -573, "Roman amphitheatre of Durrës": 100, "Theatre of Thorikos": -500,
    "Heraion of Samos": -800, "Nisa": -250, "Ajloun": 1184, "Abydos": -700, "Gamla Uppsala": 500, "Herakleopolis Magna": -2160,
    "Porta Maggiore": 52, "Avaris": -1800, "Maes Howe": -2800, "Nekhen": -3500, "Sounion": -440, "Cyzicus": -675,
    "Laodicea on the Lycus": -261, "Kültepe": -2000, "Oxyrhynchus": -300, "Urquhart Castle": 1230, "Vulci": -800, "Viminacium": 50,
    "Phocaea": -900, "Mantineia": -500, "Assos": -900, "Aqua Claudia": 38, "Ramesseum": -1270, "Derinkuyu underground city": -800,
    "Thyatira": -290, "Calydon": -800, "Beni Hasan": -2000, "Metapontum": -680, "Naucratis": -650, "Alacahöyük": -2500,
    "Smyrna": -3000, "Zakros": -1900, "Zubarah": 1765, "Heraclea Minoa": -500, "Aspendos": -500, "Kasubi Tombs": 1882, "Milad Tower": 2007,
    # cities whose Wikidata date is missing or tells another story (a conquest, a charter)
    "Istanbul": -660, "Cologne": 50, "Barcelona": -15, "Florence": -59, "Naples": -600, "New York City": 1624, "Tokyo": 1457,
    "Singapore": 1819, "Hong Kong": 1841, "Tel Aviv": 1909, "Dubai": 1833, "Macau": 1557, "Vatican City": 1929, "Athens": -1400,
}


def dates(qids):
    """founding date, start date or first written record, when Wikidata has one: {qid: year}"""
    out = {}
    for i in range(0, len(qids), 300):
        q = """SELECT ?item ?inc ?st ?rec WHERE { VALUES ?item { %s }
  OPTIONAL { ?item wdt:P571 ?inc } OPTIONAL { ?item wdt:P580 ?st } OPTIONAL { ?item wdt:P1249 ?rec } }""" % " ".join("wd:" + x for x in qids[i:i + 300])
        for b in fetch("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q))["results"]["bindings"]:
            for k in ("inc", "st", "rec"):
                m = re.match(r"(-?)0*(\d+)-", b.get(k, {}).get("value", ""))
                if m:
                    y, qid = (-int(m[2]) if m[1] else int(m[2])), b["item"]["value"].rsplit("/", 1)[1]
                    out[qid] = min(y, out.get(qid, y))
    return out


def readers(titles):
    """English Wikipedia readers over the last 60 days, 50 articles per request: how many people care about a city"""
    out = {}
    titles = sorted({t for t in titles if t})
    for i in range(0, len(titles), 50):
        part = titles[i:i + 50]
        q = fetch("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "query", "format": "json", "formatversion": 2, "prop": "pageviews", "pvipdays": 60, "redirects": 1, "titles": "|".join(part)}))["query"]
        alias = {r["from"]: r["to"] for k in ("normalized", "redirects") for r in q.get(k, [])}
        got = {pg["title"]: sum(v or 0 for v in (pg.get("pageviews") or {}).values()) for pg in q["pages"]}
        for t in part:
            x = t
            for _ in range(3):
                x = alias.get(x, x)
            out[t] = got.get(x, 0)
    return out


COUNTRY = {"People's Republic of China": "China", "Kingdom of the Netherlands": "Netherlands", "Czech Republic": "Czechia",
           "State of Palestine": "Palestine", "Kingdom of Denmark": "Denmark", "Republic of Ireland": "Ireland",
           "Vatican City": "Italy", "Jersey": "United Kingdom", "Republic of China": "Taiwan", "West Bank": "Palestine",
           "East Germany": "Germany", "Byzantine Empire": "Turkey", "United Kingdom of Israel": "Palestine", "Soviet Union": "Ukraine"}


def words(s):
    return {w for w in re.findall(r"[a-z]{4,}", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower())
            if w not in {"castle", "palace", "national", "park", "museum", "cathedral", "temple", "city", "church", "zoo", "the"}}


def main():
    zones = {c["id"]: c["region"]["id"] for c in fetch("https://api.worldbank.org/v2/country?format=json&per_page=400")[1]}
    names = json.load(open(os.path.join(ROOT, "data", "countries.json"), encoding="utf-8"))["names"]
    aa = fetch("https://www.auswaertiges-amt.de/opendata/travelwarning")["response"]
    danger = {v["iso3CountryCode"] for v in aa.values() if isinstance(v, dict) and v.get("warning")}
    old = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))
    region_of = {}
    for s in old:                                        # reuse the catalogue's region names per country
        region_of.setdefault(s["country"], {}).setdefault(s["region"], 0)
        region_of[s["country"]][s["region"]] += 1
    region_of = {c: max(r, key=r.get) for c, r in region_of.items()}
    old_wiki = {urllib.parse.unquote(s["wiki"].rsplit("/", 1)[1]).replace("_", " ") for s in old if s.get("wiki")}
    kept = [(s["lat"], s["lon"], words(s["name"]), s["type"] == "city") for s in old]
    ids = {s["id"] for s in old}

    picks = []
    for kind, classes, floor, keep, days in CATS:
        rows = sparql(classes, floor)
        items = {}
        for b in rows:
            qid = b["item"]["value"].rsplit("/", 1)[1]
            if qid in items and ("cc" in items[qid] or "cc" not in b):    # prefer today's country over Ancient Rome
                continue
            m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", b["coord"]["value"])
            if not m:
                continue
            items[qid] = b | {"lat": float(m[2]), "lon": float(m[1])}
        art_of = lambda b: urllib.parse.unquote(b["article"]["value"].rsplit("/", 1)[1]).replace("_", " ") if "article" in b else ""
        seen = readers([art_of(b) for b in items.values()]) if kind == "city" else {}
        scored = []
        for qid, b in items.items():
            lat, lon = b["lat"], b["lon"]
            cname = b.get("cname", {}).get("value", "")
            if cname in COUNTRY:
                b["cname"]["value"] = cname = COUNTRY[cname]
            iso = b.get("cc", {}).get("value", "") or names.get(cname, "")
            d = km(HOME, (lat, lon))
            want = ZONE_WANT.get(zones.get(iso, ""), 1) * (RISK if iso in danger else 1)
            pop = int(b["sl"]["value"])
            if kind == "city":                                  # languages say little about cities
                pop = seen.get(art_of(b), 0) / 3000 * ENGLISH.get(iso, 1)
            score = pop / (1 + d / 900) ** NEAR.get(kind, 0.55) * want
            scored.append((score, qid, b, iso))
        scored.sort(reverse=True)
        per, n = {}, 0
        for score, qid, b, iso in scored:
            if n >= keep:
                break
            name = b["label"]["value"]
            lat, lon = round(b["lat"], 4), round(b["lon"], 4)
            art = urllib.parse.unquote(b["article"]["value"].rsplit("/", 1)[1]).replace("_", " ") if "article" in b else ""
            if art and art in old_wiki or re.match(r"Q\d+$", name) or name in SKIP:
                continue
            w = words(name)
            if re.search(r"Gallery|Museum", name) and kind == "castle":
                continue
            # the same place twice: close by with a shared name word, or right on top (cities only clash with cities)
            city = kind == "city"
            if any(k[3] == city and abs(k[0] - lat) < 0.2 and km((lat, lon), k[:2]) < (15 if w & k[2] else 3 if city else 1.2) for k in kept):
                continue
            if per.get(iso, 0) >= PER_COUNTRY:
                continue
            per[iso] = per.get(iso, 0) + 1
            sid = slug(name)
            if sid in ids:
                sid = slug(f"{name} {b.get('cname', {}).get('value', '')}")
            if sid in ids:
                continue
            ids.add(sid)
            kept.append((lat, lon, w, kind == "city"))
            old_wiki.add(art)
            country = b.get("cname", {}).get("value", "")
            sl = int(b["sl"]["value"])
            p = {"id": sid, "name": name, "country": country, "type": kind,
                 "region": region_of.get(country, country), "days": 3 if kind == "city" and sl > 160 else days,
                 "lat": lat, "lon": lon, "q": qid, "n": sl}
            mo = months(lat)
            if mo:
                p["months"] = mo
            if "desc" in b:
                p["why"] = b["desc"]["value"][:1].upper() + b["desc"]["value"][1:] + "."
            if art:
                p["w"] = art
            if "img" in b:
                p["f"] = urllib.parse.unquote(b["img"]["value"].rsplit("/", 1)[1])
            inc = re.match(r"(-?)0*(\d+)-", b.get("inc", {}).get("value", ""))
            if inc and kind != "city":
                p["year"] = -int(inc[2]) if inc[1] else int(inc[2])
            picks.append(p)
            n += 1
        print(f"{kind:10} {len(items):5} found, {n} kept")

    # a year for the timeline: from Wikidata, else from the list above (city founding dates only when old)
    found = dates([p["q"] for p in picks if "year" not in p])
    for p in picks:
        y = found.get(p["q"])
        if "year" not in p and p["name"] in YEARS:
            p["year"] = YEARS[p["name"]]
        if "year" not in p and y is not None and (p["type"] != "city" or y < 1500):
            p["year"] = y
    print(sum("year" in p for p in picks), "of", len(picks), "have a year")
    with open(os.path.join(ROOT, "data", "catalog_more.json"), "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(p, ensure_ascii=False, separators=(",", ":")) for p in picks) + "\n]\n")
    print(len(picks), "places written,", len(old) + len(picks), "in all")


main()
