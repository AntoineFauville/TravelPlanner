// A few sentences from Wikipedia, fetched only for the place you are looking at.
const got = new Map();

// whole sentences, about 240 characters at most
function short(t) {
  let out = '';
  for (const s of t.match(/[^.!?]+[.!?]+(\s|$)/g) || [t]) {
    if (out && (out + s).length > 240) break;
    out += s;
  }
  return out.trim();
}

export function summary(p) {
  const title = p?.wiki?.split('en.wikipedia.org/wiki/')[1];
  if (!title || p.fact) return Promise.resolve('');
  if (!got.has(p.id)) {
    got.set(p.id, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
      .then(r => (r.ok ? r.json() : {})).then(j => (j.type === 'standard' ? short(j.extract || '') : '')).catch(() => ''));
  }
  return got.get(p.id);
}

// fill a box once the text arrives, if it is still on screen
export function fillSummary(box, p) {
  if (!box) return;
  summary(p).then(t => { if (t && box.isConnected) { box.textContent = t; box.hidden = false; } });
}
