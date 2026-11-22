// The rating scale, used everywhere.
import { state, score, ratingOf } from './store.js';

export const LEVELS = [
  { n: 4, text: 'Must visit fast', short: 'Must' },
  { n: 3, text: 'Super interesting', short: 'Super' },
  { n: 2, text: 'Looks great', short: 'Great' },
  { n: 1, text: 'Cool, not super interested', short: 'Cool' },
];
export const byN = n => LEVELS.find(l => l.n === n);

// The shared level of a place: the average of both people, rounded. 0 means nobody rated it.
export const levelOf = id => { const s = score(id); return s ? Math.min(4, Math.max(1, Math.round(s))) : 0; };
// "A place we really want": Super interesting or Must visit fast
export const wanted = id => levelOf(id) >= 3;
export const isMatch = id => ratingOf(id, 0) >= 3 && ratingOf(id, 1) >= 3;

export function badge(id, empty = '') {
  const l = levelOf(id);
  return l ? `<span class="lv l${l}" title="${byN(l).text}">${byN(l).short}</span>` : empty;
}

export function rateBar(id, who = state.who) {
  const r = ratingOf(id, who);
  return `<div class="rate" data-id="${id}" data-who="${who}" role="group" aria-label="Rating">${
    [...LEVELS].reverse().map(l => `<button class="l${l.n} ${l.n === r ? 'lit' : ''}" data-n="${l.n}" title="${l.text}" aria-pressed="${l.n === r}">${l.short}</button>`).join('')}</div>`;
}
