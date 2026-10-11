/**
 * Cross-provider monitoring snapshot: Sentinel-2 + Sentinel-1 + weather.
 * Uses: OpenLaunch, circle, earth.monitoringSnapshot
 * Network: yes
 */
import { OpenLaunch, circle } from "../../src/index.js";

const space = new OpenLaunch();
const snapshot = await space.earth.monitoringSnapshot({
  area: circle([4.1453, 51.9475], 5),
  lookbackDays: 30,
  maxCloudCoverPercent: 20,
});

console.log({
  recommendedSensor: snapshot.recommendedSensor,
  reasons: snapshot.recommendationReasons,
  bestOpticalScene: snapshot.optical[0]?.item.id,
  radarScenes: snapshot.radar.length,
  weather: snapshot.weather,
  limitations: snapshot.limitations,
});
