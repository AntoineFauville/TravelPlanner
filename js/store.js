// Everything the two of you enter lives here. Today it is saved in this browser;
// later only load() and save() need to change to use Firebase.
const KEY = 'travelplanner.v1';

const blank = () => ({
  scale: 4,               // ratings go from 1 to 4
  people: ['Me', 'Partner'],
  who: 0,                 // who is rating right now
  ratings: {},            // placeId -> [mine, partner's]
  places: {},             // placeId -> { notes, visited, days, force, cover }
  own: [],                // places you added yourselves
  trips: [],              // saved holidays
  home: 'Bingen am Rhein', // where your road trips start
  homeSet: true,
  range: 1200,            // km your car drives on one tank
  sleep: 'roof',          // roof tent, tent or hotel
  packed: {},             // trip title -> things ticked on its packing list
  sail: {
    start: 'cux', month: 6, year: new Date().getFullYear() + 2, knots: 5.5, stops: [], musts: [], stays: {},
    auto: true, home: true, safeRed: true, sail: 0, rest: 4, freeDays: true,
  },
});

// Ratings from the first version went from 1 to 10.
function toScale4(s) {
  if (s.scale === 4) return s;
  const f = n => (!n ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : 4);
  for (const id of Object.keys(s.ratings || {})) s.ratings[id] = s.ratings[id].map(f);
  s.scale = 4;
  return s;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) { if (!s.homeSet) { s.home = 'Bingen am Rhein'; s.homeSet = true; } toScale4(s); if (s.sail && !s.sail.freeDays) { s.sail.stays = {}; s.sail.freeDays = true; } const b = blank(); return { ...b, ...s, sail: { ...b.sail, ...s.sail } }; }
  } catch { /* first visit, or storage blocked */ }
  return blank();
}

export const state = load();
const listeners = new Set();
export const onChange = fn => listeners.add(fn);

export function save(what = '') {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: works until you close the page */ }
  for (const fn of listeners) fn(what);
}

export const exportText = () => JSON.stringify(state, null, 1);

export function importText(text) {
  const s = JSON.parse(text);
  if (!s || typeof s !== 'object' || !s.ratings || !s.sail) throw new Error('This file is not a TravelPlanner backup.');
  toScale4(s);
  const b = blank();
  Object.assign(state, b, s, { sail: { ...b.sail, ...s.sail } });
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
// How much a place counts when planning. Unrated places count a little, so suggestions work from day one.
export const weight = id => { const s = score(id); return s ? 0.6 * s * s : 1.2; };

export const extra = id => state.places[id] || {};
export function setExtra(id, patch) { state.places[id] = { ...extra(id), ...patch }; save('place'); }
