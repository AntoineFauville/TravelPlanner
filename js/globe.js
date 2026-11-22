// A small still picture of the Earth with a pin: where in the world is this place?
// Drawn from one NASA image, so it costs nothing and needs no map tiles.

/* global topojson */
let earth = null, borders = null;
const R = Math.PI / 180;

async function load() {
  if (!earth) {
    earth = (async () => {
      const img = new Image();
      img.src = 'data/earth.jpg';
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, c.width, c.height);
    })();
  }
  return earth;
}
async function loadBorders() {
  if (!borders) {
    borders = fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json').then(r => r.json())
      .then(t => topojson.mesh(t, t.objects.countries).coordinates).catch(() => []);
  }
  return borders;
}

export async function drawGlobe(canvas, lat, lon) {
  const css = canvas.clientWidth || 132, dpr = Math.min(2, window.devicePixelRatio || 1), S = Math.round(css * dpr);
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  const tex = await load();
  if (!canvas.isConnected) return;
  // tilt a little less than the place itself, so north stays recognisable
  const lat0 = lat * 0.72 * R, lon0 = lon * R, r = S / 2 - 2 * dpr, c = S / 2;
  const sin0 = Math.sin(lat0), cos0 = Math.cos(lat0);
  const out = g.createImageData(S, S), W = tex.width, H = tex.height, T = tex.data, D = out.data;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const x = (px + 0.5 - c) / r, y = (c - py - 0.5) / r, q = x * x + y * y, k = (py * S + px) * 4;
      if (q > 1) {
        const d = Math.sqrt(q) - 1;               // thin blue air around it
        if (d < 0.03) { D[k] = 110; D[k + 1] = 180; D[k + 2] = 235; D[k + 3] = 150 * (1 - d / 0.03); }
        continue;
      }
      const z = Math.sqrt(1 - q);
      const la = Math.asin(y * cos0 + z * sin0), lo = lon0 + Math.atan2(x, z * cos0 - y * sin0);
      const u = ((lo / R + 180) / 360 % 1 + 1) % 1, v = 0.5 - la / Math.PI;
      const i = (Math.min(H - 1, v * H | 0) * W + (u * W | 0)) * 4, shade = 0.5 + 0.62 * z;
      D[k] = Math.min(255, T[i] * shade + 6); D[k + 1] = Math.min(255, T[i + 1] * shade + 8); D[k + 2] = Math.min(255, T[i + 2] * shade + 10); D[k + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);

  const project = (o, a) => {
    const p = a * R, l = o * R - lon0, z = Math.sin(p) * sin0 + Math.cos(p) * cos0 * Math.cos(l);
    return z > 0.02 ? [c + r * Math.cos(p) * Math.sin(l), c - r * (Math.sin(p) * cos0 - Math.cos(p) * sin0 * Math.cos(l))] : null;
  };
  const pin = () => {
    const s = project(lon, lat);
    if (!s) return;
    g.beginPath(); g.arc(s[0], s[1], 8 * dpr, 0, 7); g.fillStyle = 'rgba(255,95,134,.35)'; g.fill();
    g.beginPath(); g.arc(s[0], s[1], 4 * dpr, 0, 7); g.fillStyle = '#ff5f86'; g.fill();
    g.lineWidth = 1.5 * dpr; g.strokeStyle = '#fff'; g.stroke();
  };
  pin();
  const lines = await loadBorders();
  if (!canvas.isConnected || canvas.width !== S) return;
  g.lineWidth = 0.6 * dpr; g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath();
  for (const l of lines) {
    let on = false;
    for (const [o, a] of l) { const s = project(o, a); if (!s) { on = false; continue; } if (on) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); on = true; }
  }
  g.stroke();
  pin();
}
