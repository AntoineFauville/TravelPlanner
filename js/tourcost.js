// What the world tour costs, for two people: the boat, the sea, the land, the papers.
import { portById, HOME, daysFor } from './data.js';
import { state } from './store.js';
import { km } from './util.js';
import { C, isoOf, landOf, flightTwo, visaOf, visaFee } from './costs.js';
import { stayPlaces, suggestStay } from './stays.js';

const DAY = 86400000;
const EUSTART = new Set(['MTQ', 'REU', 'DEU', 'NLD', 'FRA', 'ESP', 'PRT', 'ITA', 'GRC', 'MLT', 'HRV', 'CYP', 'BEL', 'DNK', 'SWE', 'IRL', 'NOR']);

// o: the full plan (with stays), r: the simulated voyage
export function tourCost(o, r) {
  const T = state.tour, out = T.out / 100, marina = T.marina / 100;
  const sum = { food: 0, ashore: 0, harbour: 0, diesel: 0, clear: 0, visas: 0, canals: 0, flights: 0, storage: 0 };
  const perStop = {}, legs = {}, seen = new Map(), limits = [];
  let here = landOf(o.start), away = 0;
  const pay = (k, x, id) => { sum[k] += x; if (id) perStop[id] = (perStop[id] || 0) + x; };

  r.items.forEach((x, i) => {
    const days = (x.t1 - x.t0) / DAY;
    if (x.kind === 'home') {
      const c = C(landOf(x.id));
      sum.flights += flightTwo(km(portById.get(x.id), HOME));
      sum.storage += days / 30.44 * 380 * c.marina / 34;
      return;
    }
    away += days;
    if (x.kind === 'sea') {
      const f = 2 * days * C(here).food * 1.05, d = days * 24 * 0.12 * 3 * 1.5;       // motoring an eighth of the time, 3 litres an hour
      sum.food += f; sum.diesel += d; legs[i] = f + d;
      if (x.flags.includes('C')) sum.canals += x.a === 'col' || x.b === 'col' ? 3000 : 650;
      const land = landOf(x.b);
      if (land && land !== here) {
        const c = C(land);
        if (!EUSTART.has(land)) pay('clear', c.clear, x.b);
        pay('visas', visaFee(land), x.b);
        if (!seen.has(land)) seen.set(land, { port: x.b, days: 0 });
        here = land;
      }
      return;
    }
    // in port: groceries mostly, some eating out, some nights in a marina
    const c = C(landOf(x.id)), id = x.id;
    pay('food', 2 * days * ((1 - out) * c.food + out * c.out), id);
    pay('harbour', days * marina * c.marina, id);
    const s = seen.get(landOf(id));
    if (s) s.days += days;
    if (x.kind === 'stay') {
      const want = suggestStay(id).days, share = Math.min(1, days / Math.max(1, want));
      for (const y of stayPlaces(id)) {
        const n = daysFor(y.p), pc = C(isoOf(y.p.country));
        let eur = n * 2 * (pc.act + 10);
        if (y.d > 120) { const room = state.budget.hotel ? Math.min(pc.hotel, state.budget.hotel) : pc.hotel; eur += (Math.ceil(n) + 1) * (room + pc.out) + 2 * y.d * 0.12; }   // sleeping inland, and getting there
        pay('ashore', eur * share, id);
      }
    }
  });
  for (const [land, s] of seen) for (const w of [0, 1]) {
    const v = visaOf(land, w);
    if (v && v.stay && s.days > v.stay + 1) limits.push({ land, port: s.port, who: w, stay: v.stay, days: Math.round(s.days) });
  }
  const months = r.total / 30.44, active = away / 30.44, years = r.total / 365.25;
  const ownership = (T.ins + T.maint) / 100 * years * T.boat, insurance = T.ins / 100 * years * T.boat, upkeep = T.maint / 100 * years * T.boat;
  const life = active * (90 + T.personal);                          // internet and phone, then health insurance, clothes, small things
  const base = Object.values(sum).reduce((a, b) => a + b, 0) + life, buffer = (base + ownership) * 0.1;
  const running = base + ownership + buffer;
  const refit = T.boat * T.refit / 100, resale = T.boat * T.resale / 100;
  // how expensive may the boat be, if everything together must stay within the total?
  const k = 1 + T.refit / 100 + (T.ins + T.maint) / 100 * years * 1.1;
  const afford = (T.total - base * 1.1) / k;
  return { ...sum, insurance, upkeep, life, buffer, running, refit, resale, months, active, years, perMonth: running / Math.max(1, active), upfront: T.boat + refit, all: T.boat + refit + running, net: T.boat + refit + running - resale, afford, perStop, legs, lands: [...seen], limits };
}
