export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENT[c]);
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAY = 86400000;
export const norm = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function km(a, b) {
  const r = Math.PI / 180, dl = (b.lon - a.lon) * r;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dl / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Great-circle line between two places, for drawing flights and land hops.
export function arc(a, b) {
  const r = Math.PI / 180, d = km(a, b) / 6371, n = Math.max(2, Math.ceil(km(a, b) / 200)), out = [];
  if (d < 1e-6) return [[a.lon, a.lat], [b.lon, b.lat]];
  for (let i = 0; i <= n; i++) {
    const A = Math.sin((1 - i / n) * d) / Math.sin(d), B = Math.sin(i / n * d) / Math.sin(d);
    const x = A * Math.cos(a.lat * r) * Math.cos(a.lon * r) + B * Math.cos(b.lat * r) * Math.cos(b.lon * r);
    const y = A * Math.cos(a.lat * r) * Math.sin(a.lon * r) + B * Math.cos(b.lat * r) * Math.sin(b.lon * r);
    const z = A * Math.sin(a.lat * r) + B * Math.sin(b.lat * r);
    out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r]);
  }
  return out;
}

// A line as MultiLineString pieces that never cross the date line.
export function splitDateLine(line) {
  const parts = [[]];
  const wrap = x => ((x + 180) % 360 + 360) % 360 - 180;
  let prev = null;
  for (const [rawLon, lat] of line) {
    const lon = wrap(rawLon);
    if (prev && Math.abs(lon - prev[0]) > 180) {
      const side = prev[0] > 0 ? 180 : -180, total = 360 - Math.abs(lon - prev[0]);
      const f = total ? (180 - Math.abs(prev[0])) / total : 0, mid = prev[1] + (lat - prev[1]) * f;
      parts[parts.length - 1].push([side, mid]);
      parts.push([[-side, mid]]);
    }
    parts[parts.length - 1].push([lon, lat]);
    prev = [lon, lat];
  }
  return parts.filter(p => p.length > 1);
}

export function monthRange(list) {
  if (!list || !list.length) return '';
  if (list.length === 12) return 'All year';
  const set = new Set(list), out = [];
  for (const m of list) {
    const before = m === 1 ? 12 : m - 1;
    if (set.has(before)) continue;
    let e = m;
    while (set.has(e % 12 + 1)) e = e % 12 + 1;
    out.push(m === e ? MONTHS[m - 1] : `${MONTHS[m - 1]}–${MONTHS[e - 1]}`);
  }
  return out.join(', ');
}

export function days(d) {
  const r = Math.round(d * 2) / 2;
  if (r === 0.5) return 'half a day';
  return `${r % 1 ? r.toFixed(1) : r} day${r === 1 ? '' : 's'}`;
}
export function duration(d) {
  if (d < 45) return days(Math.round(d));
  const m = Math.round(d / 30.44);
  if (m < 12) return `${m} months`;
  const y = Math.floor(m / 12), r = m % 12;
  return `${y} year${y > 1 ? 's' : ''}${r ? ` ${r} month${r > 1 ? 's' : ''}` : ''}`;
}
export const n0 = x => Math.round(x).toLocaleString('en');
export function dateText(t) {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

let toastTimer;
export function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 3800);
}
