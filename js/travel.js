// Regular travel: type or paste places, get pins, see them in order of priority.
import { allPlaces, catalog, verdict, daysFor, LABEL } from './data.js';
import { state, score, extra, save } from './store.js';
import { $, esc, norm, days, toast, km } from './util.js';
import { badge, wanted } from './scale.js';
import { thumb } from './photos.js';
import { openDetail, openId } from './detail.js';
import { setFilter, fit, drawRoute, drawBases } from './map.js';

const ui = { show: 'all', v: '', limit: 60 };
let busy = '';

const list = () => allPlaces().filter(p =>
  (!ui.v || verdict(p).v === ui.v)
  && (ui.show === 'all' || (ui.show === 'rated' ? score(p.id) > 0 : ui.show === 'own' ? !!p.own : extra(p.id).visited))
);

export function drawTravel() {
  const draft = $('#add textarea')?.value || '';
  const el = $('#panel'), all = list().sort((a, b) => score(b.id) - score(a.id)), rated = all.filter(p => score(p.id));
  const sum = rated.filter(p => wanted(p.id) && !extra(p.id).visited).reduce((a, p) => a + daysFor(p), 0);
  const opt = (v, t, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`;
  el.innerHTML = `<div class="stack">
    <h2>Where do you want to go?</h2>
    <form id="add" class="stack tight">
      <textarea name="t" rows="2" placeholder="Type a place, or paste a list with one place per line" aria-label="Places to add"></textarea>
      <div class="row"><button class="btn main">Find and pin</button><span class="sm soft" id="busy">${esc(busy)}</span></div>
      <div id="choices" class="stack tight"></div>
    </form>
    <div class="row">
      <select data-u="show" aria-label="Which places" style="flex:1">${opt('all', 'All places', ui.show)}${opt('rated', 'Places we rated', ui.show)}${opt('own', 'Places we added', ui.show)}${opt('seen', 'Visited', ui.show)}</select>
      <select data-u="v" aria-label="Sail or fly" style="flex:1">${opt('', 'Sail, drive or fly', ui.v)}${Object.entries(LABEL).map(([k, t]) => opt(k, t, ui.v)).join('')}</select>
    </div>
    ${sum ? `<p class="sm soft">Everything you find interesting or a must needs about <b style="color:var(--text)">${days(sum)}</b> on site, without travel.</p>`
    : '<p class="sm soft">Rate a few places in Discover. The list and the pins follow your priorities.</p>'}
    <div>${all.slice(0, ui.limit).map(item).join('') || '<p class="soft">Nothing here yet.</p>'}
      ${all.length > ui.limit ? `<button class="btn" data-more style="margin-top:10px">Show ${all.length - ui.limit} more</button>` : ''}</div>
  </div>`;
  if (draft && busy === '') $('#add textarea').value = draft;
  const ids = new Set(all.map(p => p.id));
  setFilter(p => ids.has(p.id));
}

const item = p => `<button class="rowitem ${p.id === openId() ? 'on' : ''}" data-open="${esc(p.id)}">
  ${thumb(p) ? `<img loading="lazy" alt="" src="${esc(thumb(p))}">` : '<span class="ph"></span>'}
  <div><b>${esc(p.name)}</b><small>${esc(p.country || '')} · ${days(daysFor(p))}</small></div>
  <span class="tag ${verdict(p).v}" title="${LABEL[verdict(p).v]}"></span>
  ${badge(p.id, '<span class="lv">–</span>')}</button>`;

// ---- finding places (OpenStreetMap search, at most one request per second)
async function search(text) {
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=en&limit=4&q=${encodeURIComponent(text)}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error('search');
  return r.json();
}

const WIKI = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&prop=coordinates|pageimages|info|pageprops&inprop=url&ppprop=disambiguation&piprop=thumbnail|name&pithumbsize=500&colimit=10';
const media = p => ({ ...(p.thumbnail ? { img: p.thumbnail.source.split('?')[0], credit: { by: 'See file page', lic: '', src: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.pageimage)}` } } : {}), wiki: p.fullurl });

// Famous places: the Wikipedia article with exactly this name knows where it is.
async function article(name) {
  try {
    const t = name[0].toUpperCase() + name.slice(1);
    const p = (await (await fetch(`${WIKI}&redirects=1&titles=${encodeURIComponent(t)}`)).json()).query?.pages?.[0];
    if (!p || p.missing || p.pageprops || !p.coordinates) return null;
    const { lat, lon } = p.coordinates[0];
    let country = '';
    try { country = (await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&accept-language=en&lat=${lat}&lon=${lon}`)).json()).address?.country || ''; } catch { /* country is optional */ }
    return { name: p.title, lat, lon, country, ...media(p) };
  } catch { return null; }
}

async function photo(name, lat, lon) {
  try {
    const pages = (await (await fetch(`${WIKI}&generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(name)}`)).json()).query?.pages || [];
    const hit = pages.sort((a, b) => a.index - b.index).find(p => p.thumbnail && p.coordinates && km({ lat, lon }, p.coordinates[0]) < 25);
    return hit ? media(hit) : {};
  } catch { return {}; }
}

async function addOwn(found) {
  const same = allPlaces().find(p => km(p, found) < 1 && norm(p.name) === norm(found.name));
  if (same) return same;
  const p = { id: `own-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, own: true, days: 2, ...found };
  state.own.push(p);
  save('place');
  return p;
}
async function fromSearch(r, typed) {
  const lat = +r.lat, lon = +r.lon, name = r.name || typed;
  return addOwn({ name, lat, lon, country: r.address?.country || '', ...(await photo(name, lat, lon)) });
}

// "Great Blue Hole" finds the catalogue entry "Great Blue Hole & reef"
const known = t => {
  const q = norm(t);
  return catalog.find(p => norm(p.name) === q) || catalog.find(p => norm(p.name).split(/ & |, | \(|\)/).some(x => x.trim() === q));
};

async function addText(text) {
  const names = [...new Set(text.split(/\n|;/).map(s => s.trim().replace(/^[-*•\d.)\s]+/, '')).filter(Boolean))].slice(0, 60);
  if (!names.length) return;
  const done = [], missed = [];
  for (const [i, n] of names.entries()) {
    say(`Looking for ${n}${names.length > 1 ? ` (${i + 1} of ${names.length})` : ''}`);
    const k = known(n);
    if (k) { done.push(k); continue; }
    try {
      const w = await article(n);
      if (w) done.push(await addOwn(w));
      else {
        const res = await search(n);
        if (!res.length) missed.push(n);
        else if (names.length === 1 && res.length > 1) { say(''); return choices(res, n); }
        else done.push(await fromSearch(res[0], n));
      }
    } catch { missed.push(n); }
    if (i < names.length - 1) await new Promise(r => setTimeout(r, 1100));
  }
  say('');
  if ($('#add textarea')) $('#add textarea').value = missed.join('\n');
  drawTravel();
  if (done.length) { fit(done); if (done.length === 1) openDetail(done[0].id, false); }
  const parts = [];
  if (done.length) parts.push(`${done.length} place${done.length > 1 ? 's' : ''} pinned.`);
  if (missed.length) parts.push(`Not found: ${missed.join(', ')}. Try adding the country.`);
  toast(parts.join(' '));
}
function say(t) { busy = t; const b = $('#busy'); if (b) b.textContent = t; }

function choices(res, typed) {
  const box = $('#choices');
  if (!box) return;
  box.innerHTML = `<p class="sm soft">Which one?</p>${res.map((r, i) => `<button type="button" class="btn small" style="text-align:left" data-pick="${i}">${esc(r.display_name)}</button>`).join('')}`;
  box.onclick = async e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    box.innerHTML = '';
    const p = await fromSearch(res[+b.dataset.pick], typed);
    $('#add textarea').value = '';
    drawTravel();
    openDetail(p.id);
    toast(`${p.name} is pinned.`);
  };
}

export function initTravel() {
  const el = $('#panel');
  const here = () => document.body.dataset.view === 'travel';
  el.addEventListener('submit', e => {
    if (!here() || e.target.id !== 'add') return;
    e.preventDefault();
    addText(e.target.t.value);
  });
  el.addEventListener('keydown', e => {
    if (here() && e.target.name === 't' && e.key === 'Enter' && !e.shiftKey && !e.target.value.includes('\n')) { e.preventDefault(); addText(e.target.value); }
  });
  el.addEventListener('change', e => { if (here() && e.target.dataset.u) { ui[e.target.dataset.u] = e.target.value; ui.limit = 60; drawTravel(); } });
  el.addEventListener('click', e => {
    if (!here()) return;
    if (e.target.closest('[data-more]')) { ui.limit += 100; drawTravel(); }
    const o = e.target.closest('[data-open]');
    if (o) openDetail(o.dataset.open);
  });
}

export function enterTravel() { drawRoute([]); drawBases([]); drawTravel(); }
