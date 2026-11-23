// Several photos per place, and a small gallery used by Discover and by the place tab.
import { extra, setExtra } from './store.js';
import { esc } from './util.js';

let book = {};
export const setPhotos = b => { book = b; };

const big = u => u.replace('/500px-', '/960px-').replace('?width=500', '?width=960');
const small = u => u.replace('/960px-', '/500px-').replace('?width=960', '?width=500');
export const tiny = u => u.replace('/960px-', '/250px-').replace('/500px-', '/250px-').replace(/\?width=\d+/, '?width=250');

// The photo you picked as main one comes first, then the catalogue photo, then the others.
export function photosOf(p) {
  const list = [];
  if (p.img) list.push({ u: p.img, ...(p.credit || {}) });
  list.push(...(book[p.id] || p.photos || []));
  // an article's own picture is sometimes a map or a flag: show real photos first
  if (p.img && list.length > 1 && book._last?.includes(p.id)) list.push(list.shift());
  const cover = extra(p.id).cover, i = list.findIndex(x => x.u === cover);
  if (i > 0) list.unshift(...list.splice(i, 1));
  return list;
}
export const thumb = p => { const f = photosOf(p)[0]; return f ? small(f.u) : ''; };

const credit = c => `Photo: ${c.src ? `<a href="${esc(c.src)}" target="_blank" rel="noopener">${esc(c.by || 'see source')}</a>` : esc(c.by || 'Unknown')}${c.lic ? `, ${esc(c.lic)}` : ''}, Wikimedia Commons`;

// Places you added yourselves: ask Wikipedia for the photos of their article, once.
const asked = new Set();
export async function findMore(p) {
  if (!p.own || !p.wiki || p.photos || asked.has(p.id)) return false;
  asked.add(p.id);
  try {
    const title = decodeURIComponent(p.wiki.split('/wiki/')[1]);
    const u = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&generator=images&gimlimit=40&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=960&iiextmetadatafilter=Artist|LicenseShortName`;
    const pages = (await (await fetch(u)).json()).query?.pages || [];
    const text = h => { const d = new DOMParser().parseFromString(h || '', 'text/html'); return d.body.textContent.trim().slice(0, 60); };
    p.photos = pages.map(x => ({ t: x.title, i: x.imageinfo?.[0] }))
      .filter(x => x.i && x.i.mime === 'image/jpeg' && x.i.width > 900 && x.i.width / x.i.height > 1.05 && !/map|plan|logo|flag|coat|portrait/i.test(x.t))
      .slice(0, 5).map(x => ({ u: x.i.thumburl.split('?')[0], by: text(x.i.extmetadata?.Artist?.value) || 'Unknown', lic: x.i.extmetadata?.LicenseShortName?.value || '', src: x.i.descriptionurl }));
    return p.photos.length > 0;
  } catch { return false; }
}

// Draws a gallery into an element and keeps it working. Returns { next, prev }.
export function gallery(el, p, { cover = true } = {}) {
  let i = 0, list = photosOf(p);
  const draw = () => {
    if (!list.length) { el.innerHTML = '<p class="nophoto">No photo found for this place.</p>'; return; }
    const f = list[i], many = list.length > 1;
    el.innerHTML = `<img src="${esc(big(f.u))}" alt="" draggable="false">
      ${many ? '<button class="gprev" aria-label="Previous photo"></button><button class="gnext" aria-label="Next photo"></button>' : ''}
      <div class="gfoot">${many ? `<span class="gdots">${list.map((_, k) => `<button data-k="${k}" class="${k === i ? 'on' : ''}" aria-label="Photo ${k + 1}"></button>`).join('')}</span>` : ''}
        <span class="gcred">${credit(f)}</span>${cover && i > 0 ? '<button class="gcover">Make this the main photo</button>' : ''}</div>`;
    if (many) new Image().src = big(list[(i + 1) % list.length].u);
  };
  const go = d => { if (list.length > 1) { i = (i + d + list.length) % list.length; draw(); } };
  el.onclick = e => {
    const t = e.target;
    if (t.matches('.gnext')) go(1);
    else if (t.matches('.gprev')) go(-1);
    else if (t.dataset.k) { i = +t.dataset.k; draw(); } else if (t.matches('.gcover')) { setExtra(p.id, { cover: list[i].u }); list = photosOf(p); i = 0; draw(); }
  };
  // swipe between photos on a phone
  let x0 = null;
  el.ontouchstart = e => { x0 = e.touches[0].clientX; };
  el.ontouchend = e => { if (x0 === null) return; const d = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(d) > 40) { e.preventDefault(); go(d < 0 ? 1 : -1); } };
  draw();
  findMore(p).then(more => { if (more && el.isConnected) { list = photosOf(p); draw(); } });
  return { next: () => go(1), prev: () => go(-1) };
}
