/**
 * Rank upcoming weather windows for passive optical Earth observation.
 * Uses: OpenLaunch, circle, earth.opticalWeatherWindows
 * Network: yes
 */
import { OpenLaunch, circle } from "../../src/index.js";

const space = new OpenLaunch();
const area = circle([4.1453, 51.9475], 5);
const windows = await space.earth.opticalWeatherWindows(area, {
  forecastDays: 7,
  maxCloudCoverPercent: 25,
  limit: 12,
});

console.table(windows.map((entry) => ({
  time: entry.conditions.time.toISOString(),
  score: entry.score.toFixed(1),
  cloud: entry.conditions.cloudCoverPercent,
  visibilityKm: entry.conditions.visibilityM ? entry.conditions.visibilityM / 1000 : undefined,
})));
