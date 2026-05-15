/**
 * Smoke test: take a real SG postal code, look up its lat/lng via
 * OneMap, then run point-in-polygon against the vendored ELD GeoJSON
 * to confirm we get the right constituency back.
 *
 *   node scripts/smoke-constituency.mjs [postal]
 *
 * Default postal = 540102 (Rivervale Walk, Sengkang).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { point } from "@turf/helpers";
import pip from "@turf/boolean-point-in-polygon";

const POSTAL = process.argv[2] ?? "540102";

console.log(`\nLooking up postal code ${POSTAL} via OneMap...`);
const onemapRes = await fetch(
  `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${POSTAL}&returnGeom=Y&getAddrDetails=Y&pageNum=1`,
);
const onemap = await onemapRes.json();
const top = onemap.results?.[0];
if (!top) {
  console.error("OneMap returned no results.");
  process.exit(1);
}
const lat = Number(top.LATITUDE);
const lng = Number(top.LONGITUDE);
console.log(`  Address:  ${top.ADDRESS}`);
console.log(`  Lat/lng:  ${lat}, ${lng}`);

console.log(`\nLoading vendored ELD GeoJSON...`);
const geoPath = path.join(
  process.cwd(),
  "lib",
  "sg",
  "data",
  "electoral_boundaries_ge2025.geojson.json",
);
const boundaries = JSON.parse(await readFile(geoPath, "utf8"));
console.log(`  ${boundaries.features.length} electoral divisions loaded`);

console.log(`\nRunning point-in-polygon...`);
const pt = point([lng, lat]); // turf coords: [lng, lat], not [lat, lng]
const match = boundaries.features.find((f) => {
  if (!f.geometry) return false;
  if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") return false;
  return pip(pt, f);
});

if (!match) {
  console.error(`  ✗ No constituency polygon contains (${lng}, ${lat}).`);
  process.exit(1);
}

const fullName = match.properties.ED_DESC_FU;
console.log(`  ✓ ${fullName}`);
console.log("");
