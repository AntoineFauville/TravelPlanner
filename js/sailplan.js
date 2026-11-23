// Works out the route and the calendar. Planning estimates only, not for navigation.
import { legs, portById, ports } from './data.js';
import { ZONES } from './map.js';
import { DAY } from './util.js';
import { landOf, visaHard } from './costs.js';

const month = t => new Date(t).getUTCMonth() + 1;
const UPWIND = 1.5, UPWIND_MAX = 1300;   // short hops against the wind are possible, but slow and unpleasant
const REST = 2;                     // days in a port we only pass through

let adj = null;
function graph() {
  if (adj) return adj;
  adj = new Map(ports.map(p => [p.id, []]));
  for (const l of legs) {
    adj.get(l.a).push({ to: l.b, leg: l, rev: false });
    if (l.both) adj.get(l.b).push({ to: l.a, leg: l, rev: true });
    else if (l.nm <= UPWIND_MAX && !legs.some(x => x.a === l.b && x.b === l.a)) adj.get(l.b).push({ to: l.a, leg: l, rev: true, hard: true });
  }
  return adj;
}

export function storm(zone, t) {
  const z = ZONES[zone];
  return z && z.months.includes(month(t)) ? z : null;
}
function stormDays(zone, from, to) {
  if (!ZONES[zone]) return 0;
  let n = 0;
  for (let t = from; t < to; t += 5 * DAY) if (storm(zone, t)) n += 5;
  return n;
}
// first day on or after t when this passage is in season
function nextWindow(leg, t) {
  if (leg.months.includes(month(t))) return t;
  const d = new Date(t);
  for (let i = 1; i <= 12; i++) {
    const s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1);
    if (leg.months.includes(month(s))) return s;
  }
  return Infinity;
}

let hardMemo = new Map();
function hardPort(id) {
  if (!hardMemo.has(id)) hardMemo.set(id, visaHard(landOf(id)));
  return hardMemo.get(id);
}
// Quickest safe way from one port to another, leaving at time t. Waiting in a storm zone counts extra,
// so the route goes to a safe port (New Zealand, Río Dulce, Trinidad...) when a season has to be waited out.
function hop(from, to, t, o) {
  const best = new Map([[from, { cost: 0, t, prev: null }]]), done = new Set();
  for (;;) {
    let cur = null;
    for (const [k, v] of best) if (!done.has(k) && (!cur || v.cost < best.get(cur).cost)) cur = k;
    if (!cur) return null;
    if (cur === to) break;
    done.add(cur);
    const at = best.get(cur);
    for (const e of graph().get(cur)) {
      if (done.has(e.to) || (o.safeRed && e.leg.flags.includes('R'))) continue;
      const ready = at.t + (cur === from ? 0 : REST * DAY);
      const dep = nextWindow(e.leg, ready);
      if (dep === Infinity) continue;
      const nm = e.leg.nm * (e.hard ? UPWIND : 1), sea = nm / (o.knots * 24), arr = dep + sea * DAY;
      const cost = at.cost + (arr - at.t) / DAY + 2 * stormDays(portById.get(cur).zone, ready, dep) + (e.hard ? sea + 5 : 0) + (o.easyVisa && e.to !== to && hardPort(e.to) ? 15 : 0);
      if (!best.has(e.to) || cost < best.get(e.to).cost) best.set(e.to, { cost, t: arr, dep, sea, nm, prev: cur, e });
    }
  }
  const path = [];
  for (let k = to; best.get(k).prev; k = best.get(k).prev) path.unshift({ ...best.get(k), from: best.get(k).prev, to: k });
  return path;
}

export const stayFor = (id, o) => o.stays[id] ?? 7;

// o: { start, month, year, knots, stops, stays, home, safeRed, sail (months per section, 0 = one go), rest (months at home) }
export function simulate(o, order) {
  const t0 = Date.UTC(o.year, o.month - 1, 1);
  let t = t0, at = o.start, secStart = t, sec = 0;
  const items = [], missing = [];
  let sea = 0, nm = 0, ashore = 0, wait = 0, home = 0;
  const targets = order.filter(s => s !== o.start);
  const back = o.home && targets.length > 0;
  if (back) targets.push(o.start);
  const push = x => items.push({ sec, ...x });
  const stormy = (id, a, b, min) => {
    const z = portById.get(id).zone;
    return stormDays(z, a, b) > min ? ZONES[z].name : null;
  };
  const flyHome = (id, until, why) => {
    home += (until - t) / DAY;
    push({ kind: 'home', id, t0: t, t1: until, storm: stormy(id, t, until, 20), why });
    t = until; secStart = t; sec++;
  };
  // stay home until the next passage is in season, instead of waiting on the boat
  const homeUntil = (id, target) => {
    const until = t + o.rest * 30.44 * DAY, next = hop(id, target, until, o);
    return next && next.length ? Math.max(until, next[0].dep) : until;
  };

  targets.forEach((target, i) => {
    const returning = back && i === targets.length - 1;
    let path = hop(at, target, t, o), guard = 0;
    while (path && path.length && guard++ < 80) {
      const s = path[0], P = portById.get(s.from), prev = items[items.length - 1];
      const passing = prev && prev.kind === 'sea';
      const ready = t + (passing ? REST * DAY : 0);
      const dep = Math.max(s.dep, nextWindow(s.e.leg, ready)), w = dep - ready;
      if (o.sail && P.leave && s.from !== o.start) {
        const months = (t - secStart) / DAY / 30.44;
        if (w > 45 * DAY && months > 1) flyHome(s.from, dep, 'season');
        else if (months >= o.sail && !(i === targets.length - 1 && path[path.length - 1].t - t < 45 * DAY)) flyHome(s.from, homeUntil(s.from, target), 'section');
        if (t === secStart && items[items.length - 1]?.kind === 'home' && prev !== items[items.length - 1]) { path = hop(s.from, target, t, o); continue; }
      }
      path.shift();
      if (passing) ashore += REST;
      if (w > DAY) {
        wait += w / DAY;
        push({ kind: 'wait', id: s.from, t0: ready, t1: dep, storm: stormy(s.from, ready, dep, 10) });
      }
      const arr = dep + s.sea * DAY;
      sea += s.sea; nm += s.nm;
      push({ kind: 'sea', t0: dep, t1: arr, a: s.from, b: s.to, nm: s.nm, hard: !!s.e.hard, days: s.sea,
        line: s.e.rev ? [...s.e.leg.line].reverse() : s.e.leg.line, flags: s.e.leg.flags, via: s.to !== target });
      t = arr; at = s.to;
    }
    if (at !== target) { missing.push(target); return; }
    if (returning) return;
    const d = stayFor(target, o);
    push({ kind: 'stay', id: target, t0: t, t1: t + d * DAY, days: d, storm: stormy(target, t, t + d * DAY, 7) });
    ashore += d; t += d * DAY;
  });
  const risk = items.reduce((a, x) => a + (x.storm ? (x.t1 - x.t0) / DAY : 0), 0);
  const upwind = items.filter(x => x.hard).length;
  return { items, missing, risk, upwind, start: t0, end: t, sea, nm, ashore, wait, home, sections: sec + 1, total: (t - t0) / DAY };
}

// West-about order starting from the home port, then a few swaps when they save time.
export function bestOrder(o) {
  const n = ports.length, s0 = portById.get(o.start).seq;
  const rank = id => (portById.get(id).seq - s0 + n) % n;
  let order = [...new Set(o.stops)].filter(x => x !== o.start && portById.has(x)).sort((a, b) => rank(a) - rank(b));
  const quick = { ...o, sail: 0 };
  const val = ord => { const r = simulate(quick, ord); return r.total + r.risk + r.nm * 0.08 + r.upwind * 40 + r.missing.length * 5000; };
  let v = val(order);
  const stop = performance.now() + 1200;
  for (let again = true; again && performance.now() < stop;) {
    again = false;
    for (let i = 0; i < order.length && performance.now() < stop; i++) {
      const rest = order.filter((_, k) => k !== i);
      let best = null;
      for (let j = 0; j <= rest.length; j++) {
        if (j === i) continue;
        const alt = [...rest.slice(0, j), order[i], ...rest.slice(j)], x = val(alt);
        if (x < v - 2 && (!best || x < best.x)) best = { x, alt };
      }
      if (best) { v = best.x; order = best.alt; again = true; }
    }
  }
  return order;
}

// Which month to leave for the shortest, safest voyage.
export function bestDeparture(o, order) {
  let best = null;
  for (let m = 1; m <= 12; m++) {
    const r = simulate({ ...o, month: m }, order), x = r.total + r.risk;
    if (!r.missing.length && (!best || x < best.x - 1)) best = { month: m, total: r.total, risk: r.risk, x };
  }
  return best;
}

// What each stop adds to the whole voyage, in days.
export function marginal(o, order, total) {
  const out = {};
  for (const s of order) out[s] = total - simulate(o, order.filter(x => x !== s)).total;
  return out;
}
