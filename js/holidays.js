// "Next year we have two weeks: what is our priority?"
// Trips are hand-made: a few bases where you stay put, with real driving times. Nothing is strung together by distance alone.
import { allPlaces, placeById, verdict, atSea, daysFor, trips, HOME, HOMES, setHome } from './data.js';
import { state, score, weight, extra, save } from './store.js';
import { $, esc, km, arc, days, norm, n0, MONTHS, monthRange, toast } from './util.js';
import { badge, wanted } from './scale.js';
import { thumb, tiny } from './photos.js';
import { openDetail } from './detail.js';
import { packing } from './gear.js';
import { tripCost, tripCountries, euro, visaLine, visaOf, landName, risky, interest } from './costs.js';
import { drawRoute, drawBases, fit, setFilter, COLORS } from './map.js';

const SPAN = {
  weekend: { text: 'Long weekend', min: 3, max: 5, days: 4 },
  holiday: { text: '1–2 weeks', min: 6, max: 15, days: 10 },
  long: { text: '2–3 weeks', min: 14, max: 30, days: 18 },
};
const KIND = { all: 'All', road: 'Road trip', regular: 'Regular trip', city: 'City trip', sail: 'Sailing trip' };
const HEAD = { road: 'Road trips', regular: 'Regular trips', city: 'City trips', sail: 'Sailing trips' };
const ui = { span: 'holiday', kind: 'all', len: { weekend: 4, holiday: 10, long: 18 }, month: 0, year: new Date().getFullYear() + 1, pace: 'easy', car: 'own', sail: false, advice: false, q: '', open: null, more: 8 };
const D = () => ui.len[ui.span];

// all: hours per day on average with the way from home, for road trips
// drive: hours per day on average, leg: longest move, nights: per base on average, trip: longest day trip one way, way: share of days lost getting there
const PACE = {
  easy: { drive: 1.6, leg: 4.2, nights: 2, trip: 1.6, way: 0.4, all: 2.6 },
  normal: { drive: 2.4, leg: 6, nights: 1.4, trip: 2.6, way: 0.55, all: 3.7 },
};
const KNOTS = 5.5;
let shown = [];

export function hours(h) {
  if (h < 0.95) return `${Math.max(5, Math.round(h * 12) * 5)} min`;
  const m = Math.round(h * 6) * 10, rest = m % 60;
  return `${Math.floor(m / 60)} h${rest ? ` ${rest}` : ''}`;
}
const q = encodeURIComponent;
const google = (t, text) => `<a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q(t)}">${text}</a>`;

function placeValue(p, sailing) {
  if (!p || extra(p.id).visited || (risky(p) && !ui.advice)) return 0;
  let w = weight(p.id);
  if (!score(p.id)) w *= interest(p);                   // not rated yet: follow how much you like that part of the world
  if (ui.month && p.months && !p.months.includes(ui.month)) w *= 0.35;
  if (!sailing && !ui.sail && atSea(verdict(p).v)) w *= 0.2;
  return w;
}

// how long the car needs from home: part of a day, a day, or a day with a night on the way
const nightsOnWay = h => (h <= 9.5 ? 0 : h <= 19 ? 1 : 2);
const daysOnWay = h => (h <= 2.5 ? 0.25 : h <= 4.6 ? 0.5 : h <= 9.5 ? 1 : h <= 19 ? 2 : 3);

// Fit one trip into the days we have: shorten or lengthen stays, or leave out the first or last base.
function fitTrip(t, taken) {
  const len = D(), far = km(t.bases[0], HOME), P = PACE[ui.pace];
  const val = b => b.places.reduce((s, x) => s + (taken.has(x.id) ? 0 : placeValue(placeById(x.id), t.kind === 'sail')), 0) + (b.tip ? 1.4 : 0);

  if (t.kind === 'sail') {
    const travel = far > 5000 ? 2 : far > 1400 ? 1 : 0.5, least = Math.ceil(t.min + travel), own = Math.min(t.days, Math.floor(len - travel));
    if (len < least || (ui.span === 'weekend' && far > 900)) return { least, fits: false, far };
    const bases = t.bases.map(b => ({ ...b, n: b.nights, see: b.places.map(x => ({ ...x, p: placeById(x.id) })).filter(x => x.p), maybe: [], free: 0 }));
    let all = bases.reduce((s, b) => s + b.n, 0);
    for (let i = bases.length - 1; all > own - 1 && i > 0; i--) while (all > own - 1 && bases[i].n > 1) { bases[i].n--; all--; }
    while (all > own - 1 && bases.length > 3) { bases.pop(); all = bases.reduce((s, b) => s + b.n, 0); }
    while (all < own - 1) { const b = bases.slice(1).sort((a, c) => a.n - c.n)[0]; b.n++; all++; }
    const cut = bases.length < t.bases.length, z = bases[bases.length - 1];
    const backNm = cut ? Math.round(km(z, bases[0]) / 1.852 * 1.2) : t.backNm, nms = [...bases.slice(1).map(b => b.nm), backNm];
    const value = bases.reduce((s, b) => s + val(b), 0) * ({ learn: 1.35, easy: 1.15, medium: 0.9, hard: 0.6 }[t.level]) * (far > 5500 ? 0.6 : 1);
    return { fits: true, least, bases, legs: [], nm: nms.reduce((a, b) => a + b, 0), maxNm: Math.max(...nms), backNm, value, count: 1, used: Math.ceil(own + travel), spare: 0, far, dropped: t.bases.length - bases.length, drive: 0, perDay: 0, longest: 0 };
  }

  const road = t.kind === 'road', way = road || t.kind === 'city' ? t.home?.[HOME.name] : null;
  if (road && (!way || way[0] < 0.6)) return { least: 99, fits: false, far };       // no road, or right at home
  const onWay = road ? nightsOnWay(way[0]) + nightsOnWay(way[2]) : 0;
  const lost = road ? 1 + onWay : far > 5000 ? 2 : 1;                      // nights that are not spent at a base
  const N = len - lost;
  let bases = t.bases.map(b => ({ ...b, n: b.nights }));
  const total = () => bases.reduce((s, b) => s + b.n, 0);
  const least = bases.reduce((s, b) => s + b.min, 0) + lost;
  if (ui.span === 'weekend' && !road && far > 2600) return { least: Math.max(least, 6), fits: false, far };
  while (total() > N) {
    const c = bases.filter(b => b.n > b.min).sort((a, b) => (b.n - b.min) - (a.n - a.min) || val(a) - val(b))[0];
    if (c) { c.n--; continue; }
    if (bases.length < 2 || road) return { least, fits: false, far };       // leaving out a base would change the whole way there
    const ends = [bases[0], bases[bases.length - 1]], drop = val(ends[0]) < val(ends[1]) ? ends[0] : ends[1];
    const whole = bases.reduce((s, b) => s + val(b), 0);
    if (val(drop) > whole * 0.4) return { least, fits: false, far };
    bases = bases.filter(b => b !== drop);
  }
  const most = t.kind === 'city' ? 1 : 2;
  for (let spare = N - total(); spare > 0;) {
    const c = bases.filter(b => b.n < b.nights + most).sort((a, b) => (a.n - a.nights) - (b.n - b.nights) || val(b) - val(a))[0];
    if (!c) break;
    c.n++; spare--;
  }

  // what to see from each base, best first, as long as the days last
  let drive = 0, longest = 0, value = 0, count = 0, dist = 0;
  bases.forEach((b, i) => {
    let room = b.n - 0.25 - (road && i === 0 && !onWay ? Math.min(0.6, way[0] / 12) : 0);
    b.see = []; b.maybe = [];
    const list = b.places.map(x => ({ ...x, p: placeById(x.id) })).filter(x => x.p && !taken.has(x.id) && !extra(x.id).visited && (ui.advice || !risky(x.p)));
    for (const x of list) { x.v = placeValue(x.p); x.rate = x.v / (Math.min(daysFor(x.p), 2) + (x.h || 0)); }
    list.sort((a, c) => c.rate - a.rate);
    for (const x of list) {
      const need = Math.min(Math.max(0.5, daysFor(x.p)), Math.max(0.75, b.n - 0.5)) + Math.max(0, (x.h || 0) - 1) * 0.3;
      const tooFar = x.h !== null && x.h > P.trip && !wanted(x.id);
      if (need <= room + 0.3 && !tooFar) {
        b.see.push(x); room -= need; value += x.v; count++;
        if (x.h) { drive += 2 * x.h; dist += 2 * x.km; longest = Math.max(longest, 2 * x.h); }
      } else b.maybe.push(x);
    }
    if (b.tip) { value += 1.4; count++; room -= 0.5; }
    b.free = Math.max(0, Math.floor(room * 2) / 2);
  });
  const legs = bases.slice(1).map(b => ({ by: b.by, h: b.h, km: b.km || 0 }));
  if (t.end === 'back' && bases.length > 1 && bases.length === t.bases.length) legs.push({ by: t.backBy, h: t.backH, back: true });
  let maxLeg = 0;
  for (const l of legs) if (l.by === 'drive') { drive += l.h; dist += l.km || 0; maxLeg = Math.max(maxLeg, l.h); longest = Math.max(longest, l.h); }
  const used = total() + lost, perDay = drive / Math.max(1, used), wayDays = road ? daysOnWay(way[0]) + daysOnWay(way[2]) : 0;
  const calm = perDay <= P.drive + (road ? 0.4 : 0) && maxLeg <= P.leg + (road ? 1 : 0) && total() / bases.length >= P.nights - (road ? 0.51 : 0.01) && wayDays / used <= P.way && (!road || (drive + way[0] + way[2]) / used <= P.all);
  return { fits: calm, tooHard: !calm, least, bases, legs, drive, perDay, longest, value, count, used, spare: len - used, far, dropped: t.bases.length - bases.length, way, onWay, km: road ? dist + way[1] + way[3] : 0 };
}

const mood = r => (r.perDay <= 0.75 ? 'Very relaxed' : r.perDay <= 1.4 ? 'Comfortable' : r.perDay <= 2 ? 'Some driving' : 'A lot of driving');
function rightKind(t) {
  if (ui.kind === 'all') return true;
  if (ui.kind === 'road') return (t.kind === 'road' && ui.car !== 'rent') || (t.rental && ui.car !== 'own');
  return t.kind === ui.kind;
}

function plan() {
  const taken = new Set(state.trips.flatMap(t => t.stops)), done = new Set(state.trips.map(t => t.name));
  const words = norm(ui.q).split(/\s+/).filter(Boolean), all = [];
  let over = 0;
  trips.forEach((t, i) => {
    if (done.has(t.title) || !rightKind(t)) return;
    if (words.length) {
      const hay = norm(`${t.title} ${t.search} ${t.why || ''} ${t.bases.map(b => `${b.name} ${b.tip || ''} ${b.places.map(x => `${placeById(x.id)?.name} ${placeById(x.id)?.country}`).join(' ')}`).join(' ')}`);
      if (words.some(w => !hay.includes(w))) return;
    }
    const r = fitTrip(t, taken);
    const whole = t.bases.reduce((s, b) => s + b.places.reduce((a, x) => a + (taken.has(x.id) ? 0 : placeValue(placeById(x.id), t.kind === 'sail')), 0) + (b.tip ? 1.4 : 0), 0);
    const season = ui.month && !t.months.includes(ui.month) ? 0.3 : 1;
    // a 4-day trip is not a good answer to "we have two weeks", and a week is short for the other side of the world
    let fill = r.fits ? Math.min(1, 0.4 + 0.6 * r.used / D()) * (r.far > 5500 && D() < 9 ? 0.4 : 1) : 1;
    if (r.fits && r.way && t.kind === 'road') fill *= 1 - 0.5 * Math.min(1, (daysOnWay(r.way[0]) + daysOnWay(r.way[2])) / r.used);
    if (t.kind === 'city' && ui.span !== 'weekend') fill *= 0.6;
    const cost = r.fits ? tripCost(t, r) : null;
    if (cost && state.budget.max && cost.total > state.budget.max) { over++; return; }
    all.push({ t, i, r, cost, rank: (r.fits ? r.value : whole) * season * fill, whole });
  });
  const ok = all.filter(x => x.r.fits && (words.length || (x.r.count && x.rank > 0.4))).sort((a, b) => b.rank - a.rank);
  const longer = all.filter(x => !x.r.fits && x.r.least < 60 && x.whole > (words.length ? -1 : 4)).sort((a, b) => b.whole - a.whole);
  return { ok, longer, over };
}

// ---------- the panel
const seg = (name, opts, cur) => `<div class="tabs" role="group">${Object.entries(opts).map(([k, t]) => `<button data-${name}="${k}" aria-pressed="${cur === k}">${t.text || t}</button>`).join('')}</div>`;
const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`;

export function drawHolidays() {
  const { ok, longer, over } = plan(), S = SPAN[ui.span];
  let groups;
  if (ui.kind === 'all') {
    groups = Object.keys(HEAD).map(k => [k, ok.filter(x => x.t.kind === k).slice(0, 3)]).filter(g => g[1].length)
      .sort((a, b) => (ui.span === 'weekend' ? 0 : b[1][0].rank - a[1][0].rank));
    shown = groups.flatMap(g => g[1]);
  } else {
    shown = ok.slice(0, ui.more);
    groups = [[null, shown]];
  }
  const fresh = ui.open === null && shown.length > 0;
  if (fresh) ui.open = ui.kind === 'all' ? -1 : shown[0].i;       // the overview stays compact until you pick one
  const reach = new Set(trips.flatMap(t => t.bases.flatMap(b => b.places.map(x => x.id)))), planned = new Set(state.trips.flatMap(t => t.stops));
  const alone = allPlaces().filter(p => wanted(p.id) && !reach.has(p.id) && !planned.has(p.id) && !extra(p.id).visited && (ui.advice || !risky(p))).sort((a, b) => score(b.id) - score(a.id));
  const anyRated = allPlaces().some(p => score(p.id)), land = ui.kind !== 'sail';
  $('#panel').innerHTML = `<div class="stack">
    <h2>Holidays</h2>
    ${seg('span', SPAN, ui.span)}
    ${seg('kind', KIND, ui.kind).replace('class="tabs"', 'class="tabs wrap"')}
    <div class="grid2">
      <label class="f">Days, with travel<input type="number" min="${S.min}" max="${S.max}" data-u="days" value="${D()}"></label>
      <label class="f">Month<select data-u="month">${opt(0, 'Any month', ui.month)}${MONTHS.map((m, i) => opt(i + 1, m, ui.month)).join('')}</select></label>
      ${land ? `<label class="f">Pace<select data-u="pace">${opt('easy', 'Relaxed, little driving', ui.pace)}${opt('normal', 'Busier', ui.pace)}</select></label>` : ''}
      <label class="f">Where<input type="search" data-u="q" placeholder="Any country or place" value="${esc(ui.q)}"></label>
      ${ui.kind === 'road' ? `<label class="f">Car<select data-u="car">${opt('own', 'Our car, from home', ui.car)}${opt('rent', 'Fly and rent a car', ui.car)}${opt('any', 'Both', ui.car)}</select></label>` : ''}
      ${ui.kind === 'road' || ui.kind === 'all' ? `<label class="f">Starting from<select data-home>${Object.keys(HOMES).map(h => opt(h, h, HOME.name)).join('')}</select></label>` : ''}
    </div>
    ${budgetBox(over)}
    ${land && ui.kind !== 'city' ? `<div class="stack tight">
      ${ui.kind === 'road' && ui.car === 'own' ? '' : `<label class="check"><input type="checkbox" data-u="sail" ${ui.sail ? 'checked' : ''}>Include places we could save for the world tour</label>`}
      <label class="check"><input type="checkbox" data-u="advice" ${ui.advice ? 'checked' : ''}>Include places with travel warnings</label></div>` : ''}
    ${anyRated ? '' : '<p class="sm warn">You have not rated anything yet, so every place counts the same. Rate some in Discover first.</p>'}
    ${groups.map(([k, list]) => `${k ? `<div class="ghead"><h3>${HEAD[k]}</h3><button class="link" data-kind="${k}">See all</button></div>` : ''}<div class="stack">${list.map(card).join('')}</div>`).join('')}
    ${shown.length ? '' : '<p class="soft">No trip fits. Try more days, the busier pace, or another month.</p>'}
    ${ui.kind !== 'all' && ok.length > ui.more ? '<button class="btn" data-more>Show more trips</button>' : ''}
    ${longer.length ? `<details><summary>Worth more time than ${D()} days</summary>${longer.slice(0, 10).map(x => `<button class="rowitem" data-grow="${x.r.tooHard ? 0 : x.r.least}" data-i="${x.i}"><div><b>${esc(x.t.title)}</b><small>${x.r.tooHard ? 'Too much driving at this pace' : `Needs at least ${x.r.least} days`}</small></div></button>`).join('')}</details>` : ''}
    ${alone.length && ui.kind !== 'sail' ? `<details><summary>Places you want that are in no trip yet: ${alone.length}</summary>${alone.slice(0, 40).map(p => `<div class="rowitem"><div><b>${esc(p.name)}</b><small>${esc(p.country)}</small></div><a class="link" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q(`${p.name} ${p.country} itinerary how many days`)}">Find itineraries</a></div>`).join('')}</details>` : ''}
    ${state.trips.length ? `<div class="hr"></div><h2>Planned trips</h2>${yearCosts()}<div class="stack">${[...state.trips].sort((a, b) => a.year - b.year || a.month - b.month).map(saved).join('')}</div>` : ''}
    <p class="credit">Driving times from OpenStreetMap, without traffic or stops. Prices are estimates for two: World Bank price levels, EU fuel prices of November 2026, visas from Wikipedia. Check before you book.</p>
  </div>`;
  paint();
  if (fresh) zoom();
}

const BY = { drive: 'drive', fly: 'flight with transfers', train: 'train', boat: 'ferry or boat' };
const near = x => (x.h === null ? 'by boat, train or on foot' : x.h < 0.12 ? 'on the spot' : `${hours(x.h)} drive`);
const legText = (by, h, dist) => (!h ? BY[by] : by === 'drive' ? `${hours(h)} drive${dist ? `, ${dist} km` : ''}` : `About ${hours(h)} ${BY[by]}`);
const sailText = nm => `${nm} nm, about ${hours(nm / KNOTS)} of sailing`;
const pic = p => (thumb(p) ? `<img loading="lazy" alt="" src="${esc(tiny(thumb(p)))}">` : '<span class="ph"></span>');

function baseHtml(b, i, sailing) {
  const row = (x, dim) => `<button class="rowitem ${dim ? 'dim' : ''}" data-open="${esc(x.id)}">${pic(x.p)}<div><b>${esc(x.p.name)}</b><small>${sailing ? `${x.km} km away` : near(x)}${ui.month && x.p.months && !x.p.months.includes(ui.month) ? ' · not its best month' : ''}</small></div>${badge(x.id, '<span class="lv">–</span>')}</button>`;
  return `${i ? `<p class="leg">${sailing ? sailText(b.nm) : legText(b.by, b.h, b.km)}</p>` : ''}
    <div class="base"><h4>${b.n} night${b.n > 1 ? 's' : ''} ${sailing ? 'at' : 'in'} ${esc(b.name)}</h4>${b.tip ? `<p class="sm">${esc(b.tip)}</p>` : ''}${b.see.map(x => row(x)).join('')}${b.free >= 1 ? `<p class="sm soft">${days(b.free)} free to wander or rest</p>` : ''}${b.maybe.length ? `<details><summary class="sm">If you have energy left</summary>${b.maybe.map(x => row(x, true)).join('')}</details>` : ''}</div>`;
}

// one Google Maps link per stretch that is driven without a flight or train in between
function mapsLinks(t, r) {
  const at = b => `${b.lat},${b.lon}`, runs = [[r.bases[0]]];
  if (t.kind === 'sail' || t.kind === 'city') return '';
  for (const b of r.bases.slice(1)) { if (b.by === 'drive') runs[runs.length - 1].push(b); else runs.push([b]); }
  if (t.kind === 'road') { runs[0].unshift(HOME); runs[runs.length - 1].push(HOME); }
  return runs.filter(x => x.length > 1).map((x, i, a) => `<a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&amp;travelmode=driving&amp;origin=${at(x[0])}&amp;destination=${at(x[x.length - 1])}${x.length > 2 ? `&amp;waypoints=${q(x.slice(1, -1).map(at).join('|'))}` : ''}">Drive on Google Maps${a.length > 1 ? ` ${i + 1}` : ''}</a>`).join('');
}

const sleepText = h => (nightsOnWay(h) ? ` with ${nightsOnWay(h) === 1 ? 'a night' : '2 nights'} on the way` : '');
const LEVEL = { learn: 'Good for learning', easy: 'Easy sailing', medium: 'Some experience', hard: 'Experienced crew' };
function facts(t, r) {
  if (t.kind === 'sail') return `<b>${LEVEL[t.level]}</b>: ${r.nm} nm in all, longest day ${r.maxNm} nm (${hours(r.maxNm / KNOTS)}).`;
  if (t.kind === 'city') return `<b>${r.way ? `${hours(r.way[0])} by car from ${HOME.name}` : `About ${hours(r.far / 750 + 0.6)} flight`}</b>.`;
  const inPlace = r.drive > 0.5 ? `${hours(r.drive)} of driving there, longest day ${hours(r.longest)}` : 'hardly any driving there';
  if (t.kind === 'road') return `<b>${hours(r.way[0])} from ${HOME.name} to the start</b>${sleepText(r.way[0])}. Then ${inPlace}, and ${hours(r.way[2])} home${sleepText(r.way[2])}.`;
  return `<b>${mood(r)}</b>: ${inPlace}.`;
}

// ---------- money
let budgetOpen = false;
function budgetBox(over) {
  const b = state.budget, num = (k, label, min, max, step = 1, ph = '') => `<label class="f">${label}<input type="number" data-b="${k}" min="${min}" max="${max}" step="${step}" value="${b[k] || ''}" placeholder="${ph}"></label>`;
  return `<details class="budget" ${budgetOpen ? 'open' : ''}><summary>Our budget: ${b.hotel ? `hotel up to €${b.hotel}` : 'average hotels'}, ${b.food ? `food up to €${b.food} each a day` : 'average food'}${b.max ? `, ${euro(b.max)} in all` : ''}</summary>
    <div class="grid2">
      ${num('hotel', 'Hotel per night, at most €', 0, 1000, 5, 'average')}
      ${num('food', 'Food per person and day, at most €', 0, 300, 1, 'average')}
      <label class="f">How you eat<select data-b="style">${opt('cook', 'Mostly cooking', b.style)}${opt('mix', 'Half cooking, half out', b.style)}${opt('out', 'Eating out', b.style)}</select></label>
      ${num('max', 'Whole trip, at most €', 0, 50000, 50, 'no limit')}
      ${num('litres', 'Our car, litres per 100 km', 2, 20, 0.1)}
      <label class="f">Fuel<select data-b="fuel">${opt('diesel', 'Diesel', b.fuel)}${opt('petrol', 'Petrol', b.fuel)}</select></label>
    </div>
    <label class="check"><input type="checkbox" data-b="skipper" ${b.skipper ? 'checked' : ''}>Sailing trips with a hired skipper</label></details>
    ${over ? `<p class="sm soft">${over} trip${over > 1 ? 's are' : ' is'} above ${euro(b.max)} and hidden.</p>` : ''}`;
}
function costHtml(c) {
  return `<details class="cost"><summary>About ${euro(c.total)} for two, ${euro(c.total / 2)} each</summary>
    <table>${c.parts.map(([l, e, n]) => `<tr><td>${esc(l)}${n ? `<small>${esc(n)}</small>` : ''}</td><td>${euro(e)}</td></tr>`).join('')}</table>
    ${c.capped.length ? `<p class="sm warn">Average rooms cost more than your limit: ${esc(c.capped.join(', '))}. Book early or choose simple places.</p>` : ''}</details>`;
}
function visaHtml(t) {
  const list = tripCountries(t).filter(c => [0, 1].some(w => { const v = visaOf(c, w); return v && v.t !== 'free'; }));
  return list.length ? `<div class="sm">${list.map(c => `<p><span class="soft">Visa ${esc(landName(c))}.</span> ${visaLine(c)}</p>`).join('')}</div>` : '';
}

function card({ t, r, i, cost }) {
  const on = ui.open === i, off = ui.month && !t.months.includes(ui.month), back = r.legs.find(l => l.back), sailing = t.kind === 'sail';
  const refuel = r.km ? Math.floor(r.km / state.range) : 0;
  return `<div class="card stack tight ${on ? 'on' : ''}">
    <button class="cardhead" data-show="${i}" aria-expanded="${on}"><h3>${esc(t.title)}</h3><span class="soft">${r.used} days<br>${euro(cost.total)}</span></button>
    ${t.why ? `<p class="sm">${esc(t.why)}</p>` : t.kind === 'city' ? `<p class="sm">${esc(t.bases[0].tip)}</p>` : ''}
    ${t.kind === 'city' ? '' : `<p class="sm soft">${r.bases.map(b => `${esc(b.name.replace(/ \(.*\)/, ''))} ${b.n}`).join(', ')} nights</p>`}
    <p class="sm">${facts(t, r)} ${off ? `<span class="warn">Better in ${monthRange(t.months)}.</span>` : `Best in ${monthRange(t.months)}.`}</p>
    ${on ? `${sailing ? `<p class="sm"><span class="soft">Boat and licence:</span> ${esc(t.licence)}.</p>` : ''}
      ${t.kind === 'road' ? `<p class="leg">${hours(r.way[0])} drive, ${n0(r.way[1])} km from ${HOME.name}${sleepText(r.way[0])}</p>` : ''}
      ${t.kind === 'city' ? r.bases.map(b => baseHtml({ ...b, tip: '' }, 0)).join('') : r.bases.map((b, k) => baseHtml(b, k, sailing)).join('')}
      ${back ? `<p class="leg">Back to the start: ${legText(back.by, back.h)}</p>` : ''}
      ${sailing ? `<p class="leg">Back to ${esc(r.bases[0].name)}: ${sailText(r.backNm)}</p>` : ''}
      ${t.kind === 'road' ? `<p class="leg">${hours(r.way[2])} drive home, ${n0(r.way[3])} km${sleepText(r.way[2])}</p>
        <p class="sm">About <b>${n0(r.km)} km</b> in all: ${refuel ? `${refuel} refuel${refuel > 1 ? 's' : ''} on the way` : 'one tank is enough'} with ${n0(state.range)} km range.</p>` : ''}
      ${r.dropped ? `<p class="sm soft">Shortened to fit: the full trip has ${t.bases.length} ${sailing ? 'stops' : 'bases'}.</p>` : ''}
      ${r.spare > 0 ? `<p class="sm soft">You have ${days(r.spare)} left over for a longer stay.</p>` : ''}
      ${costHtml(cost)}${visaHtml(t)}
      <h4>${sailing ? 'Find a boat' : 'Compare with what others do'}</h4>
      <div class="row">${sailing ? google(t.search, 'Charter boats') + google(`${t.search} skipper flotilla`, 'With skipper or flotilla') + (t.level === 'learn' ? google(`sailing course ${t.title} beginner week`, 'Learn to sail here') : '') + google(`${t.title} sailing itinerary one week`, 'Itineraries')
    : google(`${r.used} days ${t.search} itinerary`, 'Itineraries online') + (t.kind === 'city' ? google(`${t.title} archaeological museum tickets`, 'Museums') : t.kind === 'road' ? google(`${t.search} roof tent campsites`, 'Campsites') : google(`${t.search} small group tour ${r.used} days`, 'Organised tours'))}${mapsLinks(t, r)}</div>
      ${pack(t)}
      <div class="row"><label class="sm soft">Year <input type="number" id="tripYear" style="width:90px" value="${ui.year}" min="2020" max="2100"></label><button class="btn main" data-save="${i}">Plan this trip</button></div>` : ''}
  </div>`;
}

// ---------- packing list
function pack(t, open) {
  const ticks = state.packed[t.title] || {}, groups = packing(t, state.sleep), all = groups.flatMap(g => g[1]), n = all.filter(x => ticks[x]).length;
  return `<details class="pack" ${open ? 'open' : ''}><summary>What to take${n ? `: ${n} of ${all.length} packed` : ''}</summary>
    ${t.kind === 'road' ? `<label class="f">Where you sleep<select data-sleep>${opt('roof', 'Roof tent', state.sleep)}${opt('tent', 'Tent', state.sleep)}${opt('hotel', 'Hotels and rooms', state.sleep)}</select></label>` : ''}
    ${groups.map(([g, items]) => `<h4>${esc(g)}</h4>${items.map(x => `<label class="check"><input type="checkbox" data-pack="${esc(t.title)}" value="${esc(x)}" ${ticks[x] ? 'checked' : ''}>${esc(x)}</label>`).join('')}`).join('')}
    <p class="sm soft">Car rules change: check them before you leave. ${t.kind === 'road' ? `<a class="sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q(`ADAC ${t.title} Vignette Maut Vorschriften Auto Ausland`)}">ADAC rules</a> and ` : ''}<a class="sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q(`${t.search} packing list`)}">more packing lists</a></p></details>`;
}

function yearCosts() {
  const y = {};
  for (const t of state.trips) if (t.cost) y[t.year] = (y[t.year] || 0) + t.cost;
  return Object.keys(y).length ? `<p class="sm">To set aside: ${Object.entries(y).map(([k, v]) => `<b>${euro(v)}</b> for ${k}`).join(', ')}.</p>` : '';
}
const saved = t => {
  const full = trips.find(x => x.title === t.name);
  return `<div class="card stack tight"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h3>${esc(t.name)}</h3><span class="soft" style="white-space:nowrap">${t.month ? `${MONTHS[t.month - 1]} ` : ''}${t.year}</span></div>
  <p class="sm soft">${t.days} days${t.cost ? `, about ${euro(t.cost)}` : ''}${t.stops.length ? `: ${esc(t.stops.map(id => placeById(id)?.name).filter(Boolean).join(', '))}` : ''}</p>
  ${full ? pack(full) : ''}
  <div class="row"><button class="link" data-view-trip="${esc(t.id)}">Show</button><button class="link quiet" data-done="${esc(t.id)}">We did it</button><button class="link quiet" data-del="${esc(t.id)}">Remove</button></div></div>`;
};

// ---------- the globe
const current = () => shown.find(x => x.i === ui.open);
const seen = r => r.bases.flatMap(b => b.see.map(x => x.p));
function paint() {
  const c = current();
  if (!c) { drawRoute([]); drawBases([]); setFilter(p => wanted(p.id)); return; }
  const b = c.r.bases, k = c.t.kind, own = k === 'road', sea = k === 'sail';
  const parts = [{ line: arc(HOME, b[0]), color: '#ffffff', dash: !own }];
  for (let i = 1; i < b.length; i++) parts.push({ line: arc(b[i - 1], b[i]), color: sea ? COLORS.sail : COLORS.fly, dash: !sea && b[i].by !== 'drive' });
  if (sea) parts.push({ line: arc(b[b.length - 1], b[0]), color: COLORS.sail }); else for (const x of b) for (const s of x.see) parts.push({ line: arc(x, s.p), color: '#ffe3b8' });
  parts.push({ line: arc(sea ? b[0] : b[b.length - 1], HOME), color: '#ffffff', dash: !own });
  drawRoute(parts);
  drawBases(b);
  const ids = new Set(seen(c.r).map(p => p.id));
  setFilter(p => ids.has(p.id));
}
function zoom() { const c = current(); if (c) fit([...c.r.bases, ...(c.t.kind === 'sail' ? [] : seen(c.r)), ...(c.t.kind === 'road' && c.r.far < 900 ? [HOME] : [])]); }
function redraw() { const el = $('#panel'), y = el.scrollTop, open = !!$('.card.on .pack[open]'); drawHolidays(); if (open) { const p = $('.card.on .pack'); if (p) p.open = true; } el.scrollTop = y; }
function restart() { ui.open = null; ui.more = 8; drawHolidays(); $('#panel').scrollTop = 0; }

export function initHolidays() {
  const el = $('#panel');
  const here = () => document.body.dataset.view === 'holidays';
  el.addEventListener('change', e => {
    if (!here()) return;
    const x = e.target;
    if (x.id === 'tripYear') { ui.year = +x.value || ui.year; return; }
    if (x.dataset.pack) {
      const list = state.packed[x.dataset.pack] || (state.packed[x.dataset.pack] = {});
      if (x.checked) list[x.value] = true; else delete list[x.value];
      save('trips');
      return;
    }
    if (x.dataset.b) {
      const k = x.dataset.b;
      state.budget[k] = x.type === 'checkbox' ? x.checked : k === 'style' || k === 'fuel' ? x.value : Math.max(0, +x.value || 0);
      if (k === 'litres' && !state.budget.litres) state.budget.litres = 5.5;
      budgetOpen = true;
      save('trips');
      const y = el.scrollTop; ui.open = ui.open === null ? null : ui.open; drawHolidays(); el.scrollTop = y;
      return;
    }
    if (x.dataset.sleep !== undefined) { state.sleep = x.value; save('trips'); redraw(); return; }
    if (x.dataset.home !== undefined) { state.home = x.value; setHome(x.value); save('trips'); restart(); return; }
    const k = x.dataset.u;
    if (!k) return;
    if (k === 'days') { const S = SPAN[ui.span]; ui.len[ui.span] = Math.min(S.max, Math.max(S.min, +x.value || S.days)); } else ui[k] = x.type === 'checkbox' ? x.checked : k === 'month' ? +x.value : x.value;
    restart();
  });
  el.addEventListener('click', e => {
    if (!here()) return;
    const d = e.target.closest('button')?.dataset;
    if (!d) return;
    if (d.span) { ui.span = d.span; restart(); }
    if (d.kind) { ui.kind = d.kind; restart(); }
    if (d.open) openDetail(d.open);
    if (d.show) { ui.open = ui.open === +d.show ? -1 : +d.show; redraw(); zoom(); }
    if (d.more !== undefined) { ui.more += 10; redraw(); }
    if (d.grow !== undefined) {
      const t = trips[+d.i], need = +d.grow;
      if (need) { ui.span = need > 15 ? 'long' : need > 5 ? 'holiday' : 'weekend'; ui.len[ui.span] = Math.min(SPAN[ui.span].max, Math.max(ui.len[ui.span], need)); } else ui.pace = 'normal';
      ui.kind = t.kind; ui.q = t.title; ui.open = +d.i;
      drawHolidays(); el.scrollTop = 0; zoom();
    }
    if (d.save) {
      const c = shown.find(x => x.i === +d.save);
      state.trips.push({ id: Date.now().toString(36), name: c.t.title, year: ui.year, month: ui.month || c.t.months[0], days: c.r.used, cost: Math.round(c.cost.total), stops: seen(c.r).map(p => p.id) });
      ui.open = null;
      toast(`${c.t.title} is planned for ${ui.year}. Its packing list is kept with it.`);
      save('trips');
      drawHolidays();
    }
    const trip = id => state.trips.find(t => t.id === id);
    if (d.viewTrip) {
      const tr = trip(d.viewTrip), full = trips.find(x => x.title === tr.name), s = tr.stops.map(placeById).filter(Boolean), ids = new Set(s.map(p => p.id));
      ui.open = -1; redraw(); drawRoute([]); drawBases(full ? full.bases : []); setFilter(p => ids.has(p.id)); fit([...(full ? full.bases : []), ...s]);
    }
    if (d.del) { state.trips = state.trips.filter(t => t.id !== d.del); ui.open = null; save('trips'); drawHolidays(); }
    if (d.done) {
      for (const id of trip(d.done).stops) state.places[id] = { ...extra(id), visited: true };
      state.trips = state.trips.filter(t => t.id !== d.done);
      ui.open = null;
      save('trips');
      drawHolidays();
    }
  });
}

export function enterHolidays() { ui.open = null; drawHolidays(); }
