/**
 * Sign Planetary Computer Azure assets before downloading them.
 * Uses: OpenLaunch, PLANETARY_COMPUTER_COLLECTIONS
 * Network: yes
 */
import { OpenLaunch, PLANETARY_COMPUTER_COLLECTIONS, bbox } from "../../src/index.js";

const space = new OpenLaunch();
const results = await space.planetaryComputer.stac.search({
  collections: [PLANETARY_COMPUTER_COLLECTIONS.landsatC2L2],
  bbox: bbox(4.0, 51.8, 4.35, 52.05).bbox,
  datetime: "2026-09-01T00:00:00Z/2026-10-11T23:59:59Z",
  limit: 1,
});

const item = results.features[0];
if (item) {
  const signed = await space.planetaryComputer.signItem(item);
  console.log(Object.fromEntries(Object.entries(signed.assets).map(([name, asset]) => [name, asset.href])));
}
