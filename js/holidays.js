// "Next year we have two weeks: what is our priority?"
import { allPlaces, placeById, verdict, daysFor, HOME } from './data.js';
import { state, score, weight, extra, save } from './store.js';
import { $, esc, km, arc, days, MONTHS, monthRange, toast } from './util.js';
import { badge, wanted } from './scale.js';
import { openDetail } from './detail.js';
import { drawRoute, fit, setFilter, COLORS } from './map.js';

const ui = { days: 14, month: 0, year: new Date().getFullYear() + 1, sail: false, advice: false, shown: null };
let trips = [];

const flightDays = d => (d < 1800 ? 1 : d < 4500 ? 1.5 : d < 8500 ? 2.5 : 3);   // both ways, door to door
const hopDays = d => (d < 60 ? 0.1 : d < 200 ? 0.3 : 0.4 + d / 1200);
const mid = l => ({ lat: l.reduce((a, p) => a + p.lat, 0) / l.length, lon: l.reduce((a, p) => a + p.lon, 0) / l.length });

// shortest visiting order, starting from the place nearest home
function route(list) {
  if (list.length < 2) return list;
  const left = [...list], out = [];
  left.sort((a, b) => km(a, HOME) - km(b, HOME));
  out.push(left.shift());
  while (left.length) {
    const last = out[out.length - 1];
    left.sort((a, b) => km(a, last) - km(b, last));
    out.push(left.shift());
  }
  const len = l => l.slice(1).reduce((s, p, i) => s + km(l[i], p), 0);
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < out.length - 1; i++) for (let j = i + 1; j < out.length; j++) {
      const t = [...out.slice(0, i), ...out.slice(i, j + 1).reverse(), ...out.slice(j + 1)];
      if (len(t) < len(out) - 1) { out.splice(0, out.length, ...t); again = true; }
    }
  }
  return out;
}
const moving = l => l.slice(1).reduce((s, p, i) => s + hopDays(km(l[i], p)), 0);
const onSite = l => l.reduce((s, p) => s + daysFor(p), 0);

function value(p) {
  let w = weight(p.id);
  if (ui.month && p.months && !p.months.includes(ui.month)) w *= 0.3;
  if (verdict(p).v !== 'fly') w *= ui.sail ? 1 : 0.15;
  return w;
}

function plan() {
  const taken = new Set(state.trips.flatMap(t => t.stops));
  const ok = allPlaces().filter(p => !taken.has(p.id) && !extra(p.id).visited && (ui.advice || !p.advice) && (ui.sail || verdict(p).v === 'fly') && value(p) > 0.2);
  const regions = new Map();
  for (const p of ok) { const r = p.region || p.country || 'Elsewhere'; if (!regions.has(r)) regions.set(r, []); regions.get(r).push(p); }
  const out = [];
  for (const [name, members] of regions) {
    const c = mid(members), budget = ui.days - flightDays(km(c, HOME));
    const pool = ok.filter(p => members.includes(p) || km(p, c) < 650);
    let sel = [];
    for (;;) {
      let best = null;
      for (const p of pool) {
        if (sel.includes(p)) continue;
        if (!sel.length && !members.includes(p)) continue;
        const l = route([...sel, p]), used = onSite(l) + moving(l);
        if (used > budget + 0.25) continue;
        const add = used - (sel.length ? onSite(sel) + moving(sel) : 0);
        const gain = value(p) * (members.includes(p) ? 1 : 0.8) / (add + 0.4);
        if (!best || gain > best.gain) best = { gain, l };
      }
      if (!best) break;
      sel = best.l;
    }
    if (!sel.length) continue;
    const v = sel.reduce((s, p) => s + value(p), 0);
    const used = onSite(sel) + moving(sel), flight = flightDays(km(mid(sel), HOME));
    out.push({ name, sel, v, used, flight, move: moving(sel), spare: Math.max(0, ui.days - used - flight) });
  }
  out.sort((a, b) => b.v - a.v);
  const kept = [];
  for (const t of out) {
    const dup = kept.some(k => t.sel.filter(p => k.sel.includes(p)).length > t.sel.length * 0.4);
    if (!dup) kept.push(t);
    if (kept.length === 8) break;
  }
  return kept;
}

function bestMonths(sel) {
  const withM = sel.filter(p => p.months);
  if (!withM.length) return [];
  const n = MONTHS.map((_, i) => withM.reduce((s, p) => s + (p.months.includes(i + 1) ? weight(p.id) : 0), 0)), max = Math.max(...n);
  return n.map((x, i) => [x, i + 1]).filter(([x]) => x >= max * 0.9).map(([, m]) => m);
}

export function drawHolidays() {
  trips = plan();
  const fresh = ui.shown === null && trips.length > 0;
  if (fresh) ui.shown = 0;
  const el = $('#panel'), anyRated = allPlaces().some(p => score(p.id));
  el.innerHTML = `<div class="stack">
    <h2>Your next holiday</h2>
    <div class="grid2">
      <label class="f">Days off, weekends included<input type="number" min="3" max="120" data-u="days" value="${ui.days}"></label>
      <label class="f">Month<select data-u="month"><option value="0">Any month</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${ui.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    </div>
    <div class="stack tight">
      <label class="check"><input type="checkbox" data-u="sail" ${ui.sail ? 'checked' : ''}>Include places we could save for sailing</label>
      <label class="check"><input type="checkbox" data-u="advice" ${ui.advice ? 'checked' : ''}>Include places with travel warnings</label>
    </div>
    ${anyRated ? '' : '<p class="sm warn">You have not rated anything yet, so every place counts the same. Rate some in Discover first.</p>'}
    <div class="stack">${trips.map((t, i) => tripCard(t, i)).join('') || '<p class="soft">Nothing fits in that time. Try more days.</p>'}</div>
    ${state.trips.length ? `<div class="hr"></div><h2>Planned trips</h2><div class="stack">${[...state.trips].sort((a, b) => a.year - b.year || a.month - b.month).map(saved).join('')}</div>` : ''}
  </div>`;
  paint();
  if (fresh) fit(trips[0].sel);
}

const stopList = (sel) => sel.map(p => `<button class="rowitem" data-open="${esc(p.id)}"><div><b>${esc(p.name)}</b><small>${days(daysFor(p))}${ui.month && p.months && !p.months.includes(ui.month) ? ' · not the best month' : ''}</small></div>${badge(p.id, '<span class="lv">–</span>')}</button>`).join('');

function tripCard(t, i) {
  const on = ui.shown === i;
  return `<div class="card stack tight ${on ? 'on' : ''}">
    <div class="row" style="justify-content:space-between"><h3>${esc(t.name)}</h3><button class="link" data-show="${i}">${on ? 'On the globe' : 'Show'}</button></div>
    <p class="sm soft">${t.sel.length} place${t.sel.length > 1 ? 's' : ''}: ${days(t.used - t.move)} visiting, ${days(Math.max(0.5, t.move + t.flight))} travelling${t.spare >= 1 ? `, ${days(t.spare)} spare` : ''}. Best in ${monthRange(bestMonths(t.sel)) || 'any month'}.</p>
    ${on ? `<div>${stopList(t.sel)}</div><div class="row"><label class="sm soft">Year <input type="number" id="tripYear" style="width:90px" value="${ui.year}" min="2020" max="2100"></label><button class="btn" data-save="${i}">Plan this trip</button></div>`
    : `<p class="sm">${esc(t.sel.map(p => p.name).join(', '))}</p>`}
  </div>`;
}

const saved = t => `<div class="card stack tight"><div class="row" style="justify-content:space-between"><h3>${esc(t.name)}</h3><span class="soft">${t.month ? `${MONTHS[t.month - 1]} ` : ''}${t.year}</span></div>
  <p class="sm soft">${t.days} days: ${esc(t.stops.map(id => placeById(id)?.name).filter(Boolean).join(', '))}</p>
  <div class="row"><button class="link" data-view-trip="${esc(t.id)}">Show</button><button class="link quiet" data-done="${esc(t.id)}">We did it</button><button class="link quiet" data-del="${esc(t.id)}">Remove</button></div></div>`;

function line(sel) {
  const r = [];
  if (!sel.length) return r;
  r.push({ line: arc(HOME, sel[0]), color: '#ffffff', dash: true });
  for (let i = 1; i < sel.length; i++) r.push({ line: arc(sel[i - 1], sel[i]), color: COLORS.fly });
  r.push({ line: arc(sel[sel.length - 1], HOME), color: '#ffffff', dash: true });
  return r;
}
function paint(sel) {
  const s = sel || trips[ui.shown]?.sel || [];
  drawRoute(line(s));
  const ids = new Set(s.map(p => p.id));
  setFilter(p => ids.has(p.id) || wanted(p.id));
}
function show(i) {
  ui.shown = i;
  const y = $('#panel').scrollTop;
  drawHolidays();
  $('#panel').scrollTop = y;
  if (trips[i]) fit(trips[i].sel);
}

export function initHolidays() {
  const el = $('#panel');
  const here = () => document.body.dataset.view === 'holidays';
  el.addEventListener('change', e => {
    if (!here()) return;
    if (e.target.id === 'tripYear') { ui.year = +e.target.value || ui.year; return; }
    const k = e.target.dataset.u;
    if (!k) return;
    ui[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
    if (k === 'days') ui.days = Math.min(120, Math.max(3, ui.days || 14));
    ui.shown = null;
    drawHolidays();
  });
  el.addEventListener('click', e => {
    if (!here()) return;
    const d = e.target.closest('button')?.dataset;
    if (!d) return;
    if (d.open) openDetail(d.open);
    if (d.show) show(+d.show);
    if (d.save) {
      const t = trips[+d.save];
      state.trips.push({ id: Date.now().toString(36), name: t.name, year: ui.year, month: ui.month || bestMonths(t.sel)[0] || 0, days: ui.days, stops: t.sel.map(p => p.id) });
      ui.shown = null;
      toast(`${t.name} is planned. Its places will not be suggested again.`);
      save('trips');
      drawHolidays();
    }
    const trip = id => state.trips.find(t => t.id === id);
    if (d.viewTrip) { const s = trip(d.viewTrip).stops.map(placeById).filter(Boolean); paint(s); fit(s); }
    if (d.del) { state.trips = state.trips.filter(t => t.id !== d.del); ui.shown = null; save('trips'); drawHolidays(); }
    if (d.done) {
      for (const id of trip(d.done).stops) state.places[id] = { ...extra(id), visited: true };
      state.trips = state.trips.filter(t => t.id !== d.done);
      ui.shown = null;
      save('trips');
      drawHolidays();
    }
  });
}

export function enterHolidays() { ui.shown = null; drawHolidays(); }
