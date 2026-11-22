// The tab that opens when you click a pin.
import { placeById, verdict, LABEL, daysFor } from './data.js';
import { state, extra, setExtra, save } from './store.js';
import { $, esc, MONTHS, monthRange } from './util.js';
import { rateBar, badge } from './scale.js';
import { gallery } from './photos.js';
import { facts } from './discover.js';
import { mustButton } from './port.js';
import { select, flyTo, pad } from './map.js';

let open = null;
export const openId = () => open;
// another panel (a port) may borrow this space
let release = null;
export function takeOver(fn) { open = null; release?.(); release = fn; select(null); }

export function openDetail(id, fly = true) {
  const p = placeById(id);
  if (!p) return;
  release?.(); release = null;
  open = id;
  document.body.classList.add('has-detail');
  const el = $('#detail');
  el.hidden = false;
  el.scrollTop = 0;
  // above the catalogue when the catalogue is showing
  el.style.zIndex = document.body.dataset.view === 'catalogue' ? 18 : '';
  draw();
  select(id);
  if (fly) flyTo(p);
}

export function closeDetail() {
  release?.(); release = null;
  open = null;
  $('#detail').hidden = true;
  document.body.classList.remove('has-detail');
  pad();
  select(null);
}

const q = encodeURIComponent;

export function draw() {
  const p = placeById(open);
  if (!p) return closeDetail();
  const v = verdict(p), x = extra(p.id), own = state.own.includes(p);
  const query = `${p.name} ${p.country || ''}`;
  $('#detail').innerHTML = `
    <div class="hero"><div class="gal"></div><button class="close" data-act="close">Close</button></div>
    <div class="in stack">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start">
        <div><h2>${esc(p.name)}</h2><p class="soft">${esc([...new Set([p.country, p.region])].filter(Boolean).join(' · '))}</p></div>
        ${badge(p.id)}
      </div>
      ${p.why ? `<p>${esc(p.why)}</p>` : ''}
      ${facts(p)}
      <div class="row">
        <a class="btn main" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q(query)}">Google Search</a>
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/search?udm=2&amp;q=${q(query)}">Photos</a>
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=${p.lat},${p.lon}">Maps</a>
        ${p.wiki ? `<a class="btn" target="_blank" rel="noopener" href="${esc(p.wiki)}">Wikipedia</a>` : ''}
      </div>
      ${document.body.dataset.view === 'sailing' ? mustButton(v.port.id) : ''}
      <div class="stack tight">
        ${[0, 1].map(w => `<div><div class="sm soft" style="margin-bottom:4px">${esc(state.people[w])}</div>${rateBar(p.id, w)}</div>`).join('')}
      </div>
      <div class="card stack tight">
        <span class="tag ${v.v}">${LABEL[v.v]}</span>
        <p class="sm">${esc(v.why)}</p>
        <label class="f">Decide yourselves
          <select data-x="force">${[['', 'Use the suggestion'], ['sail', LABEL.sail], ['inland', LABEL.inland], ['fly', LABEL.fly]].map(([k, t]) => `<option value="${k}" ${k === (x.force || '') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      ${p.months ? `<div class="stack tight"><div class="sm soft">Best time: ${monthRange(p.months)}</div><div class="months">${MONTHS.map((m, i) => `<span class="${p.months.includes(i + 1) ? 'y' : ''}">${m[0]}</span>`).join('')}</div></div>` : ''}
      ${p.advice ? `<p class="sm warn">Check the official travel advice before planning this one. <a target="_blank" rel="noopener" href="https://www.google.com/search?q=${q(`Auswärtiges Amt Reisehinweise ${p.country}`)}">Look it up</a></p>` : ''}
      <div class="grid2">
        <label class="f">Days to visit<input type="number" min="0.5" max="90" step="0.5" data-x="days" value="${daysFor(p)}"></label>
        <label class="check" style="align-self:end;height:40px"><input type="checkbox" data-x="visited" ${x.visited ? 'checked' : ''}>We have been here</label>
      </div>
      <label class="f">Notes<textarea rows="3" data-x="notes">${esc(x.notes || '')}</textarea></label>
      ${own ? '<button class="link quiet" data-act="remove" style="align-self:flex-start">Remove this place</button>' : ''}
    </div>`;
  gallery($('#detail .gal'), p);
}

export function initDetail() {
  const el = $('#detail');
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'close') closeDetail();
    if (a === 'remove') {
      const id = open;
      closeDetail();
      state.own = state.own.filter(p => p.id !== id);
      delete state.ratings[id];
      delete state.places[id];
      save('place');
    }
  });
  el.addEventListener('change', e => {
    const k = e.target.dataset.x;
    if (!k) return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'days') v = Math.min(90, Math.max(0.5, +v || 1));
    setExtra(open, { [k]: v });
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden && !document.querySelector('dialog[open]')) closeDetail(); });
}
