import { state, extra } from './store.js';
import { km, n0 } from './util.js';
import { setPhotos } from './photos.js';

export const HOME = { name: 'Frankfurt', lat: 50.04, lon: 8.56 };
export let catalog = [], ports = [], legs = [];
export const portById = new Map();

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
  const [c, s, f, ph] = await Promise.all([get('data/catalog.json'), get('data/sailing.json'), get('data/facts.json').catch(() => ({})), get('data/photos.json').catch(() => ({}))]);
  for (const p of c) Object.assign(p, f[p.id]);
  setPhotos(ph);
  catalog = c; ports = s.ports; legs = s.legs;
  for (const p of ports) portById.set(p.id, p);
}

export const allPlaces = () => [...catalog, ...state.own];
export const placeById = id => catalog.find(p => p.id === id) || state.own.find(p => p.id === id);
export const daysFor = p => extra(p.id).days || p.days;

const cache = new Map();
function geo(p) {
  const key = `${p.id}|${p.lat}|${p.lon}`;
  if (!cache.has(key)) {
    let port = null, d = Infinity;
    for (const q of ports) { const k = km(p, q); if (k < d) { d = k; port = q; } }
    cache.set(key, { port, dPort: d, dHome: km(p, HOME) });
  }
  return cache.get(key);
}

export const LABEL = { sail: 'Save for sailing', inland: 'Inland trip from the boat', fly: 'Fly there' };

// Should this place wait for the boat, or is it smarter to fly? Simple rules, always explained.
export function verdict(p) {
  const g = geo(p), flight = Math.max(1, Math.round(g.dHome / 800 + 0.7));
  const mine = extra(p.id).force, forced = mine || p.force;
  const near = `${g.port.name} is ${n0(g.dPort)} km away`;
  if (forced === 'sail') return { v: 'sail', why: mine ? `Your choice. ${near}.` : `At its best by boat, and awkward by plane. ${near}.`, ...g };
  if (forced === 'fly') return { v: 'fly', why: mine ? 'Your choice.' : `Far inland. About ${flight} h in the air from Germany.`, ...g };
  if (forced === 'inland') return { v: 'inland', why: `Your choice. ${near}.`, ...g };
  if (g.dHome < 3300) return { v: 'fly', why: `Only about ${flight} h in the air from Germany, so it fits a normal holiday.`, ...g };
  const off = isDetour(g.port.id);
  if (g.dPort <= 120 && !off) return { v: 'sail', why: `The boat can stop practically next to it. ${near}.`, ...g };
  if (g.dPort <= 400 && g.dHome > 5000 && !off) return { v: 'inland', why: `Leave the boat for a few days. ${near}.`, ...g };
  if (g.dPort <= 400 && off) return { v: 'fly', why: `${near}, but that port is a big detour from the usual sailing route.`, ...g };
  return { v: 'fly', why: `${n0(g.dPort)} km from the nearest port. About ${flight} h in the air from Germany.`, ...g };
}
