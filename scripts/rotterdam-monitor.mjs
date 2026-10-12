import {
  OpenLaunch,
  SENSOR_PRESETS,
  findSensorAccessWindows,
  circle,
  sceneCloudCover,
  sceneDatetime,
} from "../dist/index.js";

const space = new OpenLaunch({
  timeoutMs: 30_000,
  cacheTtlMs: 10 * 60_000,
});

const target = circle([4.1453, 51.9475], 5);
const now = new Date();
const thirtyYearsAgo = new Date(now.getTime() - 30 * 365.25 * 86_400_000);

console.log("=== OpenLaunch Rotterdam all-in-one example ===");

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
  space.earth.searchLandsatHistory(target, thirtyYearsAgo, now, 10),
  space.celestrak.byName("SENTINEL-2C"),
  space.launches.next(),
]);

const bestOptical = monitoring.optical[0];
const newestRadar = monitoring.radar
  .map((item) => ({ item, time: sceneDatetime(item) }))
  .sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0))[0];
const bestWindow = opticalWindows[0];
const newestLandsat = landsatHistory.features
  .map((item) => ({ item, time: sceneDatetime(item) }))
  .sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0))[0];
const sentinel = sentinel2Catalog[0];

console.log("\nTarget:", {
  center: [4.1453, 51.9475],
  radiusKm: 5,
  bbox: target.bbox,
});

console.log("\nRecommendation:", {
  sensor: monitoring.recommendedSensor,
  reasons: monitoring.recommendationReasons,
  weather: monitoring.weather,
});

console.log("\nBest Sentinel-2:", bestOptical ? {
  id: bestOptical.item.id,
  acquiredAt: bestOptical.datetime?.toISOString(),
  cloudCoverPercent: bestOptical.cloudCoverPercent,
  score: bestOptical.score,
} : null);

console.log("\nNewest Sentinel-1:", newestRadar ? {
  id: newestRadar.item.id,
  acquiredAt: newestRadar.time?.toISOString(),
} : null);

console.log("\nBest optical weather window:", bestWindow ? {
  time: bestWindow.conditions.time.toISOString(),
  score: bestWindow.score,
  cloudCoverPercent: bestWindow.conditions.cloudCoverPercent,
  visibilityKm: bestWindow.conditions.visibilityM !== undefined
    ? bestWindow.conditions.visibilityM / 1000
    : undefined,
} : null);

console.log("\nSentinel-2C catalog:", sentinel ? {
  name: sentinel.OBJECT_NAME,
  noradCatalogId: sentinel.NORAD_CAT_ID,
  epoch: sentinel.EPOCH,
  inclinationDeg: sentinel.INCLINATION,
  meanMotionRevPerDay: sentinel.MEAN_MOTION,
} : null);

// Reuse the already downloaded CelesTrak OMM record. A future geometric
// access window is NOT evidence of a scheduled optical acquisition.
const orbitalSatellite = sentinel ? space.orbit.fromOmm(sentinel) : null;
const rotterdamObserver = { latitudeDeg: 51.9475, longitudeDeg: 4.1453, heightM: 0 };
const horizon = new Date(now.getTime() + 48 * 3_600_000);
const opticalHorizon = new Date(now.getTime() + 7 * 86_400_000);

const groundPasses = orbitalSatellite
  ? space.orbit.passes(orbitalSatellite, rotterdamObserver, {
      start: now,
      end: horizon,
      minElevationDeg: 10,
      stepSeconds: 30,
      maxPasses: 20,
    })
  : [];

const sensorAccess = orbitalSatellite
  ? findSensorAccessWindows(orbitalSatellite, SENSOR_PRESETS.sentinel2Msi, {
      area: target,
      start: now,
      end: opticalHorizon,
      stepSeconds: 30,
      maxWindows: 20,
    })
  : [];

console.log("\nSentinel-2C SGP4 geometry:", orbitalSatellite ? {
  elementEpoch: orbitalSatellite.sourceInfo.epoch.toISOString(),
  elementAgeHours: orbitalSatellite.elementAgeHours(now),
  nextGroundPassesAbove10Deg: groundPasses.slice(0, 3).map((pass) => ({
    aos: pass.aos.toISOString(),
    tca: pass.tca.toISOString(),
    los: pass.los.toISOString(),
    maxElevationDeg: pass.maxElevationDeg,
  })),
  nextMsiGeometricAccessWindows: sensorAccess.slice(0, 3).map((window) => ({
    start: window.start.toISOString(),
    closest: window.closest.toISOString(),
    end: window.end.toISOString(),
    minGroundDistanceKm: window.minGroundDistanceKm,
  })),
  acquisitionConfirmed: false,
  model: "SGP4 orbital states + spherical-Earth nominal MSI swath",
} : "No current CelesTrak OMM record; orbital access not computed.");

console.log("\nLandsat history:", {
  returnedScenes: landsatHistory.features.length,
  newestScene: newestLandsat ? {
    id: newestLandsat.item.id,
    acquiredAt: newestLandsat.time?.toISOString(),
    cloudCoverPercent: sceneCloudCover(newestLandsat.item),
  } : null,
});

console.log("\nNext LL2 launch:", nextLaunch ? {
  name: nextLaunch.name,
  net: nextLaunch.net.toISOString(),
  rocket: nextLaunch.rocket?.fullName ?? nextLaunch.rocket?.name,
  provider: nextLaunch.provider?.name,
  pad: nextLaunch.pad?.name,
} : null);

console.log("\nProvenance:", monitoring.provenance);
console.log("\nLimitations:");
for (const limitation of monitoring.limitations) console.log("-", limitation);
console.log("- Ground-station line-of-sight passes and nominal swath access are different geometries.");
console.log("- A geometric swath window does not prove daylight, instrument tasking, actual acquisition or published imagery.");
console.log("- Orbit accuracy depends on the age and quality of CelesTrak GP elements.");
