"""Builds data/photos.json: several photos per place, for the Discover section.

Order of preference: the catalogue photo, then Wikimedia Commons "quality", "featured" and
"valued" photos that show the place, then the photos in its Wikipedia article.
Author and licence are kept for each photo. Answers are cached in tools/.cache.

    python tools/build_photos.py
"""
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")
UA = {"User-Agent": "TravelPlannerBuild/0.1 (personal project)"}
COMMONS = "https://commons.wikimedia.org/w/api.php"
EN = "https://en.wikipedia.org/w/api.php"
MAX = 6
# photos to leave out, one Commons file name per line
SKIP = {x.strip().replace("_", " ") for x in open(os.path.join(ROOT, "tools", "photos_skip.txt"), encoding="utf-8")}
QUICK = "quick" in sys.argv      # article photos only
BAD = re.compile(r"\b(maps?|karte|mapa|carte|plan|plano|layout|diagram|logo|flag|coat|seal|stamp|coins?|topographw*|relief map|banknote|portrait|locat|locator|satellite|"
                 r"nasa|iss\d*|landsat|sentinel|chart|graph|drawing|engraving|lithograph|painting|sketch|book|manuscript|page|poster|"
                 r"sign|banner|montage|collage|bust|statuette|museum|louvre|british museum|cropped face|president|minister|icon|symbol|"
                 r"reconstruction|model|render|3d|illustration|postcard|18\d\d|19[0-4]\d)\b", re.I)


def fetch(url, pause=3.0):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest() + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    for attempt in range(20):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                data = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                data = {}
                break
            wait = int(e.headers.get("Retry-After") or 0) or 5 * (attempt + 1)
            time.sleep(min(wait, 60))
        except Exception:
            time.sleep(5 * (attempt + 1))
    else:
        raise SystemExit("no answer: " + url)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    time.sleep(pause)
    return data


def api(base, **p):
    return fetch(base + "?" + urllib.parse.urlencode(dict(p, action="query", format="json", formatversion=2)))


INFO = dict(prop="imageinfo", iiprop="size|url|mime|extmetadata", iiurlwidth=960, iiextmetadatafilter="Artist|LicenseShortName")


def clean(page):
    ii = (page.get("imageinfo") or [None])[0]
    if not ii or ii.get("mime") not in ("image/jpeg", "image/webp"):      # png is mostly maps and drawings
        return None
    name = page["title"].split(":", 1)[1]
    w, h = ii["width"], ii["height"]
    if name in SKIP or w < 900 or not 1.05 <= w / h <= 2.4 or BAD.search(re.sub(r"[_\-.,()]", " ", name)):
        return None
    em = ii.get("extmetadata", {})
    by = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", "")))).strip()[:60]
    return {"name": name, "u": ii.get("thumburl", ii["url"]).split("?")[0], "by": by or "Unknown",
            "lic": em.get("LicenseShortName", {}).get("value", ""), "src": ii.get("descriptionurl", "")}


def main():
    cat = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))
    titles = {s["id"]: urllib.parse.unquote(s["wiki"].rsplit("/wiki/", 1)[1]).replace("_", " ") for s in cat}
    qids = {}
    tl = list(titles.values())
    for i in range(0, len(tl), 40):
        q = api(EN, prop="pageprops", ppprop="wikibase_item", titles="|".join(tl[i:i + 40]))["query"]
        for p in q["pages"]:
            qids[p["title"]] = p.get("pageprops", {}).get("wikibase_item")

    # article photos first: the file lists of 50 articles per request, then file details 45 at a time
    raw = {}
    for i in range(0, len(tl), 50):
        cont = {}
        while True:
            d = api(EN, prop="images", imlimit=500, titles="|".join(tl[i:i + 50]), **cont)
            for p in d["query"]["pages"]:
                raw.setdefault(p["title"], []).extend(x["title"] for x in p.get("images", []))
            cont = d.get("continue")
            if not cont:
                break
    files = {}
    for s in cat:
        t = titles[s["id"]]
        words = [w for w in re.findall(r"[a-z]{4,}", (t + " " + s["name"]).lower())]
        ok = [f for f in dict.fromkeys(raw.get(t, [])) if re.search(r"\.(jpe?g|png|webp)$", f, re.I) and not BAD.search(re.sub(r"[_\-.,()]", " ", f))]
        # files named after the place are the safest choice
        ok.sort(key=lambda f: -sum(w in f.lower() for w in words))
        files[s["id"]] = ok[:9]
    info, every = {}, sorted({f for v in files.values() for f in v})
    for i in range(0, len(every), 45):
        q = api(COMMONS, titles="|".join(every[i:i + 45]), **INFO).get("query", {})
        norm = {x["to"]: x["from"] for x in q.get("normalized", [])}
        for p in q.get("pages", []):
            info[norm.get(p["title"], p["title"])] = clean(p)
    print("article photos ready", flush=True)

    out = {}
    for n, s in enumerate(cat, 1):
        title, quality = titles[s["id"]], []
        article = [info[f] for f in files[s["id"]] if info.get(f)]
        if qids.get(title) and not QUICK:
            q = api(COMMONS, generator="search", gsrnamespace=6, gsrlimit=20,
                    gsrsearch=f"haswbstatement:P180={qids[title]} haswbstatement:P6731=Q63348069|P6731=Q63348049|P6731=Q63348040", **INFO)
            pages = sorted(q.get("query", {}).get("pages", []), key=lambda p: p.get("index", 99))
            quality = [c for c in map(clean, pages) if c]

        hero = s.get("img", "")
        hero_name = urllib.parse.unquote(re.sub(r"^\d+px-", "", hero.rsplit("/", 1)[-1])).replace("_", " ") if hero else ""
        picks, authors, seen = [], {}, {hero_name}

        def add(c, cap):
            key = re.sub(r"[^a-z]", "", c["name"].lower())[:22]
            if c["name"] in seen or key in seen or authors.get(c["by"], 0) >= cap:
                return
            seen.update((c["name"], key))
            authors[c["by"]] = authors.get(c["by"], 0) + 1
            picks.append(c)

        # alternate award-winning photos with article photos named after the place;
        # other article photos (often people, objects, details) only fill the gaps
        words = [w for w in re.findall(r"[a-z]{4,}", (title + " " + s["name"]).lower())]
        named = [c for c in article if any(w in c["name"].lower() for w in words)]
        rest = [c for c in article if c not in named]
        pool = []
        for i in range(max(len(quality), len(named))):
            pool += quality[i:i + 1] + named[i:i + 1]
        for cap in (2, 4):
            for c in pool:
                if len(picks) < MAX - 1:
                    add(c, cap)
        for c in rest:
            if len(picks) < 3:
                add(c, 2)
        if len(picks) < 3 and not QUICK:        # few photos so far: plain search by name
            q = api(COMMONS, generator="search", gsrnamespace=6, gsrlimit=15, gsrsearch=f"{title} filetype:bitmap filew:>1600", **INFO)
            for p in sorted(q.get("query", {}).get("pages", []), key=lambda p: p.get("index", 99)):
                c = clean(p)
                if c and len(picks) < 4:
                    add(c, 2)
        out[s["id"]] = [{k: v for k, v in c.items() if k != "name"} for c in picks]
        if n % 25 == 0:
            print(n, "places", flush=True)

    with open(os.path.join(ROOT, "data", "photos.json"), "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(v, ensure_ascii=False, separators=(",", ":")) for k, v in out.items()) + "\n}\n")
    few = [k for k, v in out.items() if len(v) < 2]
    print("photos:", sum(map(len, out.values())), " places with fewer than 2 extra:", len(few), few)


main()
