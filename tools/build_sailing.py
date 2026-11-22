"""Builds data/sailing.json from tools/sailing.txt.

Every leg gets a real path over water: a straight great-circle line when nothing is in
the way, otherwise the shortest path found on a 0.1 degree land/sea grid.

    python tools/build_sailing.py path/to/land-10m.json     (from the world-atlas package)
"""
import heapq
import json
import math
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 10                      # cells per degree
W, H = 360 * N, 180 * N
R_NM = 3440.065

# Narrow channels that a 0.1 degree grid would close. (lat, lon) lines, opened by hand.
CHANNELS = [
    [(36.0, -6.2), (35.95, -5.6), (36.0, -5.0)],                                    # Gibraltar
    [(40.0, 25.9), (40.05, 26.2), (40.2, 26.4), (40.4, 26.7), (40.6, 27.2), (40.8, 28.5)],  # Dardanelles, Marmara
    [(37.8, 15.4), (38.1, 15.6), (38.3, 15.75), (38.5, 15.7)],                      # Messina
    [(54.5, 10.3), (54.4, 10.15), (54.3, 9.7), (54.2, 9.4), (53.9, 9.1), (53.95, 8.6)],     # Kiel Canal
    [(9.5, -79.95), (9.2, -79.9), (9.1, -79.7), (8.9, -79.5), (8.7, -79.5)],        # Panama Canal
    [(31.5, 32.4), (30.7, 32.3), (30.3, 32.4), (29.8, 32.55)],                      # Suez Canal
    [(1.1, 103.4), (1.2, 103.8), (1.25, 104.1), (1.3, 104.5)],                      # Singapore Strait
    [(-10.5, 141.6), (-10.5, 142.1), (-10.45, 142.6), (-10.6, 143.0)],              # Torres Strait
    [(28.0, 34.5), (28.2, 34.6), (29.0, 34.75), (29.45, 34.95)],                    # Gulf of Aqaba
    [(12.3, 43.6), (12.6, 43.3), (13.2, 42.9)],                                     # Bab el Mandeb
    [(15.9, -88.5), (15.9, -88.7)],
    [(-8.3, 119.3), (-8.4, 119.6), (-8.45, 119.9)],                                 # Komodo
    [(33.5, 132.2), (33.7, 132.4), (33.2, 132.2), (32.7, 132.2)],                   # Bungo channel
    [(48.4, -124.8), (48.25, -124.0), (48.25, -123.4)],                             # Juan de Fuca
    [(-54.9, -66.5), (-54.95, -67.2)], [(41.0, 28.9), (40.85, 28.7)],
    [(-9.0, 115.6), (-8.8, 115.4)], [(39.3, 20.0), (39.6, 19.8), (39.8, 19.6)],
]


def load_land(path):
    d = json.load(open(path))
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
    obj = d["objects"]["land"]
    geoms = obj.get("geometries", [obj])
    for g in geoms:
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
        for poly in polys:
            for ring in poly:
                pts = []
                for i in ring:
                    seg = arcs[i] if i >= 0 else arcs[~i][::-1]
                    pts.extend(seg if not pts else seg[1:])
                rings.append(np.array(pts))
    return rings


def rasterize(rings):
    """Even-odd scanline fill; holes cancel out."""
    land = np.zeros((H, W), bool)
    for r in rings:
        x, y = r[:, 0].copy(), r[:, 1]
        step = np.diff(x)                                   # rings crossing the date line: make longitudes continuous
        x[1:] -= np.cumsum(360 * np.round(step / 360))
        if abs(x[0] - x[-1]) > 1:                           # Antarctica goes round the pole
            x = r[:, 0]
        x2, y2 = np.roll(x, -1), np.roll(y, -1)
        lo = max(0, int((90 - y.max()) * N) - 1)
        hi = min(H - 1, int((90 - y.min()) * N) + 1)
        for row in range(lo, hi + 1):
            lat = 90 - (row + 0.5) / N
            m = (y > lat) != (y2 > lat)
            if not m.any():
                continue
            xs = np.sort(x[m] + (lat - y[m]) * (x2[m] - x[m]) / (y2[m] - y[m]))
            for a, b in zip(xs[::2], xs[1::2]):
                c0 = int(math.ceil((a + 180) * N - 0.5))
                c1 = int(math.floor((b + 180) * N - 0.5))
                if c1 >= c0:
                    land[row, np.arange(c0, c1 + 1) % W] ^= True
    return land


def cell(lat, lon):
    return min(H - 1, max(0, int((90 - lat) * N))), int(math.floor((lon + 180) * N)) % W


def dist(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_NM * math.asin(min(1, math.sqrt(h)))


def gc(a, b, step_nm):
    """Points along the great circle, longitudes kept continuous (may pass 180)."""
    d = dist(a, b)
    n = max(1, int(math.ceil(d / step_nm)))
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    ang = d / R_NM
    out = []
    for i in range(n + 1):
        f = i / n
        if ang < 1e-9:
            out.append(a)
            continue
        A, B = math.sin((1 - f) * ang) / math.sin(ang), math.sin(f * ang) / math.sin(ang)
        x = A * math.cos(la1) * math.cos(lo1) + B * math.cos(la2) * math.cos(lo2)
        y = A * math.cos(la1) * math.sin(lo1) + B * math.cos(la2) * math.sin(lo2)
        z = A * math.sin(la1) + B * math.sin(la2)
        lon = math.degrees(math.atan2(y, x))
        if out:
            while lon - out[-1][1] > 180:
                lon -= 360
            while lon - out[-1][1] < -180:
                lon += 360
        out.append((math.degrees(math.atan2(z, math.hypot(x, y))), lon))
    return out


class Sea:
    def __init__(self, land):
        self.land = land
        near = land.copy()
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                near |= np.roll(np.roll(land, dr, 0), dc, 1)
        self.near = near

    def clear(self, a, b):
        return not any(self.land[cell(*p)] for p in gc(a, b, 3))

    def snap(self, p):
        r, c = cell(*p)
        best = None
        for dr in range(-6, 7):
            for dc in range(-6, 7):
                if 0 <= r + dr < H and not self.land[r + dr, (c + dc) % W]:
                    if best is None or dr * dr + dc * dc < best[0]:
                        best = (dr * dr + dc * dc, r + dr, (c + dc) % W)
        if best is None:
            raise SystemExit(f"no water near {p}")
        return best[1], best[2]

    def astar(self, a, b):
        s, g = self.snap(a), self.snap(b)
        gp = (90 - (g[0] + .5) / N, (g[1] + .5) / N - 180)

        def ll(k):
            return 90 - (k[0] + .5) / N, (k[1] + .5) / N - 180

        cost, came, heap = {s: 0.0}, {}, [(dist(ll(s), gp), s)]
        done = set()
        while heap:
            _, k = heapq.heappop(heap)
            if k == g:
                break
            if k in done:
                continue
            done.add(k)
            if len(done) > 700000:
                return None
            r, c = k
            lat = ll(k)[0]
            ns, ew = 60 / N, 60 / N * math.cos(math.radians(lat))
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    if not dr and not dc:
                        continue
                    r2, c2 = r + dr, (c + dc) % W
                    if not 0 <= r2 < H or self.land[r2, c2]:
                        continue
                    if dr and dc and self.land[r, c2] and self.land[r2, c]:
                        continue
                    d = math.hypot(dr * ns, dc * ew) * (1.5 if self.near[r2, c2] else 1)
                    nc = cost[k] + d
                    if nc < cost.get((r2, c2), 1e18):
                        cost[(r2, c2)] = nc
                        came[(r2, c2)] = k
                        heapq.heappush(heap, (nc + dist(ll((r2, c2)), gp), (r2, c2)))
        else:
            return None
        path = [g]
        while path[-1] != s:
            path.append(came[path[-1]])
        pts = [ll(k) for k in path[::-1]]
        # string pulling: keep only the corners that matter
        out, i = [pts[0]], 0
        while i < len(pts) - 1:
            j, step = i + 1, 1
            while j + step < len(pts) and self.clear(pts[i], pts[j + step]):
                j += step
                step = min(step * 2, 64)
            while j + 1 < len(pts) and self.clear(pts[i], pts[j + 1]):
                j += 1
            out.append(pts[j])
            i = j
        return [a] + out[1:-1] + [b] if len(out) > 2 else [a, b]


def months(spec):
    out = set()
    for part in spec.split(","):
        x, _, y = part.partition("-")
        x, y = int(x), int(y or x)
        while True:
            out.add(x)
            if x == y:
                break
            x = x % 12 + 1
    return sorted(out)


def main():
    ports, legs, sec = {}, [], None
    for line in open(os.path.join(ROOT, "tools", "sailing.txt"), encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("["):
            sec = line
            continue
        if sec == "[ports]":
            p = line.split("|")
            ports[p[0]] = {"id": p[0], "name": p[1], "label": p[2], "country": p[3], "lat": float(p[4]), "lon": float(p[5]),
                           "zone": p[6], "leave": "L" in p[7], "note": p[8], "seq": len(ports)}
        else:
            f = line.split(":") + ["", "", ""]
            sep = ">" if ">" in f[0] else "-"
            a, b = f[0].split(sep)
            for k in (a, b):
                if k not in ports:
                    raise SystemExit("unknown port " + k)
            e = {"a": a, "b": b, "months": months(f[1]), "f": float(f[2] or 1), "flags": f[3], "both": sep == "-"}
            legs.append(e)

    land = rasterize(load_land(sys.argv[1]))
    for ch in CHANNELS:
        for p, q in zip(ch, ch[1:]):
            prev = cell(*p)
            for x in gc(p, q, 2):
                c = cell(*x)
                land[c] = land[prev[0], c[1]] = False       # also fill the corner, so diagonals stay open
                prev = c
    sea = Sea(land)
    for p in ports.values():
        r, c = cell(p["lat"], p["lon"])
        if land[r, c]:
            land[r, c] = False
    out = []
    for e in legs:
        A, B = ports[e["a"]], ports[e["b"]]
        a, b = (A["lat"], A["lon"]), (B["lat"], B["lon"])
        pts = [a, b] if sea.clear(a, b) else sea.astar(a, b)
        if pts is None:
            print("NO PATH", e["a"], e["b"])
            continue
        # drop land-cell end offsets, measure, then densify long hops so they curve on the globe
        nm = sum(dist(p, q) for p, q in zip(pts, pts[1:]))
        line = [pts[0]]
        for p, q in zip(pts, pts[1:]):
            seg = gc(p, q, 120)
            off = 360 * round((line[-1][1] - seg[0][1]) / 360)
            line += [(la, lo + off) for la, lo in seg[1:]]
        e["nm"] = round(nm * e.pop("f") * 1.04)      # a few percent for not sailing perfectly straight
        e["line"] = [[round(lo, 2), round(la, 2)] for la, lo in line]
        out.append(e)
    # every port must be able to leave and arrive
    for k in ports:
        go = any(e["a"] == k or (e["both"] and e["b"] == k) for e in out)
        come = any(e["b"] == k or (e["both"] and e["a"] == k) for e in out)
        if not (go and come):
            print("one-way port", k, "leave" if go else "no exit", "arrive" if come else "no entrance")
    with open(os.path.join(ROOT, "data", "sailing.json"), "w", encoding="utf-8") as f:
        f.write('{"ports":[\n' + ",\n".join(json.dumps(p, ensure_ascii=False) for p in ports.values())
                + '\n],"legs":[\n' + ",\n".join(json.dumps(e, separators=(",", ":")) for e in out) + "\n]}\n")
    print(len(ports), "ports,", len(out), "legs")
    for e in out:
        if len(sys.argv) > 2:
            print(e["a"], e["b"], e["nm"], len(e["line"]))


main()
