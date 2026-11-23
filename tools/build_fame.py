"""How well known each place is: readers of its English Wikipedia article per month
(average of the last 60 days). The app ranks places of the same kind with it,
e.g. "No. 9 of 230 castles in Europe". Writes data/fame.json.

    python tools/build_fame.py
"""
import json
import os
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://en.wikipedia.org/w/api.php"
UA = {"User-Agent": "TravelPlannerBuild/0.1 (personal project)"}


def get(params):
    url = API + "?" + urllib.parse.urlencode(dict(params, format="json", formatversion=2))
    for attempt in range(10):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            wait = int(getattr(e, "headers", None) and e.headers.get("Retry-After") or 0) or 5 * (attempt + 1)
            print("  waiting", wait, "s:", e)
            time.sleep(min(60, wait))
    raise SystemExit("Wikipedia did not answer")


def main():
    places = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))
    places += json.load(open(os.path.join(ROOT, "data", "catalog_more.json"), encoding="utf-8"))
    title = {}
    for p in places:
        t = p.get("w") or (urllib.parse.unquote(p["wiki"].rsplit("/wiki/", 1)[1]) if p.get("wiki") else "")
        if t:
            title[p["id"]] = t.replace("_", " ")
    titles = sorted(set(title.values()))
    keep = os.path.join(ROOT, "tools", ".cache", "fame-seen.json")      # progress, so a stopped run can go on
    os.makedirs(os.path.dirname(keep), exist_ok=True)
    seen = json.load(open(keep, encoding="utf-8")) if os.path.exists(keep) else {}
    todo = [t for t in titles if t not in seen]
    print(len(titles) - len(todo), "known,", len(todo), "to ask")
    for i in range(0, len(todo), 50):
        part = todo[i:i + 50]
        alias, got, more = {}, {}, {}
        while True:                                   # the answer comes in pieces
            r = get({"action": "query", "prop": "pageviews", "pvipdays": 60, "redirects": 1, "titles": "|".join(part), **more})
            q = r["query"]
            alias.update({x["from"]: x["to"] for k in ("normalized", "redirects") for x in q.get(k, [])})
            for pg in q["pages"]:
                if pg.get("pageviews"):
                    got[pg["title"]] = sum(v or 0 for v in pg["pageviews"].values())
            if "continue" not in r:
                break
            more = r["continue"]
            time.sleep(1)
        for t in part:
            x = t
            for _ in range(3):
                x = alias.get(x, x)
            seen[t] = got.get(x, 0)
        json.dump(seen, open(keep, "w", encoding="utf-8"))
        time.sleep(1.5)
    fame = {pid: round(seen.get(t, 0) / 2) for pid, t in title.items() if seen.get(t)}
    with open(os.path.join(ROOT, "data", "fame.json"), "w", encoding="utf-8") as f:
        json.dump(fame, f, separators=(",", ":"))
    print(len(fame), "of", len(places), "places have readers; top:",
          sorted(((v, k) for k, v in fame.items()), reverse=True)[:5])


main()
