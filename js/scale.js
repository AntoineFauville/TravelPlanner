// The rating scale, used everywhere.
import { state, score, ratingOf } from './store.js';
import { esc } from './util.js';

export const LEVELS = [
  { n: 5, text: 'Must visit', short: 'Must' },
  { n: 4, text: 'Interesting', short: 'Interesting' },
  { n: 3, text: 'Cool', short: 'Cool' },
  { n: 2, text: 'Maybe', short: 'Maybe' },
  { n: 1, text: 'Not interested', short: 'No' },
];
export const TOP = 5;
export const byN = n => LEVELS.find(l => l.n === n);

// The shared level of a place: the average of both people, rounded. 0 means nobody rated it.
export const levelOf = id => { const s = score(id); return s ? Math.min(TOP, Math.max(1, Math.round(s))) : 0; };
// "A place we really want": Interesting or Must visit
export const wanted = id => levelOf(id) >= 4;
export const isMatch = id => ratingOf(id, 0) >= 4 && ratingOf(id, 1) >= 4;

// ---- the couple's sum, used by the catalogue and Holidays
// Both ratings added up, a missing vote counts 0: Must + Must = 10, Must + Not interested = 6, Must alone = 5.
export const total = id => ratingOf(id, 0) + ratingOf(id, 1);
export const votes = id => (ratingOf(id, 0) ? 1 : 0) + (ratingOf(id, 1) ? 1 : 0);
// What a place counts for when planning. Same curve as weight() in store.js, but on half the sum,
// so a place only one of you rated counts much less than one you both want. Not rated by anyone: null.
export const sumWeight = id => { const t = total(id); return t ? 0.6 * Math.max(0, t / 2 - 1) ** 2 : null; };
// "We both really want it": a sum of 7 or more, e.g. Must + Cool, Interesting + Interesting
export const bothWant = id => total(id) >= 7;

// "Antoine: Must" and "Tamari: ?", one label each
export function both(id) {
  return `<div class="both">${state.people.map((name, i) => {
    const r = ratingOf(id, i), l = r && byN(r);
    return `<span class="lv l${r}" title="${esc(name)}: ${l ? l.text : 'not rated yet'}">${esc(name)}: ${l ? l.short : '?'}</span>`;
  }).join('')}</div>`;
}

export function badge(id, empty = '') {
  const l = levelOf(id);
  return l ? `<span class="lv l${l}" title="${byN(l).text}">${byN(l).short}</span>` : empty;
}

export function rateBar(id, who = state.who) {
  const r = ratingOf(id, who);
  return `<div class="rate" data-id="${id}" data-who="${who}" role="group" aria-label="Rating">${
    [...LEVELS].reverse().map(l => `<button class="l${l.n} ${l.n === r ? 'lit' : ''}" data-n="${l.n}" title="${l.text}" aria-pressed="${l.n === r}">${l.short}</button>`).join('')}</div>`;
}
