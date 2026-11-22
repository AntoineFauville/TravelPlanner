// One place at a time: look, decide, next.
import { allPlaces, placeById, verdict, LABEL, daysFor } from './data.js';
import { state, rate, ratingOf, extra, setExtra } from './store.js';
import { $, esc, days, monthRange, toast } from './util.js';
import { LEVELS, byN, isMatch } from './scale.js';
import { gallery, photosOf } from './photos.js';
import { drawGlobe } from './globe.js';

const TYPES = { prehistory: 'Prehistory & early humans', temple: 'Temples', ancient: 'Ancient cities', tomb: 'Tombs & pyramids', sacred: 'Sacred places', fort: 'Forts', city: 'Towns', nature: 'Wonders of nature', own: 'Our own places' };
let current = null, pics = null, busy = false, filter = '';
const skipped = new Set(), past = [];          // past: what Undo can bring back
export let active = false;

// A fixed shuffle, so you travel around the world instead of seeing all of Egypt in a row.
function dice(id) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const fits = p => !filter || (filter.startsWith('t:') ? (p.type || 'own') === filter.slice(2) : p.region === filter.slice(2));
const pool = () => allPlaces().filter(fits);
const todo = () => pool().filter(p => !ratingOf(p.id, state.who) && !extra(p.id).visited);

function queue() {
  const other = 1 - state.who, me = state.who;
  // learn what you like: types you rate high come up earlier, types you rate low later
  const sum = {};
  for (const p of allPlaces()) { const r = ratingOf(p.id, me); if (r) { const k = sum[p.type || 'own'] || (sum[p.type || 'own'] = [0, 0]); k[0] += r; k[1]++; } }
  const taste = p => { const k = sum[p.type || 'own']; return k && k[1] >= 4 ? (k[0] / k[1] - 2.4) * 0.22 : 0; };
  // places the other person loves come up a bit earlier, so matches happen sooner
  return todo().map(p => [p, dice(p.id) - taste(p) - (ratingOf(p.id, other) >= 3 ? 0.4 : 0) + (skipped.has(p.id) ? 10 : 0)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
}

// ---- timeline, log scale: recent centuries get as much room as early millennia
const MARKS = [[-9500, 'Göbekli Tepe'], [-2560, 'Pyramids'], [-27, 'Rome'], [1492, 'Columbus']];
const NOW = new Date().getFullYear();
const at = y => 100 * (1 - Math.log(1 + Math.max(0, NOW - y) / 100) / Math.log(1 + 18000 / 100));
const line = y => `<div class="tl" aria-hidden="true"><i style="left:${at(y)}%"></i>${MARKS.map(([m, t]) => `<span style="left:${at(m)}%">${t}</span>`).join('')}<span class="now">Today</span></div>`;

export function facts(p) {
  if (!p.fact) return '';
  return `<dl class="facts"><div><dt>When</dt><dd>${esc(p.when)}</dd></div><div><dt>Who</dt><dd>${esc(p.civ)}</dd></div></dl>
    ${p.year !== null && p.year !== undefined ? line(p.year) : ''}<p>${esc(p.fact)}</p>`;
}

const q = encodeURIComponent;
function cardHtml(p) {
  const v = verdict(p);
  return `<div class="dpics"></div>
    <div class="dinfo">
      <div class="dhead"><div><h2>${esc(p.name)}</h2><p class="soft">${esc([...new Set([p.country, p.region])].filter(Boolean).join(' · '))}</p>
        ${p.why ? `<p class="dwhy">${esc(p.why)}</p>` : ''}</div>
        <button class="dglobe" data-do="where" title="Show on the globe"><canvas aria-label="Where it is on the globe"></canvas></button></div>
      ${facts(p)}
      <div class="dmeta"><span>${days(daysFor(p))} to visit</span>${p.months ? `<span>Best ${monthRange(p.months)}</span>` : ''}<span class="tag ${v.v}">${LABEL[v.v]}</span></div>
      ${p.advice ? '<p class="sm warn">Check the official travel advice before planning this one.</p>' : ''}
      <div class="row"><a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q(`${p.name} ${p.country || ''}`)}">Google Search</a>
        <a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/search?udm=2&amp;q=${q(`${p.name} ${p.country || ''}`)}">More photos</a>
        ${p.wiki ? `<a class="btn small" target="_blank" rel="noopener" href="${esc(p.wiki)}">Wikipedia</a>` : ''}</div>
    </div>`;
}

export function drawDiscover() {
  const el = $('#discover'), all = pool(), left = queue();
  if (!left.length) return done(el, all);
  // keep the same card when something else changed (name of a person, a new photo...)
  if (!current || !left.some(p => p.id === current)) current = left[0].id;
  const p = placeById(current), rated = all.filter(x => ratingOf(x.id, state.who)).length;
  const opt = (v, t) => `<option value="${esc(v)}" ${v === filter ? 'selected' : ''}>${esc(t)}</option>`;
  const regions = [...new Set(allPlaces().map(x => x.region).filter(Boolean))].sort();
  el.innerHTML = `<div class="dtop">
      <select id="dfilter" aria-label="What to show">${opt('', 'Everywhere')}<optgroup label="Type">${Object.entries(TYPES).map(([k, t]) => opt(`t:${k}`, t)).join('')}</optgroup><optgroup label="Region">${regions.map(r => opt(`r:${r}`, r)).join('')}</optgroup></select>
      <div class="dbar"><i style="width:${100 * rated / Math.max(1, all.length)}%"></i></div>
      <span class="soft">${esc(state.people[state.who])}: ${rated} of ${all.length}</span>
    </div>
    <article class="dcard">${cardHtml(p)}</article>
    <div class="dact">
      <div class="dlevels">${[...LEVELS].reverse().map(l => `<button class="l${l.n}" data-rate="${l.n}"><kbd>${l.n}</kbd>${l.text}</button>`).join('')}</div>
      <div class="dmore"><button class="link quiet" data-do="undo" ${past.length ? '' : 'disabled'}>Undo</button><button class="link quiet" data-do="skip">Skip for now</button><button class="link quiet" data-do="seen">We have been there</button></div>
    </div>`;
  pics = gallery($('.dpics', el), p);
  drawGlobe($('.dglobe canvas', el), p.lat, p.lon).catch(() => $('.dglobe', el)?.remove());
  if (left[1]) { const n = photosOf(left[1])[0]; if (n) new Image().src = n.u.replace('/500px-', '/960px-'); }
}

function done(el, all) {
  current = null; pics = null;
  const rated = all.filter(p => ratingOf(p.id, state.who));
  const other = 1 - state.who, waiting = all.filter(p => !ratingOf(p.id, other) && !extra(p.id).visited).length;
  const both = allPlaces().filter(p => isMatch(p.id)).length;
  el.innerHTML = `<div class="ddone"><h2>${all.length ? 'You have seen them all' : 'Nothing here yet'}</h2>
    <div class="dsum">${LEVELS.map(l => `<div class="l${l.n}"><b>${rated.filter(p => ratingOf(p.id, state.who) === l.n).length}</b>${l.text}</div>`).join('')}</div>
    <p>${both ? `${both} match${both > 1 ? 'es' : ''}: places you both find super interesting or a must.` : 'No matches yet. They appear once you have both rated.'}</p>
    <div class="row" style="justify-content:center">
      ${filter ? '<button class="btn main" data-do="all">Show places from everywhere</button>' : ''}
      ${waiting ? `<button class="btn" data-do="other">${esc(state.people[other])} has ${waiting} to go</button>` : ''}
      <button class="btn" data-do="catalogue">See the ranking</button>${past.length ? '<button class="btn" data-do="undo">Undo</button>' : ''}</div></div>`;
}

function leave(dir, then) {
  const c = $('#discover .dcard');
  if (!c || matchMedia('(prefers-reduced-motion: reduce)').matches) return then();
  busy = true;
  c.style.setProperty('--dir', dir);
  c.classList.add('out');
  setTimeout(() => { busy = false; then(); }, 190);
}

function choose(n) {
  if (busy || !current) return;
  const id = current, name = placeById(id).name;
  past.push({ kind: 'rate', id, who: state.who });
  leave(n >= 3 ? 1 : -1, () => {
    current = null;
    rate(id, state.who, n);
    if (n >= 3 && isMatch(id)) toast(`Match! You both want to see ${name}.`);
    else toast(`${name}: ${byN(n).text}`);
  });
}
function skip() {
  if (busy || !current) return;
  const id = current;
  past.push({ kind: 'skip', id, again: skipped.has(id) });
  // a second skip sends it behind the others that were skipped
  leave(-1, () => { current = null; skipped.delete(id); skipped.add(id); const rest = queue().filter(p => p.id !== id); if (rest[0]) current = rest[0].id; drawDiscover(); });
}
function seen() {
  if (busy || !current) return;
  const id = current;
  past.push({ kind: 'seen', id });
  leave(1, () => { current = null; setExtra(id, { visited: true }); });
}
function undo() {
  const x = past.pop();
  if (!x || busy) return;
  if (x.kind === 'rate') { state.who = x.who; const r = ratingOf(x.id, x.who); current = x.id; if (r) rate(x.id, x.who, r); else drawDiscover(); }
  if (x.kind === 'skip') { if (!x.again) skipped.delete(x.id); current = x.id; drawDiscover(); }
  if (x.kind === 'seen') { current = x.id; setExtra(x.id, { visited: false }); }
}

export function initDiscover(go) {
  const el = $('#discover');
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rate) choose(+b.dataset.rate);
    const d = b.dataset.do;
    if (d === 'skip') skip();
    if (d === 'seen') seen();
    if (d === 'undo') undo();
    if (d === 'all') { filter = ''; drawDiscover(); }
    if (d === 'other') { state.who = 1 - state.who; current = null; setWho(); }
    if (d === 'catalogue') go('catalogue');
    if (d === 'where' && current) { const id = current; go('travel'); showPlace(id); }
  });
  el.addEventListener('change', e => { if (e.target.id === 'dfilter') { filter = e.target.value; current = null; drawDiscover(); } });
  addEventListener('keydown', e => {
    if (el.hidden || e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
    if (/^[1-4]$/.test(e.key)) choose(+e.key);
    else if (e.key === 'ArrowRight') pics?.next();
    else if (e.key === 'ArrowLeft') pics?.prev();
    else if (e.key === 'Backspace') { e.preventDefault(); undo(); } else if (e.key.toLowerCase() === 's') skip();
  });
}
let showPlace = () => {};
export const onWhere = fn => { showPlace = fn; };
let setWho = () => drawDiscover();
export const onWho = fn => { setWho = fn; };
export const resetCard = () => { current = null; };
