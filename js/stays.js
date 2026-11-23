// How long to stay in a port. A suggestion you can change to any number of days.
import { allPlaces, portById, verdict, atSea, daysFor } from './data.js';
import { weight, extra } from './store.js';
import { levelOf } from './scale.js';
import { km } from './util.js';

// places you can visit from a port: next to it, or a few days inland
export function reach(id) {
  const P = portById.get(id);
  return allPlaces().map(p => ({ p, d: km(p, P) })).filter(x => x.d <= 400 && (x.d <= 120 || atSea(verdict(x.p).v))).sort((a, b) => weight(b.p.id) - weight(a.p.id));
}

const REST = 3;
// the places you would stop for, in order, as far as they fit
export function stayPlaces(id) {
  let d = 0;
  return reach(id).filter(x => !extra(x.p.id).visited && x.d <= 250 && (levelOf(x.p.id) >= 3 || (levelOf(x.p.id) === 0 && verdict(x.p).v === 'sail'))).slice(0, 4)
    .filter(x => { const need = Math.ceil(daysFor(x.p) + (x.d > 120 ? 2 : 0)); if (d + need > 35) return false; d += need; return true; });
}
export function suggestStay(id) {
  // the place you would mainly stop for, plus others nearby that you rated well
  const list = stayPlaces(id);
  let d = 0;
  const parts = [];
  for (const x of list) {
    const need = Math.ceil(daysFor(x.p) + (x.d > 120 ? 2 : 0));       // two more days to travel inland and back
    d += need;
    parts.push(`${x.p.name} ${need}`);
  }
  const days = Math.max(4, d + REST);
  return { days, why: parts.length ? `${parts.join(', ')}, plus ${REST} for rest, shopping and paperwork` : 'rest, shopping and paperwork' };
}
