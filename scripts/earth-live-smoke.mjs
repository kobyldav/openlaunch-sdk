import { OpenLaunch, circle } from "../dist/index.js";

const strict = process.env.OPENLAUNCH_LIVE_STRICT === "1";
const space = new OpenLaunch({ timeoutMs: 30_000 });
const area = circle([4.1453, 51.9475], 5);
const now = new Date();
const from = new Date(now.getTime() - 30 * 86_400_000);

console.log("OpenLaunch Earth live smoke test");
console.log("AOI:", area.bbox);
console.log("Mode:", strict ? "strict" : "resilient");

const results = [];

async function check(name, fn) {
  const started = Date.now();
  try {
    const value = await fn();
    results.push({ name, ok: true, durationMs: Date.now() - started });
    console.log(`✅ ${name}`, value ?? "");
  } catch (error) {
    const cause = error?.cause;
    const code = cause?.code ?? error?.code;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, durationMs: Date.now() - started, code, message });
    console.error(`⚠️  ${name} unavailable:`, code ? `${code}: ${message}` : message);
  }
}

await check("Copernicus Sentinel-2 STAC", async () => {
  const response = await space.copernicus.searchSentinel2(area, from, now, 50, 3);
  return `${response.features.length} items`;
});

await check("Copernicus Sentinel-1 STAC", async () => {
  const response = await space.copernicus.searchSentinel1(area, from, now, 3);
  return `${response.features.length} items`;
});

const [lon, lat] = [(area.bbox[0] + area.bbox[2]) / 2, (area.bbox[1] + area.bbox[3]) / 2];

await check("Open-Meteo", async () => {
  const weather = await space.weather.conditionsAt(lat, lon, now, { forecastDays: 1 });
  return {
    cloudCoverPercent: weather?.cloudCoverPercent,
    visibilityM: weather?.visibilityM,
    isDay: weather?.isDay,
  };
});

await check("Planetary Computer STAC", async () => {
  const response = await space.planetaryComputer.stac.search({
    collections: ["landsat-c2-l2"],
    intersects: area.geometry,
    datetime: `${from.toISOString()}/${now.toISOString()}`,
    limit: 1,
  });
  return `${response.features.length} items`;
});

console.log("\nLive provider summary");
console.table(results.map(({ name, ok, durationMs, code }) => ({
  provider: name,
  status: ok ? "OK" : "UNAVAILABLE",
  durationMs,
  code: code ?? "",
})));

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

console.log(`Passed: ${passed}/${results.length}; unavailable/failed: ${failed}/${results.length}`);

if (passed === 0) {
  console.error("No live provider was reachable.");
  process.exitCode = 1;
} else if (strict && failed > 0) {
  console.error("Strict mode: at least one live provider failed.");
  process.exitCode = 1;
} else if (failed > 0) {
  console.log("Resilient mode: partial provider outage did not fail the whole smoke test.");
}
