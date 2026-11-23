"""Builds data/trips.json from tools/trips.txt: which places each base reaches, and real driving
hours between bases and to the day trips (OpenStreetMap roads, OSRM public server).

    python tools/build_trips.py
"""
import hashlib
import json
import re
import unicodedata
import math
import os
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")
# across a border, or no sensible way from that base
SKIP = {("Jordan: Petra and the desert", x) for x in ("Ancient Jericho", "Old City of Jerusalem", "Masada")} | {
    ("Northern Greece: Meteora, Vergina and Zagori", "Butrint"), ("Albania and Ohrid", "Vikos gorge & Zagori"),
    ("Angkor and the lost Khmer cities", "Phanom Rung & Phimai"), ("Belize: Maya and the reef", "Yaxhá"),
    ("Corsica by ferry", "Giants' tombs of Sardinia"), ("Albania, Ohrid and the Albanian Alps", "Vikos gorge & Zagori"),
    ("Northern Greece and the Peloponnese by ferry", "Butrint"), ("Plitvice, Velebit and Krk", "Pula"), ("Istria and the Kvarner islands", "Škocjan & Postojna caves"),
    ("Jungfrau and Aletsch", "Matterhorn & Zermatt"), ("Peru: Choquequirao trek", "Machu Picchu & Sacred Valley"),
    ("Rwanda and Uganda: gorillas", "Rwenzori, Mountains of the Moon")}
SERVER = "https://router.project-osrm.org/table/v1/driving/"


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def km(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def table(points):
    url = SERVER + ";".join(f"{lo:.4f},{la:.4f}" for la, lo in points) + "?annotations=duration,distance"
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "osrm-" + hashlib.md5(url.encode()).hexdigest() + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "TravelPlannerBuild/0.1 (personal project)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
            break
        except Exception as e:
            print("  retry", e, flush=True)
            time.sleep(4 * (attempt + 1))
    else:
        return None
    d = {"t": d["durations"], "d": d["distances"], "snap": [x.get("distance", 0) for x in d["sources"]]}
    json.dump(d, open(path, "w"))
    time.sleep(1.5)
    return d


# where you may start by car
HOMES = {"Bingen am Rhein": (49.967, 7.895), "Aachen": (50.776, 6.084), "Berlin": (52.520, 13.405), "Bremen": (53.079, 8.802), "Cologne": (50.938, 6.960), "Dortmund": (51.514, 7.465),
         "Dresden": (51.050, 13.738), "Düsseldorf": (51.228, 6.774), "Frankfurt": (50.110, 8.682), "Freiburg": (47.999, 7.842), "Hamburg": (53.551, 9.994),
         "Hanover": (52.376, 9.732), "Karlsruhe": (49.007, 8.404), "Kassel": (51.313, 9.498), "Leipzig": (51.340, 12.373), "Mannheim": (49.487, 8.466),
         "Munich": (48.137, 11.575), "Münster": (51.961, 7.626), "Nuremberg": (49.452, 11.077), "Saarbrücken": (49.240, 6.997), "Stuttgart": (48.776, 9.183), "Ulm": (48.401, 9.988)}


def home_table(points):
    """hours and km from every home city to every point, and back"""
    hs = list(HOMES.values())
    out = [{} for _ in points]
    for i in range(0, len(points), 70):
        part = points[i:i + 70]
        m = table(hs + part)
        n = len(hs)
        for k in range(len(part)):
            for j, h in enumerate(HOMES):
                a, b = m["t"][j][n + k], m["t"][n + k][j]
                if a is not None and b is not None and m["snap"][n + k] < 8000:
                    out[i + k][h] = [round(a / 3600, 1), round(m["d"][j][n + k] / 1000), round(b / 3600, 1), round(m["d"][n + k][j] / 1000)]
    return out


def atlas():
    """function (lat, lon) -> country name, nearest coast if the point is in the water"""
    path = os.path.join(CACHE, "countries-50m.json")
    if not os.path.exists(path):
        urllib.request.urlretrieve("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json", path)
    d = json.load(open(path, encoding="utf-8"))
    (sx, sy), (tx, ty) = d["transform"]["scale"], d["transform"]["translate"]
    arcs = []
    for a in d["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    rings = []
    for g in d["objects"]["countries"]["geometries"]:
        for poly in (g.get("arcs") or []) if g["type"] == "MultiPolygon" else [g.get("arcs") or []]:
            pts = []
            for i in poly[0] if poly else []:
                seg = arcs[i] if i >= 0 else arcs[~i][::-1]
                pts += seg if not pts else seg[1:]
            if pts:
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                rings.append((g["properties"]["name"], pts, min(xs), max(xs), min(ys), max(ys)))

    def where(lat, lon):
        for n, pts, x0, x1, y0, y1 in rings:
            if x0 <= lon <= x1 and y0 <= lat <= y1:
                inside, j = False, len(pts) - 1
                for i in range(len(pts)):
                    (xi, yi), (xj, yj) = pts[i], pts[j]
                    if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                        inside = not inside
                    j = i
                if inside:
                    return n
        best = None
        for n, pts, x0, x1, y0, y1 in rings:
            if x0 - 3 <= lon <= x1 + 3 and y0 - 3 <= lat <= y1 + 3:
                for x, y in pts:
                    q = (x - lon) ** 2 + (y - lat) ** 2
                    if best is None or q < best[0]:
                        best = (q, n)
        return best[1] if best else None

    return where


def months(spec):
    out = set()
    for part in spec.split(","):
        a, _, b = part.partition("-")
        a, b = int(a), int(b or a)
        while True:
            out.add(a)
            if a == b:
                break
            a = a % 12 + 1
    return sorted(out)


def main():
    cat = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))
    cat += json.load(open(os.path.join(ROOT, "data", "catalog_more.json"), encoding="utf-8"))
    by_name = {}
    for s in cat:
        by_name.setdefault(s["name"], s)
    trips = []

    def lines(fname):
        for n, line in enumerate(open(os.path.join(ROOT, "tools", fname), encoding="utf-8"), 1):
            line = line.strip()
            if line and not line.startswith("#"):
                yield f"{fname} line {n}", line.split("|")

    def base(where, p):
        la, lo = map(float, p[2].split(","))
        ideal, least = map(int, p[3].split("/"))
        how, _, h = p[4].partition(" ")
        far = [x for x in (p[5].split(";") if len(p) > 5 else []) if x]
        for x in far:
            if x not in by_name:
                raise SystemExit(f"{where}: no place called {x}")
        b = {"name": p[1], "lat": la, "lon": lo, "nights": ideal, "min": least, "by": how, "h": float(h) if h else 0, "far": far}
        if len(p) > 6 and p[6]:
            b["tip"] = p[6]
        return b

    for where, p in lines("trips.txt"):
        if p[0] == "T":
            trips.append({"kind": "regular", "title": p[1], "search": p[2], "months": months(p[3]), "end": p[4], "bases": []})
        else:
            trips[-1]["bases"].append(base(where, p))
    for where, p in lines("trips_road.txt"):
        if p[0] == "R":
            trips.append({"kind": "road", "title": p[1], "search": p[2], "months": months(p[3]), "end": "home", "countries": p[4].split(","),
                          "tags": [x for x in p[5].split(",") if x], "why": p[6], "bases": []})
        else:
            trips[-1]["bases"].append(base(where, p))
    for where, p in lines("trips_city.txt"):
        la, lo = map(float, p[2].split(","))
        ideal, least = map(int, p[3].split("/"))
        trips.append({"kind": "city", "title": p[1], "search": p[1] + " city trip", "months": months(p[4]), "end": "open",
                      "bases": [{"name": p[1], "lat": la, "lon": lo, "nights": ideal, "min": least, "by": "-", "h": 0, "far": [], "tip": p[5]}]})
    for t in trips:
        if t["kind"] == "regular" and len(t["bases"]) >= 3 and all(b["by"] in ("-", "drive") for b in t["bases"]):
            t["rental"] = True          # a road trip with a rented car

    for t in trips:
        taken = {}
        for i, b in enumerate(t["bases"]):
            for x in b.pop("far"):
                taken[x] = (-1, i)
        for s in cat:
            if s["name"] in taken or (t["title"], s["name"]) in SKIP:
                continue
            for i, b in enumerate(t["bases"]):
                d = km((b["lat"], b["lon"]), (s["lat"], s["lon"]))
                if d <= (25 if t["kind"] == "city" else 75) and (s["name"] not in taken or d < taken[s["name"]][0]):
                    taken[s["name"]] = (d, i)
        # many places around a base: keep the hand-picked ones and the best known (the road table has a size limit)
        for i in range(len(t["bases"])):
            near = [x for x in taken if taken[x][1] == i and taken[x][0] >= 0]
            near.sort(key=lambda x: ("n" in by_name[x], -by_name[x].get("n", 0), taken[x][0]))
            for x in near[24:]:
                del taken[x]
        pts = [(b["lat"], b["lon"]) for b in t["bases"]]
        order = sorted(taken)
        pts += [(by_name[x]["lat"], by_name[x]["lon"]) for x in order]
        m = table(pts) if len(pts) > 1 else None
        nb = len(t["bases"])
        for i, b in enumerate(t["bases"]):
            b["places"] = []
            if i and b["by"] == "drive" and not b["h"]:
                sec = m and m["t"][i - 1][i]
                straight = km(pts[i - 1], pts[i])
                b["h"] = round(sec / 3600, 1) if sec else round(straight / 55, 1)
                b["km"] = round(m["d"][i - 1][i] / 1000) if sec else round(straight * 1.3)
        for k, x in enumerate(order):
            i = taken[x][1]
            straight = km(pts[i], pts[nb + k])
            sec = m["t"][i][nb + k] if m else None
            # no road near the place (islands, mountains): do not pretend to know the drive
            ok = sec is not None and sec > 0 and m["snap"][nb + k] < 6000 and (straight < 5 or sec / 3600 < straight / 12 + 1)
            h = round(sec / 3600, 1) if ok else None
            if h is not None and h > 3.2 and taken[x][0] >= 0:
                continue
            t["bases"][i]["places"].append({"id": by_name[x]["id"], "h": h, "km": round(m["d"][i][nb + k] / 1000) if ok else round(straight)})
        if t["end"] == "back" and nb > 1 and t["kind"] == "regular":
            sec = m and m["t"][nb - 1][0]
            b = t["bases"][-1]
            t["backBy"] = "drive"
            t["backH"] = round(sec / 3600, 1) if sec else round(km(pts[nb - 1], pts[0]) / 60, 1)
            if t["backH"] > 6 or b["by"] in ("fly", "train", "boat"):
                t["backBy"] = b["by"] if b["by"] != "drive" else "fly"
                t["backH"] = b["h"] if b["by"] != "drive" else 2
        for b in t["bases"]:
            b["places"].sort(key=lambda x: (x["h"] if x["h"] is not None else 1.5))
        long = [] if t["kind"] == "city" else [f'{b["name"]} {b["h"]}h' for b in t["bases"] if b["by"] == "drive" and b["h"] > 5]
        if long or (t["kind"] == "regular" and not any(b["places"] for b in t["bases"])):
            print(t["title"], "| long drives:", long, "| places:", sum(len(b["places"]) for b in t["bases"]), flush=True)
    # the way from home and back, for road trips and for cities you could drive to
    first = [(t["bases"][0]["lat"], t["bases"][0]["lon"]) for t in trips if t["kind"] in ("road", "city")]
    last = [(t["bases"][-1]["lat"], t["bases"][-1]["lon"]) for t in trips if t["kind"] == "road"]
    ft, lt = iter(home_table(first)), iter(home_table(last))
    for t in trips:
        if t["kind"] in ("road", "city"):
            f = next(ft)
            g = next(lt) if t["kind"] == "road" else f
            t["home"] = {h: [f[h][0], f[h][1], g[h][2], g[h][3]] for h in f if h in g and (t["kind"] == "road" or f[h][0] <= 9)}
            if t["kind"] == "road" and len(t["home"]) < len(HOMES):
                print("no road from home:", t["title"], len(t["home"]))

    for where, p in lines("trips_sail.txt"):
        if p[0] == "S":
            ideal, least = map(int, p[5].split("/"))
            trips.append({"kind": "sail", "title": p[1], "search": p[2], "months": months(p[3]), "end": "back", "level": p[4], "days": ideal, "min": least,
                          "licence": p[6], "why": p[7], "bases": []})
        else:
            la, lo = map(float, p[2].split(","))
            prev = trips[-1]["bases"][-1] if trips[-1]["bases"] else None
            nm = round(km((prev["lat"], prev["lon"]), (la, lo)) / 1.852 * 1.2) if prev else 0
            near = [
                {"id": s["id"], "h": None, "km": round(km((la, lo), (s["lat"], s["lon"])))} for s in cat if km((la, lo), (s["lat"], s["lon"])) <= 22]
            trips[-1]["bases"].append({"name": p[1], "lat": la, "lon": lo, "nights": int(p[3]), "min": 1, "by": "sail" if prev else "-", "h": round(nm / 5.5, 1), "nm": nm, "tip": p[4], "places": near})
    for t in trips:
        if t["kind"] == "sail":
            got = set()
            for b in t["bases"]:
                b["places"] = [x for x in b["places"] if not (x["id"] in got or got.add(x["id"]))]
            a, z = t["bases"][0], t["bases"][-1]
            t["backBy"], t["backNm"] = "sail", round(km((a["lat"], a["lon"]), (z["lat"], z["lon"])) / 1.852 * 1.2)
            t["backH"] = round(t["backNm"] / 5.5, 1)
            legs = [b["nm"] for b in t["bases"][1:]] + [t["backNm"]]
            if max(legs) > 48:
                print("long sail", t["title"], legs)
    where = atlas()
    codes = json.load(open(os.path.join(ROOT, "data", "countries.json"), encoding="utf-8"))["names"]
    lost = set()
    for t in trips:
        for b in t["bases"]:
            n = where(b["lat"], b["lon"])
            b["c"] = codes.get(n) or t["bases"][0].get("c")
            if not b["c"]:
                lost.add((b["name"], n))
    if lost:
        print("no country for", sorted(lost, key=str))

    # can you simply drive there? hours from every home city to every place in reach of a car, one file per home
    near = [s for s in cat if 34.5 < s["lat"] < 71 and -11 < s["lon"] < 36 and s["country"] not in ("Iceland", "Faroe Islands", "Algeria", "Tunisia", "Libya", "Syria", "Lebanon")]
    drive = {h: {} for h in HOMES}
    for s, h in zip(near, home_table([(s["lat"], s["lon"]) for s in near])):
        for k, v in h.items():
            if v[0] <= 14:
                drive[k][s["id"]] = [v[0], v[1]]
    os.makedirs(os.path.join(ROOT, "data", "drive"), exist_ok=True)
    for home, d in drive.items():
        with open(os.path.join(ROOT, "data", "drive", slug(home) + ".json"), "w", encoding="utf-8") as f:
            f.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(v, separators=(",", ":")) for k, v in d.items()) + "\n}\n")
    if os.path.exists(os.path.join(ROOT, "data", "drive.json")):
        os.remove(os.path.join(ROOT, "data", "drive.json"))
    print("drive times for", len(drive["Bingen am Rhein"]), "places from Bingen")
    with open(os.path.join(ROOT, "data", "trips.json"), "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(t, ensure_ascii=False, separators=(",", ":")) for t in trips) + "\n]\n")
    reach = {p["id"] for t in trips for b in t["bases"] for p in b["places"]}
    print({k: sum(t["kind"] == k for t in trips) for k in ("regular", "road", "city", "sail")})
    print(len(trips), "trips reach", len(reach), "of", len(cat), "places")


main()
