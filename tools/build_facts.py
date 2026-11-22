"""Turns tools/facts.txt into data/facts.json.   python tools/build_facts.py"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = {}
for n, line in enumerate(open(os.path.join(ROOT, "tools", "facts.txt"), encoding="utf-8"), 1):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    p = line.split("|")
    if len(p) != 5:
        raise SystemExit(f"facts.txt line {n}: expected 5 fields, got {len(p)}")
    out[p[0]] = {"year": int(p[1]) if p[1] else None, "when": p[2], "civ": p[3], "fact": p[4]}
ids = {s["id"] for s in json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))}
for x in sorted(ids - set(out)):
    print("no facts for", x)
for x in sorted(set(out) - ids):
    print("unknown place", x)
with open(os.path.join(ROOT, "data", "facts.json"), "w", encoding="utf-8") as f:
    f.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(v, ensure_ascii=False) for k, v in out.items()) + "\n}\n")
print(len(out), "facts written")
