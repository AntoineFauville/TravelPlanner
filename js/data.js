import { state, extra, save } from './store.js';
import { km, n0 } from './util.js';
import { setPhotos } from './photos.js';

// Cities you can start from. Driving times to every road trip are ready for each of them.
export const HOMES = { 'Bingen am Rhein': [49.967, 7.895], Aachen: [50.776, 6.084], Berlin: [52.52, 13.405], Bremen: [53.079, 8.802], Cologne: [50.938, 6.96], Dortmund: [51.514, 7.465], Dresden: [51.05, 13.738], 'Düsseldorf': [51.228, 6.774], Frankfurt: [50.11, 8.682], Freiburg: [47.999, 7.842], Hamburg: [53.551, 9.994], Hanover: [52.376, 9.732], Karlsruhe: [49.007, 8.404], Kassel: [51.313, 9.498], Leipzig: [51.34, 12.373], Mannheim: [49.487, 8.466], Munich: [48.137, 11.575], 'Münster': [51.961, 7.626], Nuremberg: [49.452, 11.077], 'Saarbrücken': [49.24, 6.997], Stuttgart: [48.776, 9.183], Ulm: [48.401, 9.988] };
export const HOME = { name: 'Bingen am Rhein', lat: 49.967, lon: 7.895 };
// driving times from the chosen home only: one small file per home city
const slugOf = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const loadDrive = n => fetch(`data/drive/${slugOf(n)}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
export function setHome(name) {
  const n = HOMES[name] ? name : 'Bingen am Rhein', c = HOMES[n];
  Object.assign(HOME, { name: n, lat: c[0], lon: c[1] });
  cache.clear();
  if (drive._home && drive._home !== n) loadDrive(n).then(d => { drive = { ...d, _home: n }; cache.clear(); save('drive'); });
}
export const TYPES = { prehistory: 'Prehistory & early humans', temple: 'Temples', ancient: 'Ancient cities', tomb: 'Tombs & pyramids', sacred: 'Churches & sacred places',
  fort: 'Forts', castle: 'Castles & palaces', city: 'Cities & towns', museum: 'Museums', landmark: 'Landmarks', nature: 'Wonders of nature', park: 'National parks',
  region: 'Regions to roam', themepark: 'Theme parks', zoo: 'Zoos & safari parks', event: 'Festivals & events', train: 'Train journeys', surf: 'Surfing', dive: 'Diving & snorkelling',
  wind: 'Windsurf & kite', kayak: 'Kayak & canoe', ski: 'Ski resorts', trek: 'Treks', own: 'Our own places' };
// the long list from Wikidata is stored short: rebuild the links here
const FILE = 'https://commons.wikimedia.org/wiki/';
function grow(p) {
  if (p.f) { p.img = `${FILE}Special:FilePath/${encodeURIComponent(p.f)}?width=500`; p.credit = { by: 'see the photo page', src: `${FILE}File:${encodeURIComponent(p.f.replace(/ /g, '_'))}` }; delete p.f; }
  if (p.w) { p.wiki = `https://en.wikipedia.org/wiki/${encodeURIComponent(p.w.replace(/ /g, '_'))}`; delete p.w; }
  return p;
}
export let catalog = [], ports = [], legs = [], trips = [];
export let countries = { names: {}, list: {} }, drive = {};
export const portById = new Map();
const cache = new Map();

// Ports away from the usual round-the-world track. A place near one of these is normally better flown to.
const DETOUR = new Set(['jap', 'oki', 'vic', 'sdg', 'ush', 'bue', 'poh', 'plw', 'hob', 'mia', 'hon', 'cam', 'rio', 'pva', 'ist',
  'dji', 'sal', 'ptg', 'aqa', 'sue', 'rec', 'dak', 'kie', 'bgo']);
export const isDetour = id => DETOUR.has(id);

export async function loadData() {
  const get = async u => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`${u}: ${r.status}`);
    return r.json();
  };
  // extra photos are nice to have: never wait more than a moment for them
  const photos = get('data/photos.json').then(setPhotos).catch(() => {});
  const home = HOMES[state.home] ? state.home : 'Bingen am Rhein';
  const [c, more, fame, s, f, tr, co, dr] = await Promise.all([get('data/catalog.json'), get('data/catalog_more.json').catch(() => []), get('data/fame.json').catch(() => ({})), get('data/sailing.json'), get('data/facts.json').catch(() => ({})), get('data/trips.json').catch(() => []), get('data/countries.json'), loadDrive(home)]);
  for (const p of c) Object.assign(p, f[p.id]);
  c.push(...more.map(grow));
  for (const p of c) if (fame[p.id]) p.fame = fame[p.id];
  await Promise.race([photos, new Promise(r => setTimeout(r, 2500))]);
  setHome(state.home);
  trips = tr; countries = co; drive = { ...dr, _home: home };
  catalog = c; ports = s.ports; legs = s.legs;
  for (const p of c) byId.set(p.id, p);
  for (const p of ports) portById.set(p.id, p);
}

export const allPlaces = () => [...catalog, ...state.own];
const byId = new Map();
export const placeById = id => byId.get(id) || state.own.find(p => p.id === id);
export const daysFor = p => extra(p.id).days || p.days;

function geo(p) {
  const key = `${p.id}|${p.lat}|${p.lon}`;
  if (!cache.has(key)) {
    let port = null, d = Infinity;
    for (const q of ports) { const k = km(p, q); if (k < d) { d = k; port = q; } }
    cache.set(key, { port, dPort: d, dHome: km(p, HOME) });
  }
  return cache.get(key);
}

export const LABEL = { sail: 'Save for sailing', inland: 'Inland trip from the boat', drive: 'Drive there', fly: 'Fly there' };
export const atSea = v => v === 'sail' || v === 'inland';        // belongs to the world tour
const hm = h => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.floor(h)} h${Math.round((h % 1) * 6) ? ` ${Math.min(50, Math.round((h % 1) * 6) * 10)}` : ''}`);
// hours and km by car from home, if it can be driven in a day
export function driveTo(p) {
  const d = drive[p.id];
  if (d) return d;
  if (!p.own) return null;
  const k = km(p, HOME);                                         // places you added yourselves: a guess
  return k < 800 && p.lat > 36 && p.lon > -10 && p.lon < 25 ? [k * 1.3 / 88, Math.round(k * 1.3)] : null;
}

// Should this place wait for the boat, or is it smarter to fly? Simple rules, always explained.
export function verdict(p) {
  const g = geo(p), flight = Math.max(1, Math.round(g.dHome / 800 + 0.7));
  const mine = extra(p.id).force, forced = mine || p.force;
  const near = `${g.port.name} is ${n0(g.dPort)} km away`;
  if (forced === 'sail') return { v: 'sail', why: mine ? `Your choice. ${near}.` : `At its best by boat, and awkward by plane. ${near}.`, ...g };
  if (forced === 'drive') { const d = driveTo(p); return { v: 'drive', why: `Your choice.${d ? ` About ${hm(d[0])} by car from ${HOME.name}.` : ''}`, ...g }; }
  if (forced === 'fly') return { v: 'fly', why: mine ? 'Your choice.' : `Far inland. About ${flight} h in the air from Germany.`, ...g };
  if (forced === 'inland') return { v: 'inland', why: `Your choice. ${near}.`, ...g };
  const car = driveTo(p);
  if (car && car[0] <= 11) return { v: 'drive', why: `About ${hm(car[0])} by car from ${HOME.name}, ${n0(car[1])} km: good for a road trip.`, ...g };
  if (g.dHome < 3300) return { v: 'fly', why: `Only about ${flight} h in the air from Germany, so it fits a normal holiday.`, ...g };
  const off = isDetour(g.port.id);
  if (g.dPort <= 120 && !off) return { v: 'sail', why: `The boat can stop practically next to it. ${near}.`, ...g };
  if (g.dPort <= 400 && g.dHome > 5000 && !off) return { v: 'inland', why: `Leave the boat for a few days. ${near}.`, ...g };
  if (g.dPort <= 400 && off) return { v: 'fly', why: `${near}, but that port is a big detour from the usual sailing route.`, ...g };
  return { v: 'fly', why: `${n0(g.dPort)} km from the nearest port. About ${flight} h in the air from Germany.`, ...g };
}
