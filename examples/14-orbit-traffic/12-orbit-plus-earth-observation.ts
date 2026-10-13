/**
 * Combine geometric Sentinel-2 access, weather and recent imagery over Czechia.
 *
 * Important: a swath-access window is not a confirmed acquisition.
 * Network: yes
 */
import {
  OpenLaunch,
  SENSOR_PRESETS,
  bbox,
  centerOf,
  findSensorAccessWindows,
} from "../../src/index.js";

const space = new OpenLaunch();
const area = bbox(12.09, 48.55, 18.86, 51.06);
const [sentinel2c] = await space.orbit.byName("SENTINEL-2C");

if (sentinel2c) {
  const now = new Date();
  const access = findSensorAccessWindows(
    sentinel2c,
    SENSOR_PRESETS.sentinel2Msi,
    {
      area,
      start: now,
      end: new Date(now.getTime() + 7 * 86_400_000),
      stepSeconds: 30,
    },
  );

  const first = access[0];
  const [lon, lat] = centerOf(area);
  const weather = first
    ? await space.weather.conditionsAt(lat, lon, first.closest, { forecastDays: 7 })
    : null;

  const recent = await space.copernicus.searchSentinel2(
    area,
    new Date(now.getTime() - 30 * 86_400_000),
    now,
    30,
    10,
  );

  console.log({
    nextGeometricAccess: first,
    weatherAtAccess: weather,
    recentSceneIds: recent.features.map((item) => item.id),
    acquisitionConfirmed: false,
  });
}
