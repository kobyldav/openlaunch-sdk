/**
 * Search Copernicus Data Space Sentinel-2 L2A by AOI, time and cloud cover.
 * Uses: OpenLaunch, circle, copernicus.searchSentinel2
 * Network: yes
 */
import { OpenLaunch, circle, sceneCloudCover, sceneDatetime } from "../../src/index.js";

const space = new OpenLaunch();
const area = circle([4.1453, 51.9475], 5);
const scenes = await space.copernicus.searchSentinel2(
  area,
  "2026-09-01T00:00:00Z",
  "2026-10-11T23:59:59Z",
  20,
  10,
);

console.table(scenes.features.map((item) => ({
  id: item.id,
  time: sceneDatetime(item)?.toISOString(),
  cloud: sceneCloudCover(item),
})));
