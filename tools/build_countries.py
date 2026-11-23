"""Builds data/countries.json: typical prices, fuel, visas for two passports and boat fees, per country.

Prices: World Bank ICP 2021 price levels (CC BY 4.0), scaled from German prices of 2026.
Fuel:   EU Weekly Oil Bulletin of 9 November 2026, other countries estimated.
Visas:  Wikipedia "Visa requirements for ... citizens" (CC BY-SA 4.0).
Fees:   rough figures from cruising reports. Everything is an estimate to plan with, not a quote.

    python tools/build_countries.py
"""
import json
import os
import re
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")
PASSPORTS = {"BE": "Belgian", "GE": "Georgian"}


def get(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={"User-Agent": "TravelPlannerBuild/0.1 (personal project)"})
        with urllib.request.urlopen(req, timeout=120) as r:
            open(path, "wb").write(r.read())
    return open(path, encoding="utf-8").read()


# names used on the map, in the catalogue and on Wikipedia -> ISO code
ALIAS = {"Antarctica": "ATA", "Antigua and Barb.": "ATG", "Antigua and Barbuda": "ATG", "Bahamas": "BHS", "The Bahamas": "BHS", "British Virgin Is.": "VGB", "British Virgin Islands": "VGB",
         "Cape Verde": "CPV", "Cabo Verde": "CPV", "China (Tibet)": "CHN", "Cook Is.": "COK", "Cook Islands": "COK", "Curaçao": "CUW", "Czech Republic": "CZE", "Czechia": "CZE",
         "Dominican Rep.": "DOM", "Dominican Republic": "DOM", "Egypt": "EGY", "Falkland Islands": "FLK", "Falkland Is.": "FLK", "Fr. Polynesia": "PYF", "French Polynesia": "PYF",
         "France (Corsica)": "FRA", "Gambia": "GMB", "The Gambia": "GMB", "Indian Ocean Ter.": "AUS", "Iran": "IRN", "Jerusalem": "ISR", "Kyrgyzstan": "KGZ", "Laos": "LAO", "Micronesia": "FSM",
         "Federated States of Micronesia": "FSM", "Niue": "NIU", "Palestine": "PSE", "Pitcairn Is.": "PCN", "Pitcairn Islands": "PCN", "Portugal (Azores)": "PRT", "Portugal (Madeira)": "PRT",
         "Russia": "RUS", "Réunion": "REU", "Saint Helena": "SHN", "Saint Helena, Ascension and Tristan da Cunha": "SHN", "Saint Lucia": "LCA", "Slovakia": "SVK", "Solomon Is.": "SLB", "Solomon Islands": "SLB",
         "Somaliland": "SOM", "South Georgia": "SGS", "S. Geo. and the Is.": "SGS", "South Korea": "KOR", "North Korea": "PRK", "Spain (Canaries)": "ESP", "Syria": "SYR", "Taiwan": "TWN", "Turkey": "TUR", "Türkiye": "TUR",
         "United States": "USA", "United States of America": "USA", "Venezuela": "VEN", "Vietnam": "VNM", "Yemen": "YEM", "United Kingdom": "GBR", "Bosnia and Herz.": "BIH", "Macedonia": "MKD",
         "North Macedonia": "MKD", "Faeroe Is.": "FRO", "Faroe Islands": "FRO", "St. Vin. and Gren.": "VCT", "Saint Vincent and the Grenadines": "VCT", "St. Kitts and Nevis": "KNA", "Saint Kitts and Nevis": "KNA",
         "W. Sahara": "MAR", "Dem. Rep. Congo": "COD", "Democratic Republic of the Congo": "COD", "Congo": "COG", "Republic of the Congo": "COG", "Côte d'Ivoire": "CIV", "Ivory Coast": "CIV", "eSwatini": "SWZ", "Eswatini": "SWZ",
         "Timor-Leste": "TLS", "East Timor": "TLS", "Brunei": "BRN", "São Tomé and Príncipe": "STP", "S. Sudan": "SSD", "Central African Rep.": "CAF", "Eq. Guinea": "GNQ", "N. Cyprus": "CYP", "Northern Cyprus": "CYP",
         "Hong Kong": "HKG", "Macao": "MAC", "U.S. Virgin Is.": "VIR", "Puerto Rico": "PRI", "Greenland": "GRL", "New Caledonia": "NCL", "Guam": "GUM", "Vatican": "ITA", "Marshall Is.": "MHL", "Marshall Islands": "MHL",
         "Turks and Caicos Is.": "TCA", "Cayman Is.": "CYM", "Wallis and Futuna Is.": "WLF", "Martinique": "MTQ", "Aruba": "ABW", "Bermuda": "BMU", "Anguilla": "AIA", "Montserrat": "MSR", "American Samoa": "ASM",
         "St-Martin": "MAF", "Sint Maarten": "SXM", "Tristan da Cunha": "SHN", "People's Republic of China": "CHN", "State of Palestine": "PSE", "Svalbard": "NOR", "Kosovo": "XKX"}

# not in the ICP: copy price levels from a similar place (factor)
LIKE = {"PYF": ("AUS", 1.15), "COK": ("NZL", 0.95), "NIU": ("NZL", 0.95), "TON": ("FJI", 1.05), "WSM": ("FJI", 1.0), "VUT": ("FJI", 1.15), "SLB": ("FJI", 1.1), "NCL": ("AUS", 1.1), "PCN": ("NZL", 1.1), "FSM": ("FJI", 1.1), "PLW": ("FJI", 1.4),
        "REU": ("FRA", 1.1), "MTQ": ("FRA", 1.1), "SHN": ("GBR", 0.95), "FLK": ("GBR", 1.1), "SGS": ("GBR", 1.0), "ATA": ("GBR", 1.0), "FRO": ("DNK", 1.0), "GRL": ("DNK", 1.15), "VGB": ("BHS", 1.0), "BMU": ("BMU", 1.0),
        "CUB": ("DOM", 0.9), "VEN": ("COL", 1.0), "SYR": ("JOR", 0.6), "LBN": ("JOR", 0.9), "YEM": ("OMN", 0.5), "LBY": ("TUN", 1.1), "TKM": ("UZB", 1.4), "AFG": ("PAK", 1.0), "ERI": ("ETH", 1.2), "SOM": ("KEN", 0.9), "PNG": ("FJI", 1.2),
        "SSD": ("UGA", 1.2), "PRK": ("CHN", 1.0), "ISR": ("ISR", 1.0), "PSE": ("JOR", 1.0), "TWN": ("KOR", 0.8), "GTM": ("SLV", 1.1), "JAM": ("JAM", 1), "DJI": ("DJI", 1), "AND": ("ESP", 1), "RUS": ("KAZ", 1.1), "XKX": ("ALB", 0.9), "UZB": ("KGZ", 1.0)}
# prices that moved a lot since 2021, or where tourists pay other prices than locals (hotel, eating out, groceries factors)
FIX = {"GBR": (1.25, 1.05, 1.0), "USA": (1.45, 1.25, 1.1), "AUS": (1.1, 1.0, 1.0), "CAN": (1.2, 1.1, 1.0), "IRL": (1.2, 1.0, 1.0), "TUR": (1.35, 1.4, 1.3), "ARG": (1.5, 1.7, 1.5), "MDV": (1.6, 1.5, 1.2), "SYC": (1.35, 1.2, 1.1), "ECU": (1.15, 1.0, 1.0), "EGY": (1.1, 1.1, 0.9), "PYF": (1.25, 1.0, 1.15), "ISL": (1.25, 1.1, 1.0), "NOR": (1.1, 1.0, 1.0), "TZA": (1.6, 1.2, 1.0),
       "KEN": (1.4, 1.2, 1.0), "BWA": (2.0, 1.3, 1.0), "NAM": (1.5, 1.2, 1.0), "RWA": (1.6, 1.3, 1.0), "UGA": (1.5, 1.2, 1.0), "BTN": (2.4, 1.6, 1.0), "CUB": (1.2, 1.2, 1.2), "HRV": (1.25, 1.2, 1.1), "JOR": (1.1, 1.1, 1.0), "ZMB": (2.0, 1.3, 1.0), "ZWE": (2.0, 1.4, 1.2), "MDG": (1.6, 1.3, 1.0), "BLZ": (1.5, 1.3, 1.1)}

# Euro per litre: petrol, diesel. EU from the Weekly Oil Bulletin of 9 November 2026
FUEL = {"MLT": (1.340, 1.210), "POL": (1.384, 1.753), "SWE": (1.437, 1.954), "BGR": (1.582, 1.896), "LUX": (1.627, 1.987), "SVN": (1.635, 1.953), "CZE": (1.653, 1.899), "AUT": (1.670, 2.087), "ESP": (1.688, 1.879),
        "SVK": (1.691, 1.965), "CYP": (1.699, 2.000), "HRV": (1.749, 2.025), "HUN": (1.750, 1.978), "EST": (1.805, 2.084), "LTU": (1.843, 2.225), "BEL": (1.844, 2.357), "ROU": (1.844, 2.033), "LVA": (1.846, 2.083),
        "PRT": (1.922, 2.135), "IRL": (1.958, 2.119), "ITA": (1.995, 2.218), "GRC": (2.042, 2.099), "DEU": (2.067, 2.253), "FRA": (2.088, 2.178), "FIN": (2.144, 2.485), "NLD": (2.196, 2.361), "DNK": (2.391, 2.435),
        "GBR": (2.08, 2.37), "CHE": (2.28, 2.63), "NOR": (2.80, 2.66), "ISL": (2.01, 2.36), "MKD": (1.60, 1.57), "GEO": (1.48, 1.70),
        # estimates from here on
        "SRB": (1.85, 2.0), "BIH": (1.6, 1.65), "MNE": (1.7, 1.75), "ALB": (1.95, 1.95), "TUR": (1.35, 1.4), "ARM": (1.3, 1.3), "AZE": (0.7, 0.7), "USA": (1.1, 1.3), "CAN": (1.35, 1.45), "MEX": (1.4, 1.45), "AUS": (1.35, 1.45),
        "NZL": (1.75, 1.4), "ZAF": (1.35, 1.35), "NAM": (1.35, 1.35), "BWA": (1.25, 1.3), "MAR": (1.6, 1.5), "TUN": (0.8, 0.75), "EGY": (0.4, 0.35), "JOR": (1.5, 1.1), "OMN": (0.6, 0.65), "SAU": (0.6, 0.5), "ARG": (1.2, 1.2),
        "CHL": (1.4, 1.2), "BRA": (1.2, 1.2), "PER": (1.3, 1.4), "BOL": (0.9, 0.9), "CRI": (1.5, 1.4), "COL": (0.95, 0.75), "ECU": (0.75, 0.7), "IND": (1.15, 1.05), "LKA": (1.2, 1.1), "THA": (1.2, 1.0), "IDN": (0.8, 0.8), "MYS": (0.5, 0.75),
        "VNM": (1.0, 0.9), "JPN": (1.2, 1.1), "KOR": (1.3, 1.25), "REU": (1.9, 1.8), "FRO": (2.2, 2.0)}

# visa fee in euro per person where the type alone does not tell
FEES = {"GE": {"SYC": 10, "MDV": 0, "USA": 400, "GBR": 150, "CAN": 115, "AUS": 115, "NZL": 260, "IRL": 60, "JPN": 20, "ZAF": 40, "BTN": 45, "IND": 40, "EGY": 25, "JOR": 55, "LKA": 45, "TZA": 48, "KEN": 30, "NPL": 45, "KHM": 33, "LAO": 45, "VNM": 25, "IDN": 32, "MDG": 35,
               "ZWE": 50, "ZMB": 25, "NAM": 85, "RWA": 48, "UGA": 48, "ETH": 75, "SAU": 120, "OMN": 48, "CUB": 35, "PYF": 60, "NCL": 60, "MTQ": 60, "REU": 60, "VUT": 80, "PNG": 50, "BHR": 25, "BOL": 150, "CHN": 90, "TWN": 45, "TKM": 100, "GIN": 80, "SHN": 25},
        "BE": {"SYC": 10, "MDV": 0, "USA": 37, "GBR": 19, "CAN": 5, "AUS": 0, "NZL": 70, "EGY": 25, "JOR": 55, "LKA": 45, "TZA": 48, "KEN": 30, "NPL": 45, "KHM": 33, "LAO": 45, "VNM": 0, "IDN": 32, "MDG": 35, "ZWE": 30, "ZMB": 0, "NAM": 85, "RWA": 48, "UGA": 48, "ETH": 75,
               "SAU": 120, "OMN": 0, "CUB": 35, "IND": 25, "BTN": 45, "KOR": 8, "BHR": 25, "PNG": 50, "TKM": 100, "CHN": 0, "SHN": 25}}
DEFAULT_FEE = {"free": 0, "eta": 18, "voa": 40, "evisa": 50, "visa": 95, "no": 0}

# clearing in with a yacht, cruising permit and agent, in euro, rough
CLEAR = {"ECU": 2300, "PYF": 120, "COK": 160, "NIU": 60, "TON": 90, "WSM": 80, "FJI": 260, "NZL": 180, "AUS": 420, "VUT": 150, "NCL": 20, "SLB": 160, "PNG": 120, "IDN": 170, "MYS": 40, "SGP": 70, "THA": 70, "LKA": 260, "MDV": 420, "IND": 320,
         "SYC": 170, "MUS": 50, "REU": 0, "ZAF": 90, "SHN": 110, "BRA": 60, "CPV": 45, "BRB": 80, "BLZ": 160, "GTM": 220, "MEX": 90, "CUB": 160, "COL": 160, "CRI": 90, "BHS": 320, "VGB": 220, "ATG": 110, "GRD": 80, "LCA": 60, "DOM": 110, "JAM": 20,
         "PCN": 100, "CHL": 120, "MDG": 130, "TZA": 420, "KEN": 160, "OMN": 110, "DJI": 110, "JOR": 110, "EGY": 260, "PLW": 320, "FSM": 110, "PHL": 90, "JPN": 0, "KHM": 60, "PAN": 260, "TTO": 60, "CUW": 30, "BMU": 45, "USA": 40, "CAN": 10, "NAM": 60,
         "SEN": 60, "TUR": 100, "TUN": 40, "MAR": 30, "MTQ": 10, "ARG": 40, "URY": 30}
# where the tables are unclear
VFIX = {"BE": {"USA": ["eta", 90], "COK": ["free", 31], "SYC": ["eta", 90], "MDV": ["voa", 30]}, "GE": {"GEO": ["free", 0], "SYC": ["eta", 90], "MDV": ["voa", 30]}}
EU = set("AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE NOR ISL CHE LIE AND MCO SMR".split())
SCHENGEN = EU - {"IRL", "CYP"}


def kind(text):
    t = text.lower()
    if "freedom of movement" in t or "not required" in t or "visa free" in t or "visa-free" in t:
        return "free"
    if "refused" in t or "banned" in t or "travel restricted" in t or "not allowed" in t:
        return "no"
    if "electronic travel auth" in t or re.search(r"\b(eta|esta|k-eta|nzeta|evisitor|etias)\b", t) or "authori" in t and "electronic" in t:
        return "eta"
    if "on arrival" in t:
        return "voa"
    if "e-visa" in t or "evisa" in t or "electronic visa" in t or "online visa" in t:
        return "evisa"
    if "tourist card" in t:
        return "voa"
    if "visa required" in t or "required" in t or "permit" in t:
        return "visa"
    return None


def strip(s):
    s = re.sub(r"<ref[^>]*?/>|<ref.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+ ?([^\]]*)\]", r"\1", s)
    s = re.sub(r"\{\{(?:yes|no|yes2|no2|yes-no|partial|maybe|n/a|free|optional|some|okay|site|eliminated|black|warning|{{)[^|}]*\|([^}]*)\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{[^}]*\}\}", "", s)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip(" *|")


def visas(code, iso):
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(dict(action="parse", page=f"Visa_requirements_for_{PASSPORTS[code]}_citizens", prop="wikitext", format="json", formatversion=2))
    text = json.loads(get(url, f"visa-{code}.json"))["parse"]["wikitext"]
    text = re.sub(r"<ref[^>/]*/>|<ref.*?</ref>", "", text, flags=re.S)
    out = {}
    for row in re.split(r"\n\|-", text):
        m = re.search(r"\{\{flag(?:country|icon|deco)?\|([^}|]+)", row)
        if not m:
            continue
        c = iso(m.group(1).strip())
        rest = row[m.end():]
        cells = [x for x in re.split(r"\n\s*\||\|\|", rest)]
        body = " ".join(cells[1:2]) if len(cells) > 1 else rest
        t = kind(strip(body)) or kind(strip(" ".join(cells[1:3])))
        if c and t and c not in out:
            stay = strip(cells[2]) if len(cells) > 2 else ""
            d = re.search(r"(\d+)\s*(day|month|year|week)", stay)
            out[c] = [t, int(d.group(1)) * {"day": 1, "week": 7, "month": 30, "year": 365}[d.group(2)] if d else 0]
    for m in re.finditer(r"\n\*+\s*(?:'''|)?\{\{flag(?:country|icon)?\|([^}|]+)[^}]*\}\}([^\n]*)", text):
        c, t = iso(m.group(1).strip()), kind(strip(m.group(2)))
        if c and t and c not in out:
            d = re.search(r"(\d+)\s*(day|month|year)", strip(m.group(2)))
            out[c] = [t, int(d.group(1)) * {"day": 1, "month": 30, "year": 365}[d.group(2)] if d else 0]
    return out


def main():
    wb = json.loads(get("https://api.worldbank.org/v2/country?format=json&per_page=400", "wb-countries.json"))[1]
    names = {x["name"]: x["id"] for x in wb if x["region"]["value"] != "Aggregates"}
    names.update({x["name"].split(",")[0]: x["id"] for x in wb if x["region"]["value"] != "Aggregates" and x["name"].split(",")[0] not in names and x["name"].split(",")[0] not in ("Korea", "Congo")})
    names.update(ALIAS)
    iso = names.get
    d = json.loads(get("https://api.worldbank.org/v2/sources/90/country/all/series/1101000;1111000;1107300;9020000/time/all/classification/PX.WL/data?format=json&per_page=6000", "icp2021.json"))
    pl = {}
    for r in d["source"]["data"]:
        v = {x["concept"]: x["id"] for x in r["variable"]}
        if r["value"]:
            pl.setdefault(v["Country"], {}).setdefault(v["Series"], {})[v["Time"]] = r["value"]
    level = {c: {k: t.get("YR2021") or t.get("YR2017") for k, t in s.items()} for c, s in pl.items()}
    for c, (o, f) in LIKE.items():
        if c not in level and o in level:
            level[c] = {k: x * f for k, x in level[o].items()}
    de = level["DEU"]

    zone = {x["id"]: x["region"]["id"] for x in wb if x["region"]["value"] != "Aggregates"}
    iso3 = {x["iso2Code"]: x["id"] for x in wb}
    iso3.update({"XK": "XKX", "PS": "PSE", "TW": "TWN"})
    # official travel warnings: German Foreign Office (warning / partial warning) and US State Department (levels 1 to 4)
    aa = json.loads(get("https://www.auswaertiges-amt.de/opendata/travelwarning", "aa-warnings.json"))["response"]
    aa = {v["iso3CountryCode"]: v for v in aa.values() if isinstance(v, dict) and v.get("iso3CountryCode")}
    us = {}
    for a in json.loads(get("https://cadataapi.state.gov/api/TravelAdvisories", "us-advisories.json")):
        m = re.search(r"Level (\d)", a["Title"])
        for c in a.get("Category") or []:
            if m and iso3.get(c):
                us[iso3[c]] = (int(m.group(1)), a["Link"])

    cat = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))
    cat += json.load(open(os.path.join(ROOT, "data", "catalog_more.json"), encoding="utf-8"))
    sail = json.load(open(os.path.join(ROOT, "data", "sailing.json"), encoding="utf-8"))
    used = {s["country"] for s in cat} | {p["country"] for p in sail["ports"]}
    miss = sorted(n for n in used if not iso(n))
    if miss:
        print("no code for", miss)
    V = {p: visas(p, iso) for p in PASSPORTS}

    out, wanted = {}, set(level) | {iso(n) for n in used if iso(n)}
    for c in sorted(wanted):
        s = level.get(c)
        if not s:
            if c in {iso(n) for n in used}:
                print("no prices for", c)
            s = {k: 90 for k in de}
        if not any(iso(n) == c for n in names):
            continue
        fx = FIX.get(c, (1, 1, 1))
        rest, food, aic = (s.get(k) or de[k] for k in ("1111000", "1101000", "9020000"))
        rest, food, aic = rest / de["1111000"], food / de["1101000"], aic / de["9020000"]
        e = {"hotel": round(105 * rest ** 0.7 * fx[0]), "out": round(38 * rest ** 0.85 * fx[1]), "food": round(11 * food * fx[2], 1), "camp": round(32 * rest ** 0.6),
             "act": round(14 * aic ** 0.5), "marina": round(34 * rest ** 0.5), "fuel": FUEL.get(c, (1.4, 1.35))}
        e["visa"] = {}
        for p in PASSPORTS:
            v = VFIX[p].get(c) or V[p].get(c)
            if p == "BE" and c in EU or p == "GE" and c in SCHENGEN:
                v = ["free", 0]
            if c in ("REU", "MTQ") and p == "BE" or c == "BEL" or c == "PYF" and p == "BE" or c == "NCL" and p == "BE":
                v = ["free", 0]
            if v:
                e["visa"][p] = [v[0], v[1], 0 if v[0] == "free" else FEES[p].get(c, DEFAULT_FEE[v[0]])]
        e["clear"] = CLEAR.get(c, 0 if c in EU else 80)
        e["zone"] = zone.get(c, {"REU": "SSF", "MTQ": "LCN", "PYF": "EAS", "COK": "EAS", "NIU": "EAS", "SHN": "SSF", "FLK": "LCN", "SGS": "LCN", "ATA": "ECS", "TWN": "EAS", "PSE": "MEA"}.get(c, "ECS"))
        w, lv = aa.get(c, {}), us.get(c, (0, ""))
        risk = 4 if w.get("warning") or lv[0] == 4 else 3 if lv[0] == 3 else 2 if lv[0] == 2 or w.get("partialWarning") else 0
        if risk:
            e["risk"] = risk
            e["riskUS"] = lv[1]
        if w.get("partialWarning") or w.get("situationPartWarning"):
            e["riskPart"] = 1
        out[c] = e
    # Georgian passport in French overseas territories that Wikipedia lists under another name
    for c in ("MTQ", "REU"):
        if c in out and "GE" not in out[c]["visa"]:
            out[c]["visa"]["GE"] = ["visa", 0, FEES["GE"][c]]
    idx = {n: iso(n) for n in sorted(set(used) | set(ALIAS)) if iso(n) in out}
    for n, c in names.items():
        if c in out and n not in idx and n.split(",")[0] == n:
            idx[n] = c
    with open(os.path.join(ROOT, "data", "countries.json"), "w", encoding="utf-8") as f:
        f.write('{"names":' + json.dumps(idx, ensure_ascii=False, separators=(",", ":")) + ',\n"list":{\n' + ",\n".join(json.dumps(k) + ":" + json.dumps(v, separators=(",", ":")) for k, v in out.items()) + "\n}}\n")
    print(len(out), "countries;", {p: sum(p in e["visa"] for e in out.values()) for p in PASSPORTS})
    uc = {iso(n) for n in used if iso(n)}
    for p in PASSPORTS:
        print(p, "no visa info:", sorted(c for c in uc if c in out and p not in out[c]["visa"]))
    for c in ("DEU", "CHE", "ITA", "EGY", "TUR", "PYF", "IDN", "AUS", "PAN", "MTQ", "ECU", "ZAF", "GBR", "NZL", "TON", "FJI", "MDV", "BRA", "CPV", "USA"):
        print(c, out.get(c))


main()
