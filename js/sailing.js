// The world tour: click countries, get a route, a calendar, and what is worth leaving for the boat.
import { allPlaces, ports, portById, verdict, daysFor, isDetour } from './data.js';
import { state, score, weight, extra, save } from './store.js';
import { $, esc, MONTHS, duration, days, n0, dateText, norm, km, toast } from './util.js';
import { reach, suggestStay } from './stays.js';
import { bestOrder, bestDeparture, simulate, marginal } from './sailplan.js';
import { drawPorts, drawRoute, showStorms, setFilter, fit, flyTo, look, zoomNow, popup, drawBases } from './map.js';
import { openDetail } from './detail.js';
import { openPort } from './port.js';
import { badge, wanted } from './scale.js';

const SECTION = ['#53cfe0', '#f7a8ff', '#ffe066', '#8ef0a0', '#ff9d7a', '#a9b8ff'];
const CLASSIC = ['lpa', 'min', 'mtq', 'sbl', 'gal', 'mqs', 'tua', 'tah', 'bor', 'vav', 'fij', 'vil', 'thu', 'kom', 'dps', 'cck', 'mau', 'reu', 'cap', 'hel', 'hor'];
let result = null, order = [], stormMonth = 0, seen = false, popped = null;

function add(id, quiet) {
  const s = state.sail;
  if (id === s.start || s.stops.includes(id)) return;
  s.stops.push(id);
  if (!quiet) { save('sail'); drawSailing(); }
}
function remove(id) { state.sail.stops = state.sail.stops.filter(x => x !== id); save('sail'); drawSailing(); }

export const isStop = id => state.sail.stops.includes(id);
export const isMust = id => state.sail.musts.includes(id);
export function addMust(id) {
  const s = state.sail;
  if (id === s.start) return toast(`${portById.get(id).label} is your starting port.`);
  if (!s.stops.includes(id)) s.stops.push(id);
  if (!s.musts.includes(id)) s.musts.push(id);
  save('sail');
  drawSailing();
  toast(`${portById.get(id).label} is a must on your world tour.`);
}
export function setMust(id, on) {
  state.sail.musts = state.sail.musts.filter(x => x !== id);
  if (on) state.sail.musts.push(id);
  save('sail');
  drawSailing();
}
export function removeStop(id) {
  state.sail.musts = state.sail.musts.filter(x => x !== id);
  remove(id);
}

export function onPort(id) { openPort(id); }
export function onCountry({ name, at }) {
  const list = ports.filter(p => p.country === name);
  if (list.length === 1) return openPort(list[0].id);
  popped?.remove();
  popped = popup(at, `<b>${esc(name)}</b>${list.map(p => `<button class="btn small" data-port="${p.id}">${esc(p.label)}</button>`).join('')}`);
  popped.getElement().addEventListener('click', e => {
    const b = e.target.closest('[data-port]');
    if (b) { popped.remove(); openPort(b.dataset.port); }
  });
}

// Pick the ports that reach most of your highest rated sailing places.
function suggest() {
  const val = new Map();
  for (const p of allPlaces()) {
    const s = score(p.id), v = verdict(p);
    if (!wanted(p.id) || v.v === 'fly' || extra(p.id).visited) continue;
    val.set(v.port.id, (val.get(v.port.id) || 0) + s * s * (v.v === 'sail' ? 1 : 0.6));
  }
  const musts = state.sail.musts.filter(id => portById.has(id) && id !== state.sail.start);
  const top = [...new Set([...musts, ...[...val].sort((a, b) => b[1] - a[1]).map(x => x[0])])].slice(0, Math.max(18, musts.length));
  if (!val.size) return toast('Rate some sailing places Super or Must in Discover first, then this builds your route.');
  state.sail.stops = [];
  top.forEach(id => add(id, true));
  const s = state.sail, dropped = [];
  s.auto = true;
  // leave out stops that would cost more than half a year each: those are better flown to
  for (let guard = 0; guard < 8 && s.stops.length > 3; guard++) {
    const f = full(s), ord = bestOrder(f), m = marginal(f, ord, simulate(f, ord).total);
    const worst = ord.filter(x => !s.musts.includes(x)).reduce((a, b) => (a === null || m[b] > m[a] ? b : a), null);
    if (worst === null || m[worst] < 180) break;
    dropped.push(portById.get(worst).label);
    s.stops = s.stops.filter(x => x !== worst);
  }
  save('sail');
  drawSailing();
  toast(`${s.stops.length} stop${s.stops.length === 1 ? '' : 's'} chosen from your ratings${musts.length ? ' and musts' : ''}.${dropped.length ? ` Left out because each adds over half a year: ${dropped.join(', ')}.` : ''}`);
}

// your own number of days where you set one, the suggestion everywhere else
const full = s => ({ ...s, stays: Object.fromEntries(s.stops.map(id => [id, s.stays[id] ?? suggestStay(id).days])) });

const opts = (list, cur) => list.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('');

export function drawSailing() {
  const s = state.sail, el = $('#panel'), y = el.scrollTop;
  order = s.auto ? [...ordered(s)] : s.stops.filter(x => portById.has(x) && x !== s.start);
  if (s.auto) s.stops = [...order];
  const o = full(s);
  result = order.length ? simulate(o, order) : null;
  const extraDays = result ? marginal(o, order, result.total) : {};
  const years = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() + i);
  el.innerHTML = `<div class="stack">
    <h2>Sailing world tour</h2>
    <div class="grid2">
      <label class="f">Start from<select data-s="start">${opts(ports.map(p => [p.id, `${p.name}, ${p.label}`]), s.start)}</select></label>
      <label class="f">Average boat speed, knots<input type="number" min="3" max="15" step="0.5" data-s="knots" value="${s.knots}"></label>
      <label class="f">Leave in<select data-s="month">${opts(MONTHS.map((m, i) => [i + 1, m]), s.month)}</select></label>
      <label class="f">Year<select data-s="year">${opts(years.map(x => [x, x]), s.year)}</select></label>
      <label class="f">Sail<select data-s="sail">${opts([[0, 'In one go'], [3, '3 months, then home'], [4, '4 months, then home'], [6, '6 months, then home'], [9, '9 months, then home'], [12, '12 months, then home']], s.sail)}</select></label>
      ${s.sail ? `<label class="f">Time at home<select data-s="rest">${opts([[2, '2 months'], [4, '4 months'], [6, '6 months'], [9, '9 months'], [12, '1 year']], s.rest)}</select></label>` : ''}
    </div>
    <div class="stack tight">
      <label class="check"><input type="checkbox" data-s="home" ${s.home ? 'checked' : ''}>Sail back to the starting port</label>
      <label class="check"><input type="checkbox" data-s="safeRed" ${s.safeRed ? 'checked' : ''}>Avoid the Red Sea and Gulf of Aden (security)</label>
    </div>
    <div class="stack tight">
      <h3>Countries and islands to visit</h3>
      <input list="portlist" id="portq" placeholder="Click a country or port, or type a name" aria-label="Add a stop">
      <datalist id="portlist">${ports.map(p => `<option value="${esc(p.label)}">${esc(p.name)}</option>`).join('')}</datalist>
      <div class="row"><button class="btn small" data-do="suggest">From our ratings</button><button class="btn small" data-do="classic">Classic route</button>${s.stops.length ? '<button class="link quiet" data-do="clear">Clear</button>' : ''}</div>
      ${order.length ? `<label class="check"><input type="checkbox" data-s="auto" ${s.auto ? 'checked' : ''}>Find the best order for us</label>` : ''}
    </div>
    ${order.length ? `<div>${order.map((id, i) => stopRow(id, i, extraDays[id])).join('')}</div>` : ''}
    ${result ? totals() + reached() + timeline() : '<p class="soft">Pick at least one stop to see the route, the dates and how long it takes.</p>'}
    <div class="stack tight"><h3>Storm seasons on the globe</h3>
      <div class="mstrip">${MONTHS.map((m, i) => `<button data-month="${i + 1}" aria-pressed="${stormMonth === i + 1}" title="${m}">${m[0]}</button>`).join('')}</div>
      <p class="sm soft">Pick a month to see in red where hurricanes, typhoons and cyclones form.</p></div>
    <p class="credit">A planning estimate from typical seasons and average speed. Not for navigation. Real passages need weather routing, pilot books, visas and insurance checks.</p>
  </div>`;
  el.scrollTop = y;
  paint();
}

function stopRow(id, i, plus) {
  const p = portById.get(id), n = reach(id).filter(x => wanted(x.p.id)).length;
  const big = plus > 150 && order.length > 3, tip = suggestStay(id), mine = state.sail.stays[id];
  return `<div class="stop"><button class="stopname" data-about="${id}">${esc(p.label)}</button>
    <span class="ops">${state.sail.auto ? '' : `<button data-up="${i}" aria-label="Earlier">↑</button><button data-down="${i}" aria-label="Later">↓</button>`}
      <label class="dayin"><input type="number" min="0" max="730" data-days="${id}" value="${mine ?? tip.days}" aria-label="Days in ${esc(p.label)}"> days</label>
      <button data-must="${id}" class="${isMust(id) ? 'lit' : ''}" aria-pressed="${isMust(id)}" title="A must is never left out">Must</button>
      <button data-rm="${id}" aria-label="Remove ${esc(p.label)}">×</button></span>
    <small class="${big ? 'warn' : ''}">${plus > 1 ? `Adds ${duration(plus)} to the voyage` : 'Almost on the way'}${big && isDetour(id) ? '. Flying here is smarter' : big ? '. A costly stop' : ''}${n ? ` · ${n} of your top places` : ''}</small>
    <small>${mine === undefined ? `Suggested ${tip.days}: ${esc(tip.why)}` : `Your choice. Suggested: ${tip.days} <button class="link" data-tip="${id}">Use it</button>`}</small></div>`;
}

let orderKey = '', orderMemo = [];
// finding the best order takes a moment, so only redo it when something that matters changed
function ordered(s) {
  const f = full(s);
  const key = JSON.stringify([s.start, s.month, s.year, s.knots, [...s.stops].sort().map(id => [id, f.stays[id]]), s.home, s.safeRed]);
  if (key !== orderKey) { orderMemo = bestOrder(f); orderKey = key; }
  return orderMemo;
}

function departure() {
  const s = state.sail, b = bestDeparture(full(s), order), now = result.total + result.risk;
  if (!b || b.month === s.month || now - b.x < 14) return '';
  const gain = result.total - b.total;
  const txt = gain > 13 ? `saves ${duration(gain)}` : `avoids ${duration(result.risk - b.risk)} in storm seasons`;
  return `<p class="sm">Leaving in ${MONTHS[b.month - 1]} ${txt}. <button class="link" data-leave="${b.month}">Use ${MONTHS[b.month - 1]}</button></p>`;
}

function totals() {
  const r = result;
  return `<div class="card stack tight"><div class="totals">
    <div class="big"><b>${duration(r.total)}</b><span class="sm soft">${dateText(r.start)} to ${dateText(r.end)}</span></div>
    <div><b>${n0(r.nm)} nm</b><span class="sm soft">distance</span></div>
    <div><b>${duration(r.sea)}</b><span class="sm soft">at sea</span></div>
    <div><b>${duration(r.ashore)}</b><span class="sm soft">visiting</span></div>
    <div><b>${duration(r.wait)}</b><span class="sm soft">waiting for seasons</span></div>
    ${r.home ? `<div><b>${duration(r.home)}</b><span class="sm soft">at home, ${r.sections} sections</span></div>` : ''}
  </div>${departure()}${r.missing.length ? `<p class="sm warn">No route found to ${esc(r.missing.map(id => portById.get(id).label).join(', '))}.${state.sail.safeRed ? ' It may need the Red Sea.' : ''}</p>` : ''}</div>`;
}

function reached() {
  const inRoute = new Map();
  const calls = result.items.filter(x => x.kind === 'sea').map(x => x.b);       // includes ports the boat only passes through
  for (const id of new Set([...order, state.sail.start, ...calls])) for (const { p, d } of reach(id)) if (!inRoute.has(p.id)) inRoute.set(p.id, { p, d });
  const top = allPlaces().filter(p => wanted(p.id) && !extra(p.id).visited).sort((a, b) => score(b.id) - score(a.id));
  if (!top.length) return '<div class="card"><h3>Worth sailing, or better to fly?</h3><p class="sm soft" style="margin-top:6px">Rate places in Discover and this shows which ones your route reaches and which to fly to.</p></div>';
  const row = p => `<button class="rowitem" data-open="${esc(p.id)}"><div><b>${esc(p.name)}</b><small>${esc(p.country)} · ${days(daysFor(p))}</small></div>${badge(p.id)}</button>`;
  const boat = top.filter(p => inRoute.has(p.id) && verdict(p).v !== 'fly');
  const missed = top.filter(p => !inRoute.has(p.id) && verdict(p).v !== 'fly');
  const fly = top.filter(p => verdict(p).v === 'fly');
  const box = (title, list, cls, note) => (list.length ? `<details ${cls === 'sail' ? 'open' : ''}><summary><span class="tag ${cls}">${title}: ${list.length}</span></summary><p class="sm soft">${note}</p>${list.slice(0, 40).map(row).join('')}</details>` : '');
  return `<div class="card stack tight"><h3>Worth sailing, or better to fly?</h3>
    ${box('Leave for the boat', boat, 'sail', 'This route takes you there.')}
    ${box('Sailing places this route misses', missed, 'inland', 'Add their country, or fly.')}
    ${box('Better to fly', fly, 'fly', 'Use normal holidays for these, before or between sailing sections.')}</div>`;
}

function timeline() {
  let sec = -1;
  const rows = result.items.map((x, i) => {
    let head = '';
    if (x.sec !== sec && result.sections > 1) { sec = x.sec; head = `<div class="sech" style="color:${SECTION[sec % SECTION.length]}">Section ${sec + 1}</div>`; }
    const P = portById.get(x.id || x.b), when = `${dateText(x.t0)}`;
    const len = duration((x.t1 - x.t0) / 86400000);
    const st = x.storm ? `<small class="warn">${x.storm[0].toUpperCase() + x.storm.slice(1)} here during this stay</small>` : '';
    let t, sub;
    if (x.kind === 'sea') { t = `${portById.get(x.a).label} to ${P.label}`; sub = `${when} · ${duration(x.days)} at sea · ${n0(x.nm)} nm${x.hard ? ' · against the wind' : ''}${x.flags.includes('R') ? ' · security risk' : ''}`; }
    if (x.kind === 'stay') { t = P.label; sub = `${when} · stay ${len}${P.note ? ` · ${P.note}` : ''}`; }
    if (x.kind === 'wait') { t = `Wait in ${P.label}`; sub = `${when} · ${len} for the right season${(x.t1 - x.t0) > 60 * 86400000 && P.leave ? '. Good moment to leave the boat and fly home or inland' : ''}`; }
    if (x.kind === 'home') { t = `Fly home from ${P.label}`; sub = `${when} · ${len}. The boat stays in ${P.name}`; }
    return `${head}<button class="${x.kind}" data-item="${i}" style="--c:${SECTION[x.sec % SECTION.length]}"><i></i><span>${esc(t)}<small>${esc(sub)}</small>${st}</span></button>`;
  }).join('');
  return `<div class="stack tight"><h3>Calendar</h3><div class="time">${rows}</div></div>`;
}

function paint() {
  const s = state.sail;
  drawPorts(new Set([s.start, ...s.stops]));
  drawRoute(result ? result.items.filter(x => x.kind === 'sea').map(x => ({ line: x.line, color: SECTION[x.sec % SECTION.length] })) : []);
  setFilter(p => verdict(p).v !== 'fly');
  showStorms(stormMonth);
}

export function initSailing() {
  const el = $('#panel'), here = () => document.body.dataset.view === 'sailing';
  el.addEventListener('change', e => {
    if (!here()) return;
    if (e.target.id === 'portq') {
      const q = norm(e.target.value), p = ports.find(x => norm(x.label) === q) || ports.find(x => norm(`${x.label} ${x.name} ${x.country}`).includes(q));
      if (q && p) { openPort(p.id); flyTo(p, 4); } else if (q) toast(`No port found for ${e.target.value}.`);
      return;
    }
    if (e.target.dataset.days) {
      const v = e.target.value.trim();
      if (v === '') delete state.sail.stays[e.target.dataset.days];
      else state.sail.stays[e.target.dataset.days] = Math.max(0, Math.min(730, Math.round(+v) || 0));
      save('sail');
      drawSailing();
      return;
    }
    const k = e.target.dataset.s;
    if (!k) return;
    const s = state.sail;
    s[k] = e.target.type === 'checkbox' ? e.target.checked : k === 'start' ? e.target.value : +e.target.value;
    if (k === 'knots') s.knots = Math.min(15, Math.max(3, s.knots || 5.5));
    if (k === 'start') s.stops = s.stops.filter(x => x !== s.start);
    save('sail');
    drawSailing();
    if (k === 'start') flyTo(portById.get(s.start), 3);
  });
  el.addEventListener('click', e => {
    if (!here()) return;
    const d = e.target.closest('button')?.dataset;
    if (!d) return;
    const s = state.sail;
    const swap = (i, j) => { if (j < 0 || j >= s.stops.length) return; [s.stops[i], s.stops[j]] = [s.stops[j], s.stops[i]]; save('sail'); drawSailing(); };
    if (d.up) swap(+d.up, +d.up - 1);
    if (d.down) swap(+d.down, +d.down + 1);
    if (d.rm) removeStop(d.rm);
    if (d.about) { openPort(d.about); flyTo(portById.get(d.about), 4); }
    if (d.must) setMust(d.must, !isMust(d.must));
    if (d.tip) { delete s.stays[d.tip]; save('sail'); drawSailing(); }
    if (d.open) openDetail(d.open);
    if (d.leave) { s.month = +d.leave; save('sail'); drawSailing(); }
    if (d.month) { stormMonth = stormMonth === +d.month ? 0 : +d.month; drawSailing(); if (zoomNow() > 3) look({ zoom: 2, duration: 900 }); }
    if (d.do === 'suggest') suggest();
    if (d.do === 'classic') { s.stops = [...s.musts]; CLASSIC.forEach(id => add(id, true)); s.auto = true; save('sail'); drawSailing(); look({ center: [-70, 8], zoom: 1.7, duration: 1400 }); }
    if (d.do === 'clear') { s.stops = []; s.musts = []; save('sail'); drawSailing(); }
    if (d.item) {
      const x = result.items[+d.item];
      if (x.kind === 'sea') fit([portById.get(x.a), portById.get(x.b)]); else flyTo(portById.get(x.id), 5);
    }
  });
}

export function enterSailing() {
  drawBases([]);
  drawSailing();
  if (!seen && look({})) { seen = true; const p = portById.get(state.sail.start); look({ center: [p.lon - 25, 25], zoom: 2, duration: 1400 }); }
}
