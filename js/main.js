import { loadData, LABEL, HOMES, setHome } from './data.js';
import { state, save, onChange, exportText, importText } from './store.js';
import { $, $$, esc, toast } from './util.js';
import { initMap, setView, events, map, pad } from './map.js';
import { drawCatalogue, refreshCard } from './catalogue.js';
import { initDiscover, drawDiscover, resetCard, onWho, onWhere } from './discover.js';
import { initDetail, openDetail, closeDetail, openId, draw as drawDetail } from './detail.js';
import { initPort, portOpen, drawPort } from './port.js';
import { initTravel, enterTravel, drawTravel } from './travel.js';
import { initHolidays, enterHolidays, drawHolidays } from './holidays.js';
import { initSailing, enterSailing, drawSailing, onPort, onCountry } from './sailing.js';
import { rate } from './store.js';

const VIEWS = ['discover', 'catalogue', 'travel', 'holidays', 'sailing'];
const ENTER = { travel: enterTravel, holidays: enterHolidays, sailing: enterSailing };
let view = 'travel';

function go(v) {
  view = v;
  document.body.dataset.view = v;
  for (const b of $$('#nav button')) v === b.dataset.view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  if (location.hash.slice(1) !== v) history.replaceState(null, '', `#${v}`);
  closeDetail();
  $('#catalogue').hidden = v !== 'catalogue';
  $('#discover').hidden = v !== 'discover';
  $('#panel').scrollTop = 0;
  if (v === 'catalogue') return drawCatalogue();
  if (v === 'discover') return drawDiscover();
  $('#panel').innerHTML = '';
  setView(v);
  ENTER[v]();
}

function drawWho() {
  $('#who').innerHTML = `<div class="seg"><span>Rating as</span>${state.people.map((n, i) => `<button data-who="${i}" aria-pressed="${state.who === i}">${esc(n)}</button>`).join('')}</div>`;
}

function redraw(what) {
  const panel = $('#panel'), y = panel.scrollTop;
  if (view === 'travel') drawTravel();
  if (view === 'holidays' && what !== 'trips') drawHolidays();
  if (view === 'sailing' && what !== 'sail') drawSailing();
  panel.scrollTop = y;
}

// ---- settings
function settings() {
  const d = $('#settings');
  d.innerHTML = `<form method="dialog" class="stack">
    <h2>Settings</h2>
    <div class="grid2">${[0, 1].map(i => `<label class="f">Person ${i + 1}<input data-person="${i}" value="${esc(state.people[i])}" maxlength="20"></label>`).join('')}</div>
    <div class="grid2"><label class="f">Your trips start in<select data-set="home">${Object.keys(HOMES).map(h => `<option ${h === state.home ? 'selected' : ''}>${h}</option>`).join('')}</select></label><label class="f">Car range, km per tank<input type="number" min="200" max="2000" step="50" data-set="range" value="${state.range}"></label></div>
    <div class="stack tight"><h3>Backup</h3>
      <p class="sm soft">Your ratings and plans are saved in this browser on this computer. Save a backup file now and then, or to move to another computer.</p>
      <div class="row"><button type="button" class="btn" data-do="export">Save backup</button><button type="button" class="btn" data-do="import">Load backup</button><input type="file" accept=".json,application/json" hidden></div></div>
    <button class="btn main" style="align-self:flex-start">Done</button></form>`;
  d.showModal();
}
function initSettings() {
  const d = $('#settings');
  $('#menuBtn').onclick = settings;
  d.addEventListener('change', async e => {
    if (e.target.dataset.person) {
      state.people[+e.target.dataset.person] = e.target.value.trim() || `Person ${+e.target.dataset.person + 1}`;
      save('people');
    }
    if (e.target.dataset.set === 'home') { state.home = e.target.value; setHome(state.home); save('all'); }
    if (e.target.dataset.set === 'range') { state.range = Math.min(2000, Math.max(200, +e.target.value || 1200)); save('all'); }
    if (e.target.type === 'file' && e.target.files[0]) {
      try { importText(await e.target.files[0].text()); toast('Backup loaded.'); d.close(); go(view); } catch (err) { toast(err instanceof SyntaxError ? 'This file is not a TravelPlanner backup.' : err.message); }
    }
  });
  d.addEventListener('click', e => {
    const a = e.target.dataset.do;
    if (a === 'import') $('input[type=file]', d).click();
    if (a === 'export') {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([exportText()], { type: 'application/json' }));
      link.download = `travelplanner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    }
    if (e.target === d) d.close();
  });
}

// ---- a quiet starfield behind the globe
function stars() {
  const c = $('#stars'), dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < innerWidth * innerHeight / 3200; i++) {
    g.fillStyle = `rgba(220,238,245,${0.15 + rnd() * 0.6})`;
    const r = (rnd() < 0.06 ? 1.3 : 0.6) * dpr;
    g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height, r, 0, 7); g.fill();
  }
}

// slow spin until someone touches the globe
function spin() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let on = true, last = performance.now();
  const stop = () => { on = false; };
  for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart']) addEventListener(ev, stop, { once: true, passive: true });
  const step = now => {
    if (!on || view !== 'travel' || openId()) return;
    const c = map.getCenter();
    map.jumpTo({ center: [c.lng - (now - last) * 0.0016, c.lat] });
    last = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function start() {
  drawWho();
  stars();
  addEventListener('resize', () => { stars(); pad(); });
  $('#legend').innerHTML = Object.entries(LABEL).map(([k, t]) => `<span class="tag ${k}">${t}</span>`).join('');
  try { await loadData(); } catch (e) {
    $('#panel').innerHTML = '<div class="stack"><h2>The place data did not load</h2><p>Open the app with start.bat instead of double-clicking index.html.</p></div>';
    console.error(e);
    return;
  }
  initDetail(); initTravel(); initHolidays(); initSailing(); initSettings(); initDiscover(go); initPort();
  onWho(() => save('who'));
  onWhere(id => openDetail(id));
  $('#nav').addEventListener('click', e => { const v = e.target.closest('button')?.dataset.view; if (v) go(v); });
  $('#who').addEventListener('click', e => {
    if (e.target.dataset.who === undefined) return;
    state.who = +e.target.dataset.who;
    save('who');
  });
  // all rating bars, wherever they are
  document.addEventListener('click', e => {
    const b = e.target.closest('.rate button');
    if (!b) return;
    const bar = b.parentElement;
    rate(bar.dataset.id, +bar.dataset.who, +b.dataset.n);
    b.blur();
  });
  onChange(what => {
    drawWho();
    if (view === 'catalogue') { if (what === 'rating') $$('.pc').forEach(c => { if (c.matches(':hover') || c.contains(document.activeElement) || c.dataset.id === openId()) refreshCard(c.dataset.id); }); else drawCatalogue(); }
    if (view === 'discover') { if (what === 'who') resetCard(); drawDiscover(); }
    if (openId() || portOpen()) { const y = $('#detail').scrollTop; if (openId()) drawDetail(); else drawPort(); $('#detail').scrollTop = y; }
    redraw(what);
  });
  events.addEventListener('place', e => openDetail(e.detail, false));
  events.addEventListener('port', e => onPort(e.detail));
  events.addEventListener('country', e => onCountry(e.detail));

  addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v !== view && VIEWS.includes(v)) go(v); });
  const first = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'travel';
  go(first);
  try { await initMap(); } catch (e) { console.error(e); toast('The globe could not start. It needs internet and WebGL.'); return; }
  if (ENTER[view]) { setView(view); ENTER[view](); }
  if (openId()) openDetail(openId());
  if (view === 'travel' && !openId()) spin();
}
start();
