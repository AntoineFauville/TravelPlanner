// Compare editions of the world tour, and different months to start the same one.
import { portById } from './data.js';
import { state } from './store.js';
import { $, esc, MONTHS, duration, n0, dateText, toast } from './util.js';
import { euro, landName } from './costs.js';
import { work, useEdition, addEdition, dropEdition } from './sailing.js';

let tab = 'editions';

const row = (label, cells, best) => `<tr><th scope="row">${label}</th>${cells.map((c, i) => `<td class="${best && best.has(i) ? 'best' : ''}">${c}</td>`).join('')}</tr>`;
// the columns with the lowest (or highest) value, if they differ
function pick(values, high) {
  const v = values.map(x => (x === null ? (high ? -Infinity : Infinity) : x)), b = high ? Math.max(...v) : Math.min(...v);
  const set = new Set(v.map((x, i) => [x, i]).filter(x => Math.abs(x[0] - b) < 0.5).map(x => x[1]));
  return set.size === v.length ? new Set() : set;
}

function editionsTable() {
  const E = state.tours.map(t => ({ t, w: work(t.sail) })), cell = (f, none = '–') => E.map(x => (x.w ? f(x.w, x.t) : none)), num = f => E.map(x => (x.w ? f(x.w) : null));
  return `<div class="scroll"><table class="cmp"><thead><tr><th></th>${E.map(x => `<th>${esc(x.t.name)}${x.t.id === state.tourId ? ' <small class="soft">open</small>' : ''}</th>`).join('')}</tr></thead><tbody>
    ${row('Leave', cell(w => `${MONTHS[w.f.month - 1]} ${w.f.year}, ${esc(portById.get(w.f.start).name)}`))}
    ${row('Back', cell(w => dateText(w.r.end)))}
    ${row('Time in all', cell(w => duration(w.r.total)), pick(num(w => w.r.total)))}
    ${row('At sea', cell(w => `${duration(w.r.sea)}, ${n0(w.r.nm)} nm`), pick(num(w => w.r.nm)))}
    ${row('Visiting', cell(w => duration(w.r.ashore)), pick(num(w => w.r.ashore), true))}
    ${row('Waiting for seasons', cell(w => duration(w.r.wait)), pick(num(w => w.r.wait)))}
    ${row('Days in storm seasons', cell(w => Math.round(w.r.risk)), pick(num(w => w.r.risk)))}
    ${row('Against the wind', cell(w => `${w.r.upwind} passage${w.r.upwind === 1 ? '' : 's'}`), pick(num(w => w.r.upwind)))}
    ${row('Places you want, reached', cell(w => w.got), pick(num(w => w.got), true))}
    ${row('Countries', cell(w => w.lands.length), pick(num(w => w.lands.length), true))}
    ${row('Embassy visas', cell(w => (w.hard.length ? `${w.hard.length}: ${esc(w.hard.map(landName).join(', '))}` : 'none')), pick(num(w => w.hard.length)))}
    ${row('All in, with the boat', cell(w => euro(w.c.all)), pick(num(w => w.c.all)))}
    ${row('On the way', cell(w => euro(w.c.running)), pick(num(w => w.c.running)))}
    ${row('A month on board', cell(w => euro(w.c.perMonth)), pick(num(w => w.c.perMonth)))}
    ${row(`Boat for ${euro(state.tour.total)} in all`, cell(w => (w.c.afford > 5000 ? euro(w.c.afford) : 'not enough')), pick(num(w => w.c.afford), true))}
    ${row('Stops', cell(w => `<small>${esc(w.ord.map(id => portById.get(id).label).join(', '))}</small>`))}
    ${row('Left out', cell(w => { const all = new Set(E.flatMap(x => x.w?.ord || [])); const out = [...all].filter(id => !w.ord.includes(id)); return `<small>${esc(out.map(id => portById.get(id).label).join(', ')) || 'nothing'}</small>`; }))}
    <tr><th></th>${E.map(x => `<td><button class="btn small" data-cmp-open="${x.t.id}">Open</button> ${E.length > 1 ? `<button class="link quiet" data-cmp-del="${x.t.id}">Delete</button>` : ''}</td>`).join('')}</tr>
  </tbody></table></div>${E.length === 1 ? '<p class="sm soft">You have one edition so far. Use "New edition from this" in the panel, or save a start month as a new edition.</p>' : '<p class="sm soft">Green is the best value in a row.</p>'}`;
}

function monthsTable() {
  const s = state.sail;
  if (!s.stops.length) return '<p class="soft">Pick some stops first.</p>';
  const R = MONTHS.map((m, i) => ({ m, i: i + 1, w: work({ ...s, month: i + 1 }) })).filter(x => x.w);
  const best = f => pick(R.map(x => f(x.w)));
  const b = { t: best(w => w.r.total), w: best(w => w.r.wait), k: best(w => w.r.risk), c: best(w => w.c.running) };
  return `<p class="sm soft">The same stops as ${esc(state.tours.find(x => x.id === state.tourId).name)}, leaving in ${s.year}, each time in its own best order.</p>
    <div class="scroll"><table class="cmp"><thead><tr><th>Leave in</th><th>Time in all</th><th>Waiting</th><th>Storm-season days</th><th>Cost on the way</th><th></th></tr></thead><tbody>
    ${R.map((x, k) => `<tr><th scope="row">${x.m}${x.i === s.month ? ' <small class="soft">now</small>' : ''}</th><td class="${b.t.has(k) ? 'best' : ''}">${duration(x.w.r.total)}</td><td class="${b.w.has(k) ? 'best' : ''}">${duration(x.w.r.wait)}</td><td class="${b.k.has(k) ? 'best' : ''}">${Math.round(x.w.r.risk)}</td><td class="${b.c.has(k) ? 'best' : ''}">${euro(x.w.c.running)}</td><td><button class="link" data-cmp-month="${x.i}">Save as edition</button></td></tr>`).join('')}
  </tbody></table></div>`;
}

function draw() {
  const d = $('#compare');
  d.innerHTML = `<div class="stack"><div class="row" style="justify-content:space-between"><h2>Compare the world tour</h2><button class="btn" data-cmp-close>Close</button></div>
    <div class="tabs" style="max-width:420px"><button data-cmp-tab="editions" aria-pressed="${tab === 'editions'}">Editions</button><button data-cmp-tab="months" aria-pressed="${tab === 'months'}">Start in another month</button></div>
    ${tab === 'editions' ? editionsTable() : monthsTable()}</div>`;
}
export function openCompare() { draw(); $('#compare').showModal(); }

export function initCompare() {
  $('#compare').addEventListener('click', e => {
    const d = e.target.closest('button')?.dataset, dlg = $('#compare');
    if (e.target === dlg) dlg.close();
    if (!d) return;
    if (d.cmpClose !== undefined) dlg.close();
    if (d.cmpTab) { tab = d.cmpTab; draw(); }
    if (d.cmpOpen) { useEdition(d.cmpOpen); dlg.close(); }
    if (d.cmpDel) { const t = state.tours.find(x => x.id === d.cmpDel); if (confirm(`Delete the edition "${t.name}"?`)) { dropEdition(d.cmpDel); draw(); } }
    if (d.cmpMonth) {
      const t = state.tours.find(x => x.id === state.tourId), m = +d.cmpMonth;
      const n = addEdition(`${t.name.replace(/ from [A-Z][a-z]{2}$/, '')} from ${MONTHS[m - 1]}`, { ...state.sail, month: m });
      tab = 'editions';
      draw();
      toast(`${n} is saved.`);
    }
  });
}
