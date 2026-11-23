// The panel on the right in the world tour: what is this port, when to come, what is around it.
import { portById, legs, daysFor } from './data.js';
import { state } from './store.js';
import { $, esc, MONTHS, monthRange, n0 } from './util.js';
import { badge } from './scale.js';
import { gallery, photosOf, tiny } from './photos.js';
import { drawGlobe } from './globe.js';
import { ZONES, pad } from './map.js';
import { reach, suggestStay } from './stays.js';
import { closeDetail, openDetail, takeOver } from './detail.js';
import { C, landOf, euro, visaLine, visaHard } from './costs.js';
import { addMust, removeStop, setMust, isStop, isMust } from './sailing.js';

let id = null;
export const portOpen = () => id;
const q = encodeURIComponent;
// the map's country names are shortened
const LONG = { 'Fr. Polynesia': 'French Polynesia', 'Cook Is.': 'Cook Islands', 'Solomon Is.': 'Solomon Islands', 'Pitcairn Is.': 'Pitcairn', 'British Virgin Is.': 'British Virgin Islands', 'Antigua and Barb.': 'Antigua and Barbuda', 'Dominican Rep.': 'Dominican Republic', 'Cabo Verde': 'Cape Verde', 'Indian Ocean Ter.': 'Australia' };
const land = p => LONG[p.country] || p.country;

// Wikipedia article about the area, where the label alone would not find it
const WIKI = { kie: 'Kiel', bre: 'Camaret-sur-Mer', cux: 'Cuxhaven', lar: 'La Rochelle', cor: 'A Coruña', gib: 'Gibraltar', pal: 'Balearic Islands', cfu: 'Ionian Islands', ist: 'Istanbul', psd: 'Port Said', aga: 'Agadir',
  rdu: 'Río Dulce (Guatemala)', isl: 'Isla Mujeres', sbl: 'San Blas Islands', col: 'Colón, Panama', bal: 'Panama City', pva: 'Puerto Vallarta', sdg: 'San Diego', vic: 'Victoria, British Columbia',
  mqs: 'Marquesas Islands', tua: 'Tuamotus', bor: 'Leeward Islands (Society Islands)', vav: 'Vavaʻu', fij: 'Fiji', opu: 'Bay of Islands', bri: 'Brisbane', cns: 'Cairns', thu: 'Torres Strait Islands', dar: 'Darwin, Northern Territory',
  raj: 'Raja Ampat Islands', kup: 'Timor', kom: 'Komodo National Park', sem: 'Semarang', kkb: 'Borneo', pue: 'Palawan', oki: 'Okinawa Island', jap: 'Seto Inland Sea', cam: 'Sihanoukville', lan: 'Langkawi', phu: 'Phuket Province',
  coc: 'Kochi', cck: 'Cocos (Keeling) Islands', ric: 'Richards Bay', cap: 'Cape Town', ush: 'Ushuaia', bue: 'Buenos Aires', rio: 'Rio de Janeiro', rec: 'Recife', sal: 'Salalah', ptg: 'Marsa Alam', aqa: 'Aqaba', sue: 'Suez',
  asc: 'Ascension Island', lou: 'Louisiade Archipelago', poh: 'Pohnpei', plw: 'Palau', gre: 'Grenada', slu: 'Saint Lucia', ant: 'Antigua', bda: 'Bermuda', nas: 'The Bahamas', mia: 'Miami', gol: 'Golfito', ctg: 'Cartagena, Colombia',
  nos: 'Nosy Be', zan: 'Zanzibar', kil: 'Kilifi', wal: 'Walvis Bay', hob: 'Hobart', hir: 'Solomon Islands', api: 'Samoa', rar: 'Rarotonga', gam: 'Gambier Islands', pit: 'Pitcairn Islands', eas: 'Easter Island', hon: 'Hawaii (island)', lim: 'Cyprus', spl: 'Split, Croatia' };
const texts = new Map();
async function about(p) {
  if (!texts.has(p.id)) {
    const t = WIKI[p.id] || p.label.replace(/ \(.*/, '');
    texts.set(p.id, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${q(t.replace(/ /g, '_'))}`).then(r => (r.ok ? r.json() : null))
      .then(j => (j && j.type === 'standard' ? { text: j.extract.split(/(?<=\.) /).slice(0, 3).join(' '), url: j.content_urls?.desktop?.page } : null)).catch(() => null));
  }
  return texts.get(p.id);
}

export function mustButton(pid) {
  const p = portById.get(pid);
  if (pid === state.sail.start) return `<p class="sm soft">${esc(p.label)} is your starting port.</p>`;
  if (!isStop(pid)) return `<button class="btn main" data-mustadd="${pid}">Add ${esc(p.label)} as a must on the itinerary</button>`;
  return `<div class="row"><span class="onroute">${esc(p.label)} is on your itinerary${isMust(pid) ? ' as a must' : ''}</span>
    ${isMust(pid) ? '' : `<button class="btn small" data-mustadd="${pid}">Make it a must</button>`}<button class="btn small" data-stopoff="${pid}">Remove</button></div>`;
}

function papers(p) {
  const iso = landOf(p.id);
  if (!iso) return '';
  const c = C(iso), v = visaLine(iso);
  return `<div class="card stack tight sm"><p><span class="soft">Costs here:</span> groceries ${euro(c.food)}, eating out ${euro(c.out)} per person and day. Marina about ${euro(c.marina)} a night.${c.clear ? ` Clearing in with the boat about ${euro(c.clear)}.` : ''}</p>
    ${v ? `<p class="${visaHard(iso) ? 'warn' : ''}"><span class="soft">Visa.</span> ${v}</p>` : ''}</div>`;
}

export function openPort(pid) {
  takeOver(() => { id = null; });
  id = pid;
  document.body.classList.add('has-detail');
  const el = $('#detail');
  el.hidden = false;
  el.scrollTop = 0;
  el.style.zIndex = '';
  pad();
  drawPort();
}

export function drawPort() {
  const p = portById.get(id);
  if (!p) return closeDetail();
  const z = ZONES[p.zone], tip = suggestStay(id), mine = state.sail.stays[id];
  const near = reach(id).slice(0, 14);
  const from = legs.filter(l => l.b === id || (l.both && l.a === id)), to = legs.filter(l => l.a === id || (l.both && l.b === id));
  const good = new Set([...from, ...to].flatMap(l => l.months)), other = l => portById.get(l.a === id ? l.b : l.a);
  const hop = l => `${esc(other(l).label)} (${n0(l.nm)} nm)`;
  const nearest = [...to].sort((a, b) => a.nm - b.nm).slice(0, 4), before = [...from].sort((a, b) => a.nm - b.nm).slice(0, 4);
  $('#detail').innerHTML = `
    <div class="hero"><div class="gal"></div><button class="close" data-port-close>Close</button></div>
    <div class="in stack">
      <div class="dhead"><div><h2>${esc(p.label)}</h2><p class="soft">${esc(p.name)}${p.name.includes(land(p)) || p.label.includes(land(p)) ? '' : `, ${esc(land(p))}`}</p></div><canvas class="pglobe" aria-label="Where it is on the globe"></canvas></div>
      ${mustButton(id)}
      <p class="ptext soft sm">Loading description</p>
      ${p.note ? `<p>${esc(p.note)}</p>` : ''}
      <div class="stack tight"><div class="sm soft">Months boats usually come and go: ${monthRange([...good].sort((a, b) => a - b)) || 'any'}</div>
        <div class="months">${MONTHS.map((m, i) => `<span class="${z?.months.includes(i + 1) ? 'st' : good.has(i + 1) ? 'y' : ''}">${m[0]}</span>`).join('')}</div>
        <p class="sm ${z ? 'warn' : 'soft'}">${z ? `${z.name[0].toUpperCase() + z.name.slice(1)}: ${monthRange([...z.months].sort((a, b) => a - b))}` : 'No tropical storm season here.'}${p.leave ? ' Good place to leave the boat and fly home.' : ''}</p></div>
      <p class="sm"><b>Suggested stay: ${tip.days} days.</b> ${esc(tip.why[0].toUpperCase() + tip.why.slice(1))}.${mine !== undefined ? ` You chose ${mine}.` : ''}</p>
      ${papers(p)}
      ${near.length ? `<div><h3>What you can reach from here</h3>${near.map(x => `<button class="rowitem" data-port-place="${esc(x.p.id)}">${thumbOf(x.p)}<div><b>${esc(x.p.name)}</b><small>${n0(x.d)} km away, ${daysFor(x.p)} day${daysFor(x.p) === 1 ? '' : 's'}</small></div>${badge(x.p.id, '<span class="lv">–</span>')}</button>`).join('')}</div>` : '<p class="sm soft">Nothing from the catalogue is close to this port.</p>'}
      ${before.length ? `<p class="sm"><span class="soft">Boats come from</span> ${before.map(hop).join(', ')}</p>` : ''}
      ${nearest.length ? `<p class="sm"><span class="soft">and sail on to</span> ${nearest.map(hop).join(', ')}</p>` : ''}
      <div class="row"><a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q(`${p.name} ${land(p)} noonsite sailing cruising guide`)}">Sailing guide</a>
        <a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/search?udm=2&amp;q=${q(`${p.label} ${land(p)}`)}">Photos</a>
        <a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=${p.lat},${p.lon}">Maps</a></div>
    </div>`;
  const photos = near.map(x => photosOf(x.p)[0]).filter(Boolean).slice(0, 8);
  const gal = $('#detail .gal');
  if (photos.length) gallery(gal, { id: `port-${id}`, photos }, { cover: false });
  else gal.innerHTML = '';
  if (!photos.length) $('#detail .hero').classList.add('bare');
  drawGlobe($('#detail .pglobe'), p.lat, p.lon).catch(() => {});
  const now = id;
  about(p).then(a => {
    const t = $('#detail .ptext');
    if (!t || id !== now) return;
    if (!a) { t.remove(); return; }
    t.className = 'ptext';
    t.innerHTML = `${esc(a.text)} <a class="sm" target="_blank" rel="noopener" href="${esc(a.url)}">Wikipedia</a>`;
  });
}
const thumbOf = p => { const f = photosOf(p)[0]; return f ? `<img loading="lazy" alt="" src="${esc(tiny(f.u))}">` : '<span class="ph"></span>'; };

export function initPort() {
  $('#detail').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.mustadd) { if (isStop(d.mustadd)) setMust(d.mustadd, true); else addMust(d.mustadd); }
    if (d.stopoff) removeStop(d.stopoff);
    if (d.portClose !== undefined) closeDetail();
    if (d.portPlace) openDetail(d.portPlace);
  });
}
