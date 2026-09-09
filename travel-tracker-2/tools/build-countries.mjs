// build-countries.mjs — regenerates ../countries-197.geojson
//
// NOT part of any site build. Run by hand with Node (>=18) when the country
// list or the source data needs to change:
//
//   node tools/build-countries.mjs
//
// What it does:
//   1. Downloads Natural Earth 1:50m admin-0 countries (pinned version).
//   2. Selects exactly the 197 sovereign states listed in ../197_countries.md,
//      matching each to its Natural Earth feature via NAME_MAP below.
//   3. Adds 3 non-sovereign "extras" (Greenland, Puerto Rico, Antarctica) that
//      stay clickable on the map but don't count toward the 197 total — these
//      carry `properties.sovereign: false`.
//   4. Rewrites every feature's properties to just { name } (+ sovereign flag),
//      trims coordinate precision to 3 decimals (~110 m), drops repeated points.
//
// The output file is the source of truth the app loads (SOURCES.countries in
// app.js). Names in it match ../197_countries.md verbatim, so a country's
// identity in Firestore is whatever string appears there.

import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SOURCE_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@5.1.2/geojson/ne_50m_admin_0_countries.geojson';
const OUT = new URL('../countries-197.geojson', import.meta.url);
const PRECISION = 3;

// canonical name (as written in 197_countries.md) -> Natural Earth `ADMIN` value.
// Only the ~13 that differ need an entry; everything else matches on ADMIN
// (falling back to NAME / NAME_LONG / GEOUNIT).
const NAME_MAP = {
  'Bahamas': 'The Bahamas',
  'Côte d’Ivoire': 'Ivory Coast',
  'Czechia': 'Czech Republic',
  'Eswatini': 'eSwatini',
  'Gambia': 'The Gambia',
  'Micronesia': 'Federated States of Micronesia',
  'Palestine': 'Palestine',
  'São Tomé and Príncipe': 'São Tomé and Principe',
  'Serbia': 'Republic of Serbia',
  'Tanzania': 'United Republic of Tanzania',
  'Timor-Leste': 'East Timor',
  'Türkiye': 'Turkey',
  'United States': 'United States of America',
  'Vatican City': 'Vatican',
};

// non-sovereign areas kept on the map but excluded from the "/ 197" count
const EXTRAS = { Greenland: 'Greenland', 'Puerto Rico': 'Puerto Rico', Antarctica: 'Antarctica' };

const round = (() => {
  const f = 10 ** PRECISION;
  const rec = c => (typeof c[0] === 'number' ? [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f] : c.map(rec));
  return rec;
})();

// drop consecutive duplicate vertices left by rounding; keep >=4 points/ring
function dedupeRings(coords) {
  if (typeof coords[0] === 'number') return coords;
  const mapped = coords.map(dedupeRings);
  if (typeof mapped[0]?.[0] === 'number') {
    const out = [mapped[0]];
    for (let i = 1; i < mapped.length; i++) {
      const a = out[out.length - 1], b = mapped[i];
      if (a[0] !== b[0] || a[1] !== b[1]) out.push(b);
    }
    return out.length >= 4 ? out : mapped;
  }
  return mapped;
}

const want = readFileSync(new URL('../197_countries.md', import.meta.url), 'utf8')
  .split('\n')
  .filter(l => l.startsWith('- '))
  .map(l => l.slice(2).trim());

if (want.length !== 197) {
  throw new Error(`Expected 197 countries in 197_countries.md, found ${want.length}`);
}

console.log(`Fetching ${SOURCE_URL} …`);
const src = await fetch(SOURCE_URL).then(r => {
  if (!r.ok) throw new Error(`source fetch failed: ${r.status}`);
  return r.json();
});

const byField = new Map();
for (const f of src.features) {
  for (const k of ['ADMIN', 'NAME', 'NAME_LONG', 'GEOUNIT']) {
    const v = f.properties[k];
    if (v && !byField.has(v)) byField.set(v, f);
  }
}

const missing = [];
function build(canonical, neName, sovereign) {
  const feat = byField.get(neName);
  if (!feat) { missing.push(`${canonical} (looked for "${neName}")`); return null; }
  const geoms = [];
  const g = feat.geometry;
  if (g.type === 'Polygon') geoms.push(g.coordinates);
  else if (g.type === 'MultiPolygon') geoms.push(...g.coordinates);
  const properties = sovereign ? { name: canonical } : { name: canonical, sovereign: false };
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'MultiPolygon', coordinates: dedupeRings(round(geoms)) },
  };
}

const features = [];
for (const name of want) features.push(build(name, NAME_MAP[name] || name, true));
for (const [name, neName] of Object.entries(EXTRAS)) features.push(build(name, neName, false));

if (missing.length) {
  console.error('Could not match:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const out = { type: 'FeatureCollection', features: features.filter(Boolean) };
const json = JSON.stringify(out);
await writeFile(OUT, json);

const sovereign = out.features.filter(f => f.properties.sovereign !== false).length;
console.log(`Wrote ${fileURLToPath(OUT)}`);
console.log(`  ${out.features.length} features — ${sovereign} sovereign + ${out.features.length - sovereign} extras`);
console.log(`  ${(json.length / 1024).toFixed(0)} KB`);
