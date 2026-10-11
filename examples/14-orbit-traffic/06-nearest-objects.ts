/**
 * Find the nearest objects in a bounded CelesTrak group at one instant.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const primary = await space.orbit.byCatalogNumber(25544);
const stations = await space.orbit.group("STATIONS", 100);

if (primary) {
  const nearest = space.traffic.nearestAt(primary, stations, new Date(), 10);
  console.table(nearest.map((item) => ({
    name: item.satellite.name,
    norad: item.satellite.noradCatalogId,
    distanceKm: item.distanceKm,
    relativeSpeedKmS: item.relativeSpeedKmS,
  })));
}
