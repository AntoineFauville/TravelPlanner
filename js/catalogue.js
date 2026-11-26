// The photo grid, in order of priority. Hover a picture to rate it.
import { allPlaces, verdict, LABEL, daysFor, TYPES } from './data.js';
import { state, rate, ratingOf, extra } from './store.js';
import { $, $$, esc, norm, days, monthRange } from './util.js';
import { byN, isMatch, rateBar } from './scale.js';
import { thumb } from './photos.js';
import { riskOf, interest } from './costs.js';
import { fameShort } from './fame.js';
import { openDetail } from './detail.js';

// Both ratings added up: Must + Must = 10, Must + Not interested = 6, Must alone = 5 (the other has not voted yet).
const total = id => ratingOf(id, 0) + ratingOf(id, 1);
const votes = id => (ratingOf(id, 0) ? 1 : 0) + (ratingOf(id, 1) ? 1 : 0);
const best = id => Math.max(ratingOf(id, 0), ratingOf(id, 1));

// "Antoine: Must" and "Tamari: Cool" on the photo
function both(id) {
  return `<div class="both">${state.people.map((name, i) => {
    const r = ratingOf(id, i), l = r && byN(r);
    return `<span class="lv l${r}" title="${esc(name)}: ${l ? l.text : 'not rated yet'}">${esc(name)}: ${l ? l.short : '?'}</span>`;
  }).join('')}</div>`;
}

const f = { q: '', type: '', region: '', v: '', st: '', sort: 'priority' };
const PAGE = 120;
let limit = PAGE;
let built = false;

function shown() {
  const me = state.who, q = norm(f.q);
  const list = allPlaces().filter(p =>
    (!q || norm(`${p.name} ${p.country} ${p.region || ''} ${p.civ || ''}`).includes(q))
    && (!f.type || (p.type || 'own') === f.type)
    && (!f.region || p.region === f.region)
    && (!f.v || verdict(p).v === f.v)
    && (!f.st || (f.st === 'todo' ? !ratingOf(p.id, me) : f.st === 'done' ? ratingOf(p.id, me)
      : f.st === 'both' ? isMatch(p.id) : extra(p.id).visited)));
  const age = p => p.year ?? 9999;
  const by = {
    // unrated places: the parts of the world you like and safe countries first
    // the sum of both ratings; at the same sum, rated by both first, then the higher single rating
    priority: (a, b) => total(b.id) - total(a.id) || votes(b.id) - votes(a.id) || best(b.id) - best(a.id)
      || (!total(a.id) && (interest(b) - interest(a) || riskOf(a).n - riskOf(b).n)),
    old: (a, b) => age(a) - age(b),
    near: (a, b) => verdict(a).dHome - verdict(b).dHome,
    region: (a, b) => (a.region || '').localeCompare(b.region || ''),
    quick: (a, b) => daysFor(a) - daysFor(b),
    fame: (a, b) => (b.fame || 0) - (a.fame || 0),
  }[f.sort];
  return list.map((p, i) => [p, i]).sort((a, b) => by(a[0], b[0]) || a[1] - b[1]).map(x => x[0]);
}

const card = p => {
  const v = verdict(p), img = thumb(p);
  return `<article class="pc" data-id="${esc(p.id)}">
    <div class="pic">${img ? `<img loading="lazy" src="${esc(img)}" alt="">` : ''}
      ${both(p.id)}${rateBar(p.id)}</div>
    <h3><button data-open="${esc(p.id)}">${esc(p.name)}</button></h3>
    <div class="meta"><span>${esc(p.country)}</span><span>${days(daysFor(p))}</span>${p.months ? `<span>${monthRange(p.months)}</span>` : ''}${fameShort(p) ? `<span class="rk">${esc(fameShort(p))}</span>` : ''}</div>
    ${p.when ? `<p class="sm soft">${esc(p.when[0].toUpperCase() + p.when.slice(1))}, ${esc(p.civ)}</p>` : ''}
    ${p.why ? `<p class="sm">${esc(p.why)}</p>` : ''}
    <span class="tag ${v.v}">${LABEL[v.v]}</span>
  </article>`;
};

function progress() {
  const all = allPlaces();
  return state.people.map((name, i) => `${esc(name)}: ${all.filter(p => ratingOf(p.id, i)).length}`).join(' · ') + ` of ${all.length} rated`;
}

export function drawCatalogue() {
  const el = $('#catalogue');
  if (!built) {
    built = true;
    el.innerHTML = '<div class="bar"></div><div class="cards"></div>';
    el.addEventListener('click', e => {
      const o = e.target.closest('[data-open]');
      if (o) openDetail(o.dataset.open);
      if (e.target.closest('[data-more]')) { limit += PAGE * 2; drawCards(); }
    });
    el.addEventListener('input', e => { const k = e.target.dataset.f; if (k) { f[k] = e.target.value; limit = PAGE; drawCards(); } });
    // hover a photo and press 1 to 5
    addEventListener('keydown', e => {
      if (el.hidden || e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || !/^[1-5]$/.test(e.key)) return;
      const pic = $('.pic:hover', el);
      if (pic) rate(pic.closest('.pc').dataset.id, state.who, +e.key);
    });
  }
  const opt = (v, t, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`;
  const regions = [...new Set(allPlaces().map(p => p.region).filter(Boolean))].sort();
  $('.bar', el).innerHTML = `
    <input type="search" data-f="q" placeholder="Place, country, people" value="${esc(f.q)}" aria-label="Search">
    <select data-f="sort" aria-label="Sort by">${opt('priority', 'Highest priority first', f.sort)}${opt('old', 'Oldest first', f.sort)}${opt('near', 'Nearest to home first', f.sort)}${opt('region', 'By region', f.sort)}${opt('quick', 'Shortest visit first', f.sort)}${opt('fame', 'Best known first', f.sort)}</select>
    <select data-f="st" aria-label="Rating status">${opt('', 'Rated and unrated', f.st)}${opt('todo', 'Not rated by you', f.st)}${opt('done', 'Rated by you', f.st)}${opt('both', 'Your matches', f.st)}${opt('seen', 'Already visited', f.st)}</select>
    <select data-f="type" aria-label="Type">${opt('', 'All types', f.type)}${Object.entries(TYPES).map(([k, t]) => opt(k, t, f.type)).join('')}</select>
    <select data-f="region" aria-label="Region">${opt('', 'All regions', f.region)}${regions.map(r => opt(r, r, f.region)).join('')}</select>
    <select data-f="v" aria-label="Sail or fly">${opt('', 'Sail, drive or fly', f.v)}${Object.entries(LABEL).map(([k, t]) => opt(k, t, f.v)).join('')}</select>
    <span class="prog"></span>`;
  drawCards();
}

// only the first cards are drawn: 2,000 photos at once would be slow and heavy
function drawCards() {
  const el = $('#catalogue'), list = shown();
  let body = list.slice(0, limit).map(card).join('');
  if (f.sort === 'priority' && list.some(p => total(p.id))) {
    // one heading per score, 10 down to 1, then the places nobody rated
    let left = limit;
    body = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(n => {
      const of = list.filter(p => total(p.id) === n), now = of.slice(0, Math.max(0, left));
      left -= now.length;
      const text = n === 10 ? 'Score 10: both Must visit' : n ? `Score ${n}` : 'Not rated yet';
      return now.length ? `<h2 class="group l${Math.ceil(n / 2)}">${text}<span>${of.length}</span></h2>${now.map(card).join('')}` : '';
    }).join('');
  }
  if (list.length > limit) body += `<p class="more"><button class="btn" data-more>Show more (${list.length - limit} left)</button></p>`;
  $('.cards', el).innerHTML = body || '<p class="emptynote">No place matches these filters.</p>';
  $('.prog', el).innerHTML = progress();
}

// After a rating, update the card where it is. Re-sorting under the mouse would be annoying.
export function refreshCard(id) {
  const el = $('#catalogue');
  for (const c of $$('.pc', el)) {
    if (c.dataset.id !== id) continue;
    const pic = $('.pic', c);
    $('.both', pic)?.remove();
    pic.insertAdjacentHTML('beforeend', both(id));
    const r = ratingOf(id, state.who);
    $$('.rate button', pic).forEach(x => { x.classList.toggle('lit', +x.dataset.n === r); x.setAttribute('aria-pressed', +x.dataset.n === r); });
  }
  const p = $('.prog', el);
  if (p) p.innerHTML = progress();
}
