// One place at a time: look, decide, next.
import { allPlaces, placeById, verdict, LABEL, daysFor, TYPES } from './data.js';
import { state, setRating, ratingOf, extra, setExtra } from './store.js';
import { $, esc, days, monthRange, toast } from './util.js';
import { LEVELS, byN, isMatch } from './scale.js';
import { riskOf, riskHtml, interest } from './costs.js';
import { fillSummary, summary } from './summary.js';
import { gallery, photosOf } from './photos.js';
import { drawGlobe } from './globe.js';

let current = null, pics = null, busy = false, filter = '';
// second round: look again at everything you gave one level, e.g. all your "Must visit"
let round = null;                              // { n, ids, done: Set, moved }
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
// a part of the world you set to "not at all" only shows up when you pick that region yourself
const todo = () => pool().filter(p => !ratingOf(p.id, state.who) && !extra(p.id).visited && (filter.startsWith('r:') || interest(p) > 0));
const mine = n => pool().filter(p => ratingOf(p.id, state.who) === n && !extra(p.id).visited);

function queue() {
  if (round) return round.ids.filter(id => !round.done.has(id)).map(placeById).filter(Boolean).sort((a, b) => skipped.has(a.id) - skipped.has(b.id));
  const other = 1 - state.who, me = state.who;
  // learn what you like: types you rate high come up earlier, types you rate low later
  const sum = {};
  for (const p of allPlaces()) { const r = ratingOf(p.id, me); if (r) { const k = sum[p.type || 'own'] || (sum[p.type || 'own'] = [0, 0]); k[0] += r; k[1]++; } }
  const taste = p => { const k = sum[p.type || 'own']; return k && k[1] >= 4 ? (k[0] / k[1] - 3) * 0.2 : 0; };
  // parts of the world you care less about and risky countries come later
  const later = p => (1 - interest(p)) * 0.9 + [0, 0.1, 0.35, 0.7][riskOf(p).n];
  // places the other person loves come up a bit earlier, so matches happen sooner
  return todo().map(p => [p, dice(p.id) - taste(p) + later(p) - (ratingOf(p.id, other) >= 4 ? 0.4 : 0) + (skipped.has(p.id) ? 10 : 0)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
}

// ---- timeline, log scale: recent centuries get as much room as early millennia
const MARKS = [[-9500, 'Göbekli Tepe'], [-2560, 'Pyramids'], [-27, 'Rome'], [1492, 'Columbus']];
const NOW = new Date().getFullYear();
const at = y => 100 * (1 - Math.log(1 + Math.max(0, NOW - y) / 100) / Math.log(1 + 18000 / 100));
const line = y => `<div class="tl" aria-hidden="true"><i style="left:${at(y)}%"></i>${MARKS.map(([m, t]) => `<span style="left:${at(m)}%">${t}</span>`).join('')}<span class="now">Today</span></div>`;

const yearText = y => (y < 0 ? `${-y} BC` : y < 1000 ? `${y} AD` : `${y}`);
export function facts(p) {
  if (!p.fact) return p.year !== undefined && p.year !== null && p.year < NOW ? `<dl class="facts"><div><dt>Since</dt><dd>${yearText(p.year)}</dd></div></dl>${line(p.year)}` : '';
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
      <p class="dabout" hidden></p>
      <div class="dmeta"><span>${days(daysFor(p))} to visit</span>${p.months ? `<span>Best ${monthRange(p.months)}</span>` : ''}<span class="tag ${v.v}">${LABEL[v.v]}</span></div>
      ${riskHtml(p)}
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
  const seenNow = round ? round.done.size : rated, of = round ? round.ids.length : all.length;
  el.innerHTML = `<div class="dtop">
      ${choices()}
      <div class="dbar"><i style="width:${100 * seenNow / Math.max(1, of)}%"></i></div>
      <span class="soft">${esc(state.people[state.who])}: ${seenNow} of ${of}</span>
    </div>
    ${round ? `<p class="dround"><span class="lv l${round.n}">${esc(byN(round.n).text)}</span> Second look: keep it, or move it.${round.n === 5 ? ` Musts work best when there are few of them: ${mine(5).length} now.` : ''}</p>` : ''}
    <article class="dcard">${cardHtml(p)}</article>
    <div class="dact">
      <div class="dlevels">${[...LEVELS].reverse().map(l => `<button class="l${l.n}" data-rate="${l.n}"><kbd>${l.n}</kbd>${l.text}</button>`).join('')}</div>
      <div class="dmore"><button class="link quiet" data-do="undo" ${past.length ? '' : 'disabled'}>Undo</button><button class="link quiet" data-do="skip">Skip for now</button><button class="link quiet" data-do="seen">We have been there</button></div>
    </div>`;
  pics = gallery($('.dpics', el), p);
  fillSummary($('.dabout', el), p);
  if (left[1]) summary(left[1]);
  drawGlobe($('.dglobe canvas', el), p.lat, p.lon).catch(() => $('.dglobe', el)?.remove());
  if (left[1]) { const n = photosOf(left[1])[0]; if (n) new Image().src = n.u.replace('/500px-', '/960px-'); }
}

// what to look at: new places of a type or region, or a second look at one of your levels
function choices() {
  const regions = [...new Set(allPlaces().map(x => x.region).filter(Boolean))].sort();
  const opt = (v, t, on) => `<option value="${esc(v)}" ${on ? 'selected' : ''}>${esc(t)}</option>`;
  return `<select id="dfilter" aria-label="What to show">${opt('', 'New places from everywhere', !round && !filter)}
    <optgroup label="Second round">${LEVELS.map(l => { const n = mine(l.n).length; return n ? opt(`n:${l.n}`, `Look again at my ${l.text} (${n})`, round?.n === l.n) : ''; }).join('')}</optgroup>
    <optgroup label="New places of one type">${Object.entries(TYPES).map(([k, t]) => opt(`t:${k}`, t, !round && filter === `t:${k}`)).join('')}</optgroup>
    <optgroup label="New places in one region">${regions.map(r => opt(`r:${r}`, r, !round && filter === `r:${r}`)).join('')}</optgroup></select>`;
}
function startRound(n) {
  const ids = mine(n).sort((a, b) => dice(`${a.id}~`) - dice(`${b.id}~`)).map(p => p.id);
  round = ids.length ? { n, ids, done: new Set(), moved: 0 } : null;
  current = null; skipped.clear();
  drawDiscover();
}

function done(el, all) {
  current = null; pics = null;
  const rated = all.filter(p => ratingOf(p.id, state.who));
  const other = 1 - state.who, waiting = all.filter(p => !ratingOf(p.id, other) && !extra(p.id).visited).length;
  const both = allPlaces().filter(p => isMatch(p.id)).length, musts = mine(5).length;
  const head = round ? `Second look at ${byN(round.n).text} done` : all.length ? 'You have seen them all' : 'Nothing here yet';
  const roundBtn = n => { const k = mine(n).length; return k && round?.n !== n ? `<button class="btn ${n === 5 ? 'main' : ''}" data-round="${n}">${n === 5 ? 'Second round: my' : 'Look again at my'} ${byN(n).text} (${k})</button>` : ''; };
  el.innerHTML = `<div class="ddone"><div class="row" style="justify-content:center">${choices()}</div><h2>${head}</h2>
    ${round ? `<p>${round.moved ? `You moved ${round.moved} of ${round.ids.length}.` : `You kept all ${round.ids.length}.`}</p>` : ''}
    <div class="dsum">${LEVELS.map(l => `<div class="l${l.n}"><b>${rated.filter(p => ratingOf(p.id, state.who) === l.n).length}</b>${l.text}</div>`).join('')}</div>
    <p>${both ? `${both} match${both > 1 ? 'es' : ''}: places you both find interesting or a must.` : 'No matches yet. They appear once you have both rated.'}</p>
    ${musts > 25 && round?.n !== 5 ? `<p class="soft">${musts} places are a Must visit. A second round helps to find the real ones.</p>` : ''}
    <div class="row" style="justify-content:center">
      ${roundBtn(5)}${roundBtn(4)}
      ${round ? '<button class="btn" data-do="all">Back to new places</button>' : filter ? '<button class="btn" data-do="all">Show places from everywhere</button>' : ''}
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
  const id = current, name = placeById(id).name, prev = ratingOf(id, state.who), r = round;
  past.push({ kind: 'rate', id, who: state.who, prev, round: r });
  leave(n >= 4 ? 1 : -1, () => {
    current = null;
    if (r) { r.done.add(id); if (n !== prev) r.moved++; }
    setRating(id, state.who, n);
    if (n >= 4 && isMatch(id) && !r) toast(`Match! You both want to see ${name}.`);
    else toast(r && n === prev ? `${name}: still ${byN(n).text}` : `${name}: ${byN(n).text}`);
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
  if (x.kind === 'rate') {
    state.who = x.who; current = x.id;
    if (x.round) { round = x.round; if (ratingOf(x.id, x.who) !== x.prev) round.moved--; round.done.delete(x.id); }
    setRating(x.id, x.who, x.prev);
  }
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
    if (d === 'all') { filter = ''; round = null; current = null; drawDiscover(); }
    if (b.dataset.round) startRound(+b.dataset.round);
    if (d === 'other') { state.who = 1 - state.who; current = null; setWho(); }
    if (d === 'catalogue') go('catalogue');
    if (d === 'where' && current) { const id = current; go('travel'); showPlace(id); }
  });
  el.addEventListener('change', e => {
    if (e.target.id !== 'dfilter') return;
    const v = e.target.value;
    if (v.startsWith('n:')) return startRound(+v.slice(2));
    filter = v; round = null; current = null; drawDiscover();
  });
  addEventListener('keydown', e => {
    if (el.hidden || e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
    if (/^[1-5]$/.test(e.key)) choose(+e.key);
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
