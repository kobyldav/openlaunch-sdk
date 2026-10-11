import { OpenLaunch, circle } from "../dist/index.js";

const space = new OpenLaunch({ timeoutMs: 30_000 });
const area = circle([4.1453, 51.9475], 5);
const now = new Date();
const from = new Date(now.getTime() - 30 * 86_400_000);

console.log("OpenLaunch Earth live smoke test");
console.log("AOI:", area.bbox);

const sentinel2 = await space.copernicus.searchSentinel2(area, from, now, 50, 3);
console.log("✅ Copernicus Sentinel-2 STAC:", sentinel2.features.length, "items");

const sentinel1 = await space.copernicus.searchSentinel1(area, from, now, 3);
console.log("✅ Copernicus Sentinel-1 STAC:", sentinel1.features.length, "items");

const [lon, lat] = [(area.bbox[0] + area.bbox[2]) / 2, (area.bbox[1] + area.bbox[3]) / 2];
const weather = await space.weather.conditionsAt(lat, lon, now, { forecastDays: 1 });
console.log("✅ Open-Meteo:", {
  cloudCoverPercent: weather?.cloudCoverPercent,
  visibilityM: weather?.visibilityM,
  isDay: weather?.isDay,
});

const pc = await space.planetaryComputer.stac.search({
  collections: ["landsat-c2-l2"],
  intersects: area.geometry,
  datetime: `${from.toISOString()}/${now.toISOString()}`,
  limit: 1,
});
console.log("✅ Planetary Computer STAC:", pc.features.length, "items");

console.log("Earth live smoke tests passed.");
