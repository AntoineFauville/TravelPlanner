// How well known a place is next to places of the same kind, e.g. "No. 9 of 230 castles and palaces in Europe".
// The measure: readers of its English Wikipedia article per month (data/fame.json, made by tools/build_fame.py).
import { allPlaces } from './data.js';
import { zoneOf, isoOf } from './costs.js';
import { esc, n0 } from './util.js';

// festivals, regions and activity spots point at broad articles (a whole island, a country): no fair ranking there
const NOUN = { castle: 'castles and palaces', city: 'cities and towns', park: 'national parks', themepark: 'theme parks', zoo: 'zoos and safari parks',
  museum: 'museums', temple: 'temples', ancient: 'ancient sites', prehistory: 'prehistoric sites', tomb: 'tombs and pyramids', sacred: 'churches and sacred places',
  fort: 'forts', nature: 'wonders of nature', landmark: 'landmarks', ski: 'ski resorts', trek: 'treks', train: 'train journeys' };
const AREA = { ECS: 'Europe', TCA: 'Turkey, the Caucasus and Central Asia', MEA: 'the Middle East and North Africa', SSF: 'Africa', SAS: 'South Asia', EAS: 'East Asia and the Pacific', LCN: 'Latin America', NAC: 'North America' };

// the World Bank puts these with Europe; for travelling they are their own world
const EAST = new Set(['TUR', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK']);
const areaOf = p => (EAST.has(isoOf(p.country)) ? 'TCA' : zoneOf(p));

let ranks = null;
function build() {
  ranks = new Map();
  const groups = new Map(), add = (k, p) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); };
  for (const p of allPlaces()) {
    if (!p.fame || !NOUN[p.type]) continue;
    add(`${p.type}|${areaOf(p)}`, p);
    add(`${p.type}|`, p);
  }
  for (const [k, list] of groups) {
    list.sort((a, b) => b.fame - a.fame);
    list.forEach((p, i) => { const r = ranks.get(p.id) || {}; r[k.endsWith('|') ? 'world' : 'area'] = [i + 1, list.length]; ranks.set(p.id, r); });
  }
}

export function rankOf(p) {
  if (!ranks) build();
  const r = ranks.get(p.id);
  if (!r) return null;
  const z = areaOf(p), area = r.area && r.area[1] >= 8 && AREA[z] ? { n: r.area[0], of: r.area[1], where: AREA[z] } : null;
  return { area, world: { n: r.world[0], of: r.world[1] }, noun: NOUN[p.type], top: (area || r.world).n <= Math.max(3, (area || r.world).of * 0.05) };
}

// one line for Discover and the place panel
export function fameHtml(p) {
  const r = rankOf(p);
  if (!r) return '';
  const main = r.area ? `No. ${r.area.n} of ${r.area.of} ${r.noun} in ${r.area.where}` : `No. ${r.world.n} of ${r.world.of} ${r.noun} worldwide`;
  const also = r.area ? ` · No. ${r.world.n} worldwide` : '';
  return `<p class="fame${r.top ? ' top' : ''}"><b>${esc(main)}</b>${also}<span title="How many people read its English Wikipedia article each month">${n0(p.fame)} readers a month</span></p>`;
}

// short, for the catalogue cards
export function fameShort(p) {
  const r = rankOf(p);
  return r ? (r.area ? `No. ${r.area.n} in ${r.area.where}` : `No. ${r.world.n} worldwide`) : '';
}
