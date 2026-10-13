/**
 * Search Sentinel-1 radar scenes. SAR works independently of daylight and is much less affected by clouds.
 * Uses: OpenLaunch, bbox, copernicus.searchSentinel1
 * Network: yes
 */
import { OpenLaunch, bbox, sceneDatetime } from "../../src/index.js";

const space = new OpenLaunch();
const port = bbox(4.00, 51.80, 4.35, 52.05);
const scenes = await space.copernicus.searchSentinel1(
  port,
  "2026-10-01T00:00:00Z",
  "2026-10-11T23:59:59Z",
  10,
);

console.table(scenes.features.map((item) => ({
  id: item.id,
  time: sceneDatetime(item)?.toISOString(),
  collection: item.collection,
})));
