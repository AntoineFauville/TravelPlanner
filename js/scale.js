// The rating scale, used everywhere.
import { state, score, ratingOf } from './store.js';

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

export function badge(id, empty = '') {
  const l = levelOf(id);
  return l ? `<span class="lv l${l}" title="${byN(l).text}">${byN(l).short}</span>` : empty;
}

export function rateBar(id, who = state.who) {
  const r = ratingOf(id, who);
  return `<div class="rate" data-id="${id}" data-who="${who}" role="group" aria-label="Rating">${
    [...LEVELS].reverse().map(l => `<button class="l${l.n} ${l.n === r ? 'lit' : ''}" data-n="${l.n}" title="${l.text}" aria-pressed="${l.n === r}">${l.short}</button>`).join('')}</div>`;
}
