// Everything the two of you enter lives here. Today it is saved in this browser;
// later only load() and save() need to change to use Firebase.
const KEY = 'travelplanner.v1';

const blank = () => ({
  scale: 5,               // ratings go from 1 (not interested) to 5 (must visit)
  people: ['Antoine', 'Tamari'],
  who: 0,                 // who is rating right now
  ratings: {},            // placeId -> [mine, partner's]
  places: {},             // placeId -> { notes, visited, days, force, cover }
  own: [],                // places you added yourselves
  trips: [],              // saved holidays
  home: 'Bingen am Rhein', // where your road trips start
  homeSet: true,
  range: 1200,            // km your car drives on one tank
  sleep: 'roof',          // roof tent, tent or hotel
  budget: { hotel: 80, food: 30, style: 'mix', litres: 5.5, fuel: 'diesel', skipper: true, max: 0 },   // 0 = no limit
  tour: { boat: 80000, refit: 40, maint: 8, ins: 2, out: 20, marina: 20, personal: 250, resale: 60, total: 200000 },
  tours: [],              // editions of the world tour: { id, name, sail }
  tourId: '',
  packed: {},             // trip title -> things ticked on its packing list
  zones: { SSF: 0.4, SAS: 0.4, LCN: 0.7 },   // how much you want to go to a part of the world (1 = fully, 0 = not at all)
  sail: {
    start: 'cux', month: 6, year: new Date().getFullYear() + 2, knots: 5.5, stops: [], musts: [], stays: {},
    auto: true, home: true, safeRed: true, sail: 0, rest: 4, freeDays: true, easyVisa: true,
  },
});

// Ratings from the first version went from 1 to 10.
function toScale4(s) {
  if (s.scale >= 4) return s;
  const f = n => (!n ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : 4);
  for (const id of Object.keys(s.ratings || {})) s.ratings[id] = s.ratings[id].map(f);
  s.scale = 4;
  return s;
}

// Then came four levels; "Not interested" was added below them.
function toScale5(s) {
  toScale4(s);
  if (s.scale === 4) { for (const id of Object.keys(s.ratings || {})) s.ratings[id] = s.ratings[id].map(n => (n ? n + 1 : 0)); s.scale = 5; }
  return s;
}

// the plan you are working on is one of the editions
function linkTours(s) {
  if (!s.tours.length) { s.tours = [{ id: 'a', name: 'Plan A', sail: s.sail }]; s.tourId = 'a'; }
  let t = s.tours.find(x => x.id === s.tourId);
  if (!t) { t = s.tours[0]; s.tourId = t.id; }
  for (const x of s.tours) x.sail = { ...blank().sail, ...x.sail };
  s.sail = t.sail;
  return s;
}

// bring saved data from any version up to date
function revive(s) {
  if (!s.homeSet) { s.home = 'Bingen am Rhein'; s.homeSet = true; }
  if (s.people) s.people = s.people.map((n, i) => (['Me', 'Partner', `Person ${i + 1}`].includes(n) ? ['Antoine', 'Tamari'][i] : n));
  toScale5(s);
  if (s.sail && !s.sail.freeDays) { s.sail.stays = {}; s.sail.freeDays = true; }
  const b = blank();
  return linkTours({ ...b, ...s, sail: { ...b.sail, ...s.sail }, budget: { ...b.budget, ...s.budget }, tour: { ...b.tour, ...s.tour } });
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) return revive(s);
  } catch { /* first visit, or storage blocked */ }
  return linkTours(blank());
}

export const state = load();
const listeners = new Set();
export const onChange = fn => listeners.add(fn);
let cloud = null;                 // the online copy (js/cloud.js) hears about every change
export const onSave = fn => { cloud = fn; };

const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: works until you close the page */ } };
export function save(what = '') {
  keep();
  for (const fn of listeners) fn(what);
  cloud?.(what);
}

// everything worth keeping online: "who" belongs to this screen only
export function plain() { const { who, ...rest } = state; return JSON.parse(JSON.stringify(rest)); }
// the online copy changed (the other person did something): take it over and redraw
export function replaceState(s) {
  const who = state.who, next = revive(JSON.parse(JSON.stringify(s)));
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next, { who });
  keep();
  for (const fn of listeners) fn('remote');
}
export function forget() { try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } }

export const exportText = () => JSON.stringify(state, null, 1);

export function importText(text) {
  const s = JSON.parse(text);
  if (!s || typeof s !== 'object' || !s.ratings || !s.sail) throw new Error('This file is not a TravelPlanner backup.');
  const next = revive(s);
  for (const k of Object.keys(state)) if (k !== 'who') delete state[k];
  Object.assign(state, next, { who: state.who });
  save('all');
}

// ---- ratings
export const ratingOf = (id, who) => (state.ratings[id] || [])[who] || 0;
export function score(id) {
  const r = (state.ratings[id] || []).filter(Boolean);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
}
export function rate(id, who, n) {
  const r = state.ratings[id] || (state.ratings[id] = [0, 0]);
  r[who] = r[who] === n ? 0 : n;
  if (!r[0] && !r[1]) delete state.ratings[id];
  save('rating');
}
// the same, but choosing the level a place already has keeps it
export function setRating(id, who, n) {
  const r = state.ratings[id] || (state.ratings[id] = [0, 0]);
  r[who] = n;
  if (!r[0] && !r[1]) delete state.ratings[id];
  save('rating');
}
// How much a place counts when planning. Unrated places count a little, so suggestions work from day one.
// "Not interested" counts nothing.
export const weight = id => { const s = score(id); return s ? 0.6 * (s - 1) * (s - 1) : 1.2; };

export const extra = id => state.places[id] || {};
export function setExtra(id, patch) { state.places[id] = { ...extra(id), ...patch }; save('place'); }
