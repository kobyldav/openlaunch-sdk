/**
 * Query Landsat Collection 2 Level-2 through Microsoft Planetary Computer STAC.
 * Uses: OpenLaunch, bbox, earth.searchLandsatHistory
 * Network: yes
 */
import { OpenLaunch, bbox, sceneCloudCover, sceneDatetime } from "../../src/index.js";

const space = new OpenLaunch();
const area = bbox(4.0, 51.8, 4.35, 52.05);
const history = await space.earth.searchLandsatHistory(
  area,
  "1990-01-01T00:00:00Z",
  "2026-10-11T23:59:59Z",
  25,
);

console.table(history.features.map((item) => ({
  id: item.id,
  time: sceneDatetime(item)?.toISOString(),
  cloud: sceneCloudCover(item),
})));
