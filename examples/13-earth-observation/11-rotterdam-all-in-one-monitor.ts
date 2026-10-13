/**
 * All-in-one Rotterdam terminal monitoring workflow.
 *
 * This example combines the main OpenLaunch v0.6 data pillars:
 * - CelesTrak orbital catalog metadata for a Sentinel spacecraft
 * - Open-Meteo observation weather
 * - Copernicus Sentinel-2 optical scenes
 * - Copernicus Sentinel-1 radar scenes
 * - Microsoft Planetary Computer Landsat history
 * - Launch Library 2 for the next launch
 *
 * Important:
 * This example does NOT claim that a satellite will image the target at a
 * particular future time. CelesTrak OMM metadata is catalog/orbit input only.
 * Operational pass/access prediction needs validated SGP4/SDP4 propagation,
 * sensor swath/off-nadir geometry and acquisition-plan data.
 *
 * Network: yes
 */
import {
  OpenLaunch,
  circle,
  sceneCloudCover,
  sceneDatetime,
} from "../../src/index.js";

const space = new OpenLaunch({
  timeoutMs: 30_000,
  cacheTtlMs: 10 * 60_000,
});

const target = circle([4.1453, 51.9475], 5);
const now = new Date();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
const thirtyYearsAgo = new Date(now.getTime() - 30 * 365.25 * 86_400_000);

const [
  monitoring,
  opticalWindows,
  landsatHistory,
  sentinel2Catalog,
  nextLaunch,
] = await Promise.all([
  space.earth.monitoringSnapshot({
    area: target,
    lookbackDays: 30,
    maxCloudCoverPercent: 20,
    now,
  }),

  space.earth.opticalWeatherWindows(target, {
    forecastDays: 7,
    maxCloudCoverPercent: 25,
    limit: 8,
  }),

  space.earth.searchLandsatHistory(
    target,
    thirtyYearsAgo,
    now,
    10,
  ),

  // Catalog lookup only — not a pass prediction.
  space.celestrak.byName("SENTINEL-2C"),

  space.launches.next(),
]);

const bestOptical = monitoring.optical[0];
const newestRadar = monitoring.radar
  .map((item) => ({ item, time: sceneDatetime(item) }))
  .sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0))[0];

const nextWeatherWindow = opticalWindows[0];
const landsatNewest = landsatHistory.features
  .map((item) => ({ item, time: sceneDatetime(item) }))
  .sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0))[0];

console.log("=== OpenLaunch Rotterdam monitoring brief ===");

console.log("\nTarget");
console.log({
  center: [4.1453, 51.9475],
  radiusKm: 5,
  bbox: target.bbox,
});

console.log("\nCurrent recommendation");
console.log({
  sensor: monitoring.recommendedSensor,
  reasons: monitoring.recommendationReasons,
  weather: monitoring.weather,
});

console.log("\nBest recent Sentinel-2 optical scene");
console.log(bestOptical ? {
  id: bestOptical.item.id,
  acquiredAt: bestOptical.datetime?.toISOString(),
  cloudCoverPercent: bestOptical.cloudCoverPercent,
  score: bestOptical.score,
  reasons: bestOptical.reasons,
} : "No matching optical scene");

console.log("\nNewest recent Sentinel-1 radar scene");
console.log(newestRadar ? {
  id: newestRadar.item.id,
  acquiredAt: newestRadar.time?.toISOString(),
} : "No recent radar scene");

console.log("\nBest upcoming optical weather window");
console.log(nextWeatherWindow ? {
  time: nextWeatherWindow.conditions.time.toISOString(),
  score: nextWeatherWindow.score,
  cloudCoverPercent: nextWeatherWindow.conditions.cloudCoverPercent,
  visibilityKm: nextWeatherWindow.conditions.visibilityM !== undefined
    ? nextWeatherWindow.conditions.visibilityM / 1000
    : undefined,
  reasons: nextWeatherWindow.reasons,
} : "No suitable optical weather window found");

console.log("\nSentinel-2C CelesTrak catalog record");
const sentinel = sentinel2Catalog[0];
console.log(sentinel ? {
  name: sentinel.OBJECT_NAME,
  noradCatalogId: sentinel.NORAD_CAT_ID,
  epoch: sentinel.EPOCH,
  inclinationDeg: sentinel.INCLINATION,
  meanMotionRevPerDay: sentinel.MEAN_MOTION,
} : "No matching CelesTrak record");

// Explicitly avoid implying a pass/acquisition prediction.
console.log(
  "Pass prediction:",
  "not computed — requires validated SGP4/SDP4 + sensor/acquisition constraints",
);

console.log("\nLandsat historical context");
console.log({
  returnedScenes: landsatHistory.features.length,
  newestScene: landsatNewest ? {
    id: landsatNewest.item.id,
    acquiredAt: landsatNewest.time?.toISOString(),
    cloudCoverPercent: sceneCloudCover(landsatNewest.item),
  } : undefined,
  requestedFrom: thirtyYearsAgo.toISOString(),
  requestedTo: now.toISOString(),
});

console.log("\nNext global launch from LL2");
console.log(nextLaunch ? {
  name: nextLaunch.name,
  net: nextLaunch.net.toISOString(),
  rocket: nextLaunch.rocket?.fullName ?? nextLaunch.rocket?.name,
  provider: nextLaunch.provider?.name,
  pad: nextLaunch.pad?.name,
} : "No upcoming launch returned");

console.log("\nProvenance");
console.log(monitoring.provenance);

console.log("\nKnown limitations");
for (const limitation of monitoring.limitations) {
  console.log("-", limitation);
}
