// Usage: npm install world-atlas@2.0.2 topojson-client@3.1.0 && node tools/europa-map.mjs docs/assets/img/europa.svg
// The projection numbers it prints go into MAP in docs/assets/js/admin.js.
// Western Europe outline for the admin's parish map (Natural Earth via world-atlas, public domain).
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)));
const world = feature(topo, topo.objects.countries);
const B = { w: -10.8, e: 16.2, s: 35.6, n: 55.8 };
const W = 600;
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const k = W / ((B.e - B.w) * Math.PI / 180);
const H = Math.round((merc(B.n) - merc(B.s)) * k);
const P = (lon, lat) => [(lon - B.w) * Math.PI / 180 * k, (merc(B.n) - merc(lat)) * k];
let d = '';
for (const f of world.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) {
    if (!ring.some(([lon, lat]) => lon > B.w - 4 && lon < B.e + 4 && lat > B.s - 3 && lat < B.n + 3)) continue;
    let last = null, part = '';
    for (const [lon, lat] of ring) {
      const [x, y] = P(lon, lat);
      if (last && Math.hypot(x - last[0], y - last[1]) < 1.8) continue;
      part += `${last ? 'L' : 'M'}${x.toFixed(0)},${y.toFixed(0)}`;
      last = [x, y];
    }
    if (part.split('L').length > 3) d += part + 'Z';
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${d}" fill="#e8e7e3" stroke="#fbfbfa" stroke-width="0.8" stroke-linejoin="round"/></svg>\n`;
writeFileSync(process.argv[2], svg);
console.log(JSON.stringify({ B, W, H, k }), (svg.length / 1024).toFixed(1) + ' KB');
