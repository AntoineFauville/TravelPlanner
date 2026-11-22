// How long to stay in a port. A suggestion you can change to any number of days.
import { allPlaces, portById, verdict, daysFor } from './data.js';
import { weight, extra } from './store.js';
import { levelOf } from './scale.js';
import { km } from './util.js';

// places you can visit from a port: next to it, or a few days inland
export function reach(id) {
  const P = portById.get(id);
  return allPlaces().map(p => ({ p, d: km(p, P) })).filter(x => x.d <= 400 && (x.d <= 120 || verdict(x.p).v !== 'fly')).sort((a, b) => weight(b.p.id) - weight(a.p.id));
}

const REST = 3;
export function suggestStay(id) {
  // the place you would mainly stop for, plus others nearby that you rated well
  const list = reach(id).filter(x => !extra(x.p.id).visited && x.d <= 250 && (levelOf(x.p.id) >= 2 || (levelOf(x.p.id) === 0 && verdict(x.p).v === 'sail'))).slice(0, 4);
  let d = 0;
  const parts = [];
  for (const x of list) {
    const need = Math.ceil(daysFor(x.p) + (x.d > 120 ? 2 : 0));       // two more days to travel inland and back
    if (d + need > 35) continue;
    d += need;
    parts.push(`${x.p.name} ${need}`);
  }
  const days = Math.max(4, d + REST);
  return { days, why: parts.length ? `${parts.join(', ')}, plus ${REST} for rest, shopping and paperwork` : 'rest, shopping and paperwork' };
}
