import { allPlaces, ports, verdict } from './data.js';
import { state, score, extra, onChange } from './store.js';
import { splitDateLine, esc } from './util.js';
import { levelOf, byN } from './scale.js';

/* global maplibregl, topojson */
export const COLORS = { sail: '#53cfe0', inland: '#9fe08a', fly: '#ffb24d' };
export let map;
let ready = false;
export const events = new EventTarget();
const fire = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
const wide = () => innerWidth > 760;
const fc = features => ({ type: 'FeatureCollection', features });
const empty = fc([]);
const nameField = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
const label = (size, color = '#fff', opacity = 1) => ({
  layout: { 'text-field': nameField, 'text-font': ['Noto Sans Regular'], 'text-size': size, 'text-max-width': 8 },
  paint: { 'text-color': color, 'text-opacity': opacity, 'text-halo-color': 'rgba(6,16,22,.85)', 'text-halo-width': 1.3 },
});

const style = {
  version: 8,
  projection: { type: 'globe' },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
  sources: {
    // far away: NASA Blue Marble (public domain). Close up: Sentinel-2 2016, which may be used commercially.
    // Newer Sentinel mosaics (2018 and later) look sharper but are for non-commercial use only.
    blue: {
      type: 'raster', tileSize: 256, maxzoom: 8, attribution: 'NASA Blue Marble',
      tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg'],
    },
    sat: {
      type: 'raster', tileSize: 256, maxzoom: 14,
      tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
      attribution: '<a href="https://cloudless.eox.at">EOxCloudless</a> by EOX (modified Copernicus Sentinel data 2016), CC BY 4.0',
    },
    osm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b2233' } },
    { id: 'blue', type: 'raster', source: 'blue', paint: { 'raster-brightness-max': 0.92, 'raster-fade-duration': 0 } },
    { id: 'sat', type: 'raster', source: 'sat', minzoom: 5, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6.5, 1], 'raster-fade-duration': 0 } },
    { id: 'roads', type: 'line', source: 'osm', 'source-layer': 'transportation', minzoom: 11,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'path']]],
      paint: { 'line-color': '#fff', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 16, 3] } },
    { id: 'borders', type: 'line', source: 'osm', 'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': '#fff', 'line-opacity': 0.4, 'line-width': 0.8 } },
  ],
};

export function initMap() {
  map = new maplibregl.Map({
    container: 'map', style, center: [30, 24], zoom: innerWidth > 760 ? 2.1 : 1, minZoom: 0.6, maxZoom: 18,
    attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  return new Promise(done => map.once('style.load', () => { build(); ready = true; pad();
    if (!wide()) document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'); drawPlaces(); done(); }));
}

function build() {
  for (const id of ['zones', 'countries', 'route', 'ports', 'places']) map.addSource(id, { type: 'geojson', data: empty });
  const add = l => map.addLayer(l);
  const bold = ['Noto Sans Bold'];
  add({ id: 'zones', type: 'fill', source: 'zones', paint: { 'fill-color': '#ff5a4d', 'fill-opacity': 0.26 } });
  add({ id: 'countries', type: 'fill', source: 'countries', layout: { visibility: 'none' },
    paint: { 'fill-color': COLORS.sail, 'fill-opacity': ['case', ['get', 'on'], 0.24, ['boolean', ['feature-state', 'hover'], false], 0.16, 0] } });
  add({ id: 'country-names', type: 'symbol', source: 'osm', 'source-layer': 'place', maxzoom: 6, filter: ['==', ['get', 'class'], 'country'],
    ...label(['interpolate', ['linear'], ['zoom'], 1, 9, 5, 14], '#e3ecec', 0.75) });
  add({ id: 'cities', type: 'symbol', source: 'osm', 'source-layer': 'place', minzoom: 5,
    filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]], ...label(['interpolate', ['linear'], ['zoom'], 5, 10, 12, 14]) });
  const round = { 'line-cap': 'round', 'line-join': 'round' };
  add({ id: 'route-glow', type: 'line', source: 'route', layout: round, paint: { 'line-color': '#04141c', 'line-opacity': 0.55, 'line-width': 6 } });
  add({ id: 'route', type: 'line', source: 'route', filter: ['!', ['get', 'dash']], layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 2.6 } });
  add({ id: 'route-dash', type: 'line', source: 'route', filter: ['get', 'dash'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 2.2, 'line-dasharray': [2, 1.6] } });
  add({ id: 'places', type: 'circle', source: 'places', layout: { 'circle-sort-key': ['get', 'score'] }, paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['+', 2.2, ['*', 0.9, ['get', 'score']]], 6, ['+', 5, ['*', 1.5, ['get', 'score']]]],
    'circle-color': ['get', 'color'], 'circle-opacity': ['case', ['>', ['get', 'score'], 0], 1, 0.75],
    'circle-stroke-color': ['case', ['get', 'sel'], '#fff', '#04141c'], 'circle-stroke-width': ['case', ['get', 'sel'], 3, 1] } });
  add({ id: 'place-names', type: 'symbol', source: 'places', minzoom: 3.2, layout: { 'text-field': ['get', 'name'], 'text-font': bold,
    'text-size': 12, 'text-offset': [0, 1], 'text-anchor': 'top', 'symbol-sort-key': ['-', 0, ['get', 'score']] },
    paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(4,20,28,.9)', 'text-halo-width': 1.5 } });
  add({ id: 'ports', type: 'circle', source: 'ports', layout: { visibility: 'none', 'circle-sort-key': ['case', ['get', 'on'], 1, 0] }, paint: {
    'circle-radius': ['case', ['get', 'on'], 6.5, 4], 'circle-color': ['case', ['get', 'on'], '#fff', '#12829a'],
    'circle-stroke-color': ['case', ['get', 'on'], '#0f6f84', '#d8f6fb'], 'circle-stroke-width': ['case', ['get', 'on'], 3, 1.2] } });
  add({ id: 'port-names', type: 'symbol', source: 'ports', layout: { visibility: 'none', 'text-field': ['get', 'text'], 'text-font': bold,
    'text-size': 12, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'symbol-sort-key': ['case', ['get', 'on'], 0, 1] },
    paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(4,20,28,.9)', 'text-halo-width': 1.5 } });

  const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'tip' });
  for (const l of ['places', 'ports']) {
    map.on('mousemove', l, e => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features[0], p = f.properties;
      tip.setLngLat(f.geometry.coordinates).setHTML(`<b>${esc(p.name || p.text)}</b>${p.sub ? `<br>${esc(p.sub)}` : ''}`).addTo(map);
    });
    map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; tip.remove(); });
  }
  let hov = null;
  const hover = (id, on) => id !== null && map.setFeatureState({ source: 'countries', id }, { hover: on });
  map.on('mousemove', 'countries', e => {
    const id = e.features[0].id;
    if (id === hov) return;
    hover(hov, false); hov = id; hover(id, true);
  });
  map.on('mouseleave', 'countries', () => { hover(hov, false); hov = null; });

  map.on('click', e => {
    const box = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
    const top = map.queryRenderedFeatures(box, { layers: [view === 'sailing' ? 'ports' : 'places'] })[0];
    if (top) return fire(top.layer.id === 'ports' ? 'port' : 'place', top.properties.id);
    if (view === 'sailing') {
      const c = map.queryRenderedFeatures(e.point, { layers: ['countries'] })[0];
      if (c) fire('country', { name: c.properties.name, at: e.lngLat });
    }
  });
  onChange(drawPlaces);
}

let view = 'travel', selected = null, filter = null;
export function setFilter(fn) { filter = fn; drawPlaces(); }
export function select(id) { selected = id; drawPlaces(); }

export function drawPlaces() {
  if (!ready) return;
  const list = allPlaces().filter(p => p.id === selected || !filter || filter(p));
  map.getSource('places').setData(fc(list.map(p => {
    const s = score(p.id);
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: {
      id: p.id, name: p.name, sub: `${p.country || ''}${s ? ` · ${byN(levelOf(p.id)).text}` : ''}`, score: s,
      sel: p.id === selected, color: extra(p.id).visited ? '#b7c2c4' : COLORS[verdict(p).v] } };
  })));
}

export function drawPorts(on) {
  if (!ready) return;
  map.getSource('ports').setData(fc(ports.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    properties: { id: p.id, text: p.label, sub: p.name, on: on.has(p.id) } }))));
  const names = new Set(ports.filter(p => on.has(p.id)).map(p => p.country));
  if (countries) {
    for (const f of countries.features) f.properties.on = names.has(f.properties.name);
    map.getSource('countries').setData(countries);
  }
}

// parts: [{ line:[[lon,lat]...], color, dash }]
export function drawRoute(parts) {
  if (!ready) return;
  map.getSource('route').setData(fc(parts.map(p => ({ type: 'Feature', properties: { color: p.color, dash: !!p.dash },
    geometry: { type: 'MultiLineString', coordinates: splitDateLine(p.line) } }))));
}

let countries = null;
async function loadCountries() {
  if (countries) return;
  const t = await (await fetch('https://unpkg.com/world-atlas@2.0.2/countries-50m.json')).json();
  const g = topojson.feature(t, t.objects.countries);
  const names = new Set(ports.map(p => p.country));
  g.features = g.features.filter(f => names.has(f.properties.name));
  // keep rings that touch the date line in one piece
  const fix = ring => {
    let off = 0;
    return ring.map(([x, y], i) => {
      if (i) { const d = x - ring[i - 1][0]; if (d > 180) off -= 360; if (d < -180) off += 360; }
      return [x + off, y];
    });
  };
  g.features.forEach((f, i) => {
    f.id = i + 1;
    f.properties = { name: f.properties.name, on: false };
    const c = f.geometry.coordinates;
    f.geometry.coordinates = f.geometry.type === 'Polygon' ? c.map(fix) : c.map(p => p.map(fix));
  });
  countries = g;
}

export async function setView(v) {
  view = v;
  if (!ready) return;
  const sail = v === 'sailing';
  for (const l of ['ports', 'port-names', 'countries']) map.setLayoutProperty(l, 'visibility', sail ? 'visible' : 'none');
  if (!sail) { showStorms(null); return; }
  try { await loadCountries(); } catch { /* country shapes are optional: ports still work */ }
  drawPorts(new Set([state.sail.start, ...state.sail.stops]));
}

// Where tropical storms form, by month. Broad outlines for planning only.
export const ZONES = {
  NA: { name: 'hurricane season', months: [6, 7, 8, 9, 10, 11], box: [[-98, 18], [-98, 31], [-80, 36], [-60, 42], [-38, 36], [-18, 18], [-18, 9], [-60, 11.5], [-75, 12], [-84, 13], [-90, 16]] },
  NEP: { name: 'hurricane season', months: [5, 6, 7, 8, 9, 10, 11], box: [[-168, 10], [-168, 24], [-125, 25], [-108, 25], [-96, 15.5], [-92, 12], [-110, 9]] },
  NWP: { name: 'typhoon season', months: [5, 6, 7, 8, 9, 10, 11, 12], box: [[105, 9], [107, 18], [110, 21], [120, 28], [122, 34], [145, 42], [170, 36], [179, 18], [165, 8], [128, 7]] },
  NI: { name: 'cyclone and monsoon season', months: [5, 6, 7, 8, 9, 10, 11, 12], box: [[51, 10], [57, 20], [67, 24], [72.5, 18], [75, 9], [80, 7], [79.5, 12], [86, 21], [92, 22], [97, 15], [97, 8], [80, 4], [60, 5]] },
  SI: { name: 'cyclone season', months: [11, 12, 1, 2, 3, 4], box: [[36, -26], [41, -14], [50, -9], [90, -8], [125, -9], [137, -11], [137, -16], [122, -20], [113, -28], [80, -32], [45, -33]] },
  SP: { name: 'cyclone season', months: [11, 12, 1, 2, 3, 4], box: [[137, -11], [150, -9], [179, -7], [200, -9], [222, -14], [222, -24], [200, -28], [170, -32], [153, -30], [146, -19], [141, -15]] },
};
export function showStorms(month) {
  if (!ready) return;
  const on = month ? Object.values(ZONES).filter(z => z.months.includes(month)) : [];
  map.getSource('zones').setData(fc(on.map(z => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...z.box, z.box[0]]] } }))));
}

// keep the globe centred in the part of the screen the panels leave free
export function pad() {
  if (!map) return;
  const detail = document.body.classList.contains('has-detail');
  map.setPadding(wide() ? { left: 394, right: detail && innerWidth > 1100 ? 374 : 0, top: 50, bottom: 0 } : { left: 0, right: 0, top: 96, bottom: innerHeight * 0.46 });
}
export function flyTo(p, zoom = 5.5) {
  if (!ready) return;
  pad();
  map.flyTo({ center: [p.lon, p.lat], zoom, duration: 1600 });
}

// Show a group of places. On a globe, fitting a box only works for groups smaller than a hemisphere.
export function fit(list) {
  if (!ready || !list.length) return;
  if (list.length === 1) return flyTo(list[0]);
  const ref = list[0].lon, b = new maplibregl.LngLatBounds();
  for (const p of list) {
    let lon = p.lon;
    while (lon - ref > 180) lon -= 360;
    while (lon - ref < -180) lon += 360;
    b.extend([lon, p.lat]);
  }
  const cam = map.cameraForBounds(b, { maxZoom: 7, padding: 60 });
  const c = b.getCenter(), zoom = Math.max(1.2, Math.min(7, (cam?.zoom ?? 3) - 0.35));
  flyTo({ lon: c.lng, lat: c.lat }, zoom);
}

// turn the globe without changing anything else
export const look = o => ready && map.easeTo(o);
export const zoomNow = () => (ready ? map.getZoom() : 2);
export const popup = (at, html) => new maplibregl.Popup({ className: 'pick', maxWidth: '260px' }).setLngLat(at).setHTML(html).addTo(map);
