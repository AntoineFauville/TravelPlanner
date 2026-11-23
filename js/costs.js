// What things cost, roughly, for two people. Country averages come from data/countries.json;
// your own limits (state.budget) always win over the averages.
import { countries, portById } from './data.js';
import { state } from './store.js';
import { esc, n0 } from './util.js';

export const isoOf = name => countries.names[name];
// French islands have their own visa rules
const PORT_ISO = { mtq: 'MTQ', reu: 'REU' };
export const landOf = id => PORT_ISO[id] || isoOf(portById.get(id).country);
export const C = iso => countries.list[iso] || countries.list.DEU;
export const euro = x => { const a = Math.abs(x), step = a < 40 ? 1 : a < 100 ? 5 : a < 1000 ? 10 : a < 10000 ? 50 : a < 100000 ? 100 : 1000; return `€${n0(Math.round(x / step) * step)}`; };

// ---------- per day and night
export function foodDay(c) {                                   // per person
  const b = state.budget, avg = b.style === 'cook' ? c.food * 1.15 : b.style === 'out' ? c.out + c.food * 0.15 : c.food * 0.55 + c.out * 0.5;
  return b.food ? Math.min(avg, b.food) : avg;
}
export function roomNight(c, kind) {                           // for two
  const avg = c.hotel * (kind === 'city' ? 1.2 : 1), cap = state.budget.hotel;
  return { eur: cap ? Math.min(avg, cap) : avg, avg, capped: !!cap && avg > cap * 1.05 };
}
export const flightTwo = km => 2 * Math.max(110, 60 + 0.085 * km);       // return tickets

// ---------- visas. Person 1 travels on the first passport, person 2 on the second
export const PASS = ['BE', 'GE'];
export const PASS_NAME = { BE: 'Belgian', GE: 'Georgian' };
const VT = { free: 'no visa', eta: 'online permit', voa: 'visa on arrival', evisa: 'e-visa online', visa: 'visa from the embassy', no: 'entry not allowed' };
export const visaOf = (iso, who) => { const v = countries.list[iso]?.visa?.[PASS[who]]; return v ? { t: v[0], stay: v[1], fee: v[2], text: VT[v[0]] } : null; };
export const visaFee = iso => [0, 1].reduce((s, w) => s + (visaOf(iso, w)?.fee || 0), 0);
export function visaLine(iso) {
  const p = [0, 1].map(w => visaOf(iso, w));
  if (!p[0] && !p[1]) return '';
  const one = (v, w) => (v ? `${esc(state.people[w])}: ${v.text}${v.stay ? ` (${v.stay} days)` : ''}${v.fee ? `, about €${v.fee}` : ''}` : `${esc(state.people[w])}: check`);
  return p.map(one).join('. ');
}
export const visaHard = iso => [0, 1].some(w => ['visa', 'no'].includes(visaOf(iso, w)?.t));

// ---------- safety and how much you want to go to that part of the world
export const ZONES = { ECS: 'Europe and Central Asia', MEA: 'Middle East and North Africa', SSF: 'Africa south of the Sahara', SAS: 'South Asia', EAS: 'East Asia and the Pacific', LCN: 'Latin America and the Caribbean', NAC: 'North America' };
export const zoneOf = p => countries.list[isoOf(p.country)]?.zone || '';
export const interest = p => { const z = state.zones?.[zoneOf(p)]; return z === undefined ? 1 : z; };
// 3: official warning (or a warned area around a place marked risky), 2: reconsider, 1: parts of the country, 0: nothing
export function riskOf(p) {
  const c = countries.list[isoOf(p.country)], name = p.country || 'this country';
  const link = c?.riskUS || `https://www.google.com/search?q=${encodeURIComponent(`${name} travel advice`)}`;
  if (!c) return p.advice ? { n: 1, text: 'Check the travel advice', note: '', link } : { n: 0 };
  if (c.risk === 4) return { n: 3, text: 'High risk zone', note: `Official warning against travel to ${name}`, link };
  if (c.riskPart && p.advice) return { n: 3, text: 'High risk zone', note: `Warning for parts of ${name}, including near here`, link };
  if (c.risk === 3) return { n: 2, text: 'Reconsider travel', note: `${name} has serious safety risks`, link };
  if (c.riskPart) return { n: 1, text: `Some areas of ${name} have a travel warning`, note: '', link };
  if (p.advice) return { n: 1, text: 'Check the travel advice', note: '', link };
  return { n: 0 };
}
export const risky = p => riskOf(p).n >= 2;
export const riskHtml = p => { const r = riskOf(p); return r.n ? `<p class="risk r${r.n}"><b>${esc(r.text)}</b>${r.note ? ` · ${esc(r.note)}` : ''} · <a href="${esc(r.link)}" target="_blank" rel="noopener">Travel advice</a></p>` : ''; };

// ---------- holidays
const TOLL = { AT: 13, CH: 43, SI: 16, CZ: 14, SK: 12, HU: 17, RO: 7, BG: 10 };            // vignettes for a short stay
const PERKM = { FR: 0.07, IT: 0.06, ES: 0.03, HR: 0.06, GR: 0.06, PL: 0.01, NO: 0.04, PT: 0.05, DK: 0.03 };   // tolls per km driven there, both averages
const FERRY = { 'Norway fjords by car': 420, 'Sweden: lakes, rock art and Gotland': 480, 'Scotland by car: Kilmartin to Orkney': 850, 'Ireland by ferry': 850, 'Corsica by ferry': 420, 'Sardinia by ferry: towers and giants': 520,
  'Albania, Ohrid and the Albanian Alps': 420, 'Northern Greece and the Peloponnese by ferry': 800, 'Southern England: Stonehenge to Cornwall': 280, 'Swedish west coast: Tanum': 220, 'Danish islands and southern Sweden': 180, 'Istria and the Kvarner islands': 60 };
const BOAT = { 'Kiel Bay and the Danish South Sea': 1700, 'IJsselmeer and the Frisian towns': 1300, 'Mecklenburg lakes by houseboat': 1200, 'Rügen and Hiddensee': 1700, 'Stockholm archipelago': 2000, 'Swedish west coast': 2000,
  'Gulf of Morbihan and Quiberon': 1900, 'Scotland: Oban to the Hebrides': 2400, 'Split, Vis and Hvar': 2300, 'Kornati and Šibenik': 2200, 'Ionian islands from Lefkas': 2100, 'Saronic gulf from Athens': 2200, 'Cyclades: Paros, Delos and Naxos': 2300,
  'Dodecanese from Kos': 2200, 'Lycian coast from Göcek': 2100, 'La Maddalena and southern Corsica': 2600, 'Aeolian islands': 2500, 'Elba and the Tuscan islands': 2300, 'Balearics: Mallorca and Menorca': 2800, 'Malta and Gozo by boat': 2200,
  'Canaries: Tenerife, La Gomera, El Hierro': 2000, 'British Virgin Islands': 5500, Grenadines: 4800, 'Belize reef': 5500, 'San Blas with a crew': 2800, 'Phang Nga and Phi Phi': 3200, 'Seychelles by catamaran': 5500,
  "Tahiti's Leeward islands": 6000, Whitsundays: 4800, 'Tonga: whales of Vavaʻu': 4800 };
const ISO2 = { AT: 'AUT', CH: 'CHE', SI: 'SVN', CZ: 'CZE', SK: 'SVK', HU: 'HUN', RO: 'ROU', BG: 'BGR', FR: 'FRA', IT: 'ITA', ES: 'ESP', HR: 'HRV', GR: 'GRC', PL: 'POL', NO: 'NOR', PT: 'PRT', DK: 'DNK', DE: 'DEU', LU: 'LUX', BE: 'BEL', NL: 'NLD',
  SE: 'SWE', GB: 'GBR', IE: 'IRL', BA: 'BIH', ME: 'MNE', AL: 'ALB', MK: 'MKD', LT: 'LTU', LV: 'LVA', EE: 'EST' };
const fuelOf = iso => C(iso).fuel[state.budget.fuel === 'diesel' ? 1 : 0];

export const tripCountries = t => [...new Set([...(t.countries || []).map(x => ISO2[x]), ...t.bases.map(b => b.c)])].filter(x => x && x !== 'DEU');

// returns { total, parts: [[label, euro, note]], capped }
export function tripCost(t, r) {
  const b = state.budget, parts = [], add = (label, eur, note = '') => { if (eur > 0.5) parts.push([label, eur, note]); };
  const road = t.kind === 'road', sail = t.kind === 'sail', camp = road && state.sleep !== 'hotel';
  const capped = new Set();
  let sleep = 0, food = 0, see = 0, nights = 0;
  for (const x of r.bases) {
    const c = C(x.c);
    if (!sail) {
      const room = camp ? { eur: c.camp } : roomNight(c, t.kind);
      if (room.capped) capped.add(`${x.name.replace(/ \(.*/, '')} €${Math.round(room.avg)}`);
      sleep += x.n * room.eur;
      nights += x.n;
    }
    food += x.n * 2 * foodDay(c) * (sail ? 0.9 : 1);
    see += x.n * 2 * c.act * (sail ? 0.4 : 0.85);
  }
  const last = C(r.bases[0].c), de = C('DEU');
  food += 2 * foodDay(last);                                   // the last day
  if (r.onWay) { const room = roomNight(de).eur; sleep += r.onWay * room; nights += r.onWay; food += r.onWay * 2 * foodDay(de); }

  if (sail) {
    const weeks = Math.max(0.6, (r.used - 1) / 7), price = (BOAT[t.title] || 2300) * weeks;
    add('Boat', price, `about ${euro(BOAT[t.title] || 2300)} a week for two to six people`);
    add('Skipper', b.skipper ? 190 * Math.round(weeks * 7) : 0, '€190 a day, plus meals');
    add('Moorings, diesel, cleaning', 260 + 22 * Math.round(weeks * 7));
  } else add(camp ? `${nights} nights camping` : `${nights} nights`, sleep, camp ? 'pitch for two with the car' : `about ${euro(sleep / Math.max(1, nights))} a night`);
  add('Food and drinks', food, `about ${euro(food / 2 / Math.max(1, r.used))} per person and day`);

  if (road) {
    const list = ['DEU', ...(t.countries || []).map(x => ISO2[x])], price = list.reduce((s, c) => s + fuelOf(c), 0) / list.length;
    const litres = r.km / 100 * b.litres;
    add('Fuel', litres * price, `${n0(r.km)} km, ${Math.round(litres)} litres at about €${price.toFixed(2)}`);
    const abroad = r.km * 0.55 / Math.max(1, (t.countries || []).filter(x => x !== 'DE').length || 1);
    add('Tolls and vignettes', (t.countries || []).reduce((s, x) => s + (TOLL[x] || 0) + (PERKM[x] || 0) * abroad, 0));
    add('Ferries and tunnels', FERRY[t.title] || 0, 'with the car');
  } else {
    const car = r.way && r.way[0] <= 5.5;
    if (car) add('Fuel', (r.way[1] + r.way[3]) / 100 * b.litres * fuelOf('DEU'), `${n0(r.way[1] + r.way[3])} km by car`);
    else add(sail && r.far < 900 ? 'Train or fuel' : 'Flights for two', sail && r.far < 900 ? 2 * Math.max(40, r.far * 0.13) : flightTwo(r.far), '');
    const drive = t.rental || r.legs.some(l => l.by === 'drive') || r.bases.some(x => x.see.some(y => y.h > 0.5));
    if (drive && t.kind === 'regular') add('Rental car or driver', (r.used - 1) * 42 * Math.max(0.75, last.act / 14) + r.drive * 60 / 100 * 6.5 * last.fuel[0], `${r.used - 1} days with fuel`);
    const inner = r.legs.reduce((s, l) => s + (l.by === 'fly' ? 190 : l.by === 'train' ? l.h * 24 * last.act / 14 : l.by === 'boat' ? l.h * 26 * last.act / 14 : 0), 0);
    add('Flights, trains and boats there', inner);
  }
  add('Sights and local transport', see);
  add('Visas', tripCountries(t).reduce((s, c) => s + visaFee(c), 0));
  return { total: parts.reduce((s, p) => s + p[1], 0), parts, capped: [...capped] };
}
// a readable name for a country code
let long = null;
export function landName(iso) {
  if (!long) { long = {}; for (const [n, c] of Object.entries(countries.names)) if (!long[c] || /\.|\(/.test(long[c]) || (n.length > 4 && n.length < long[c].length && !/\.|\(/.test(n))) long[c] = n; }
  return { USA: 'United States', GBR: 'United Kingdom', CPV: 'Cape Verde', TUR: 'Turkey', CZE: 'Czechia', ISR: 'Israel', KOR: 'South Korea', MTQ: 'Martinique', REU: 'Réunion', AUS: 'Australia', PYF: 'French Polynesia' }[iso] || long[iso] || iso;
}
