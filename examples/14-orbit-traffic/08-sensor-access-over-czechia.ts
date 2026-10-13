/**
 * Compute geometric Sentinel-2 swath access over a Czech Republic AOI.
 * This is geometry only: it does not prove that an image will be acquired.
 * Network: yes
 */
import {
  OpenLaunch,
  SENSOR_PRESETS,
  bbox,
  findSensorAccessWindows,
} from "../../src/index.js";

const space = new OpenLaunch();
const [sentinel2c] = await space.orbit.byName("SENTINEL-2C");

if (sentinel2c) {
  const start = new Date();
  const czechia = bbox(12.09, 48.55, 18.86, 51.06);
  const windows = findSensorAccessWindows(
    sentinel2c,
    SENSOR_PRESETS.sentinel2Msi,
    {
      area: czechia,
      start,
      end: new Date(start.getTime() + 7 * 86_400_000),
      stepSeconds: 30,
    },
  );

  console.table(windows.map((window) => ({
    start: window.start.toISOString(),
    closest: window.closest.toISOString(),
    end: window.end.toISOString(),
    minGroundDistanceKm: window.minGroundDistanceKm,
    requiredOffNadirDeg: window.requiredOffNadirDegAtClosest,
  })));
}
