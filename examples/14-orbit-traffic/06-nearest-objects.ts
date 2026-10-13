/**
 * Find nearest resolved orbit states and distinguish shared/indistinguishable
 * catalog GP element sets, as can happen for attached ISS objects.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const primary = await space.orbit.byCatalogNumber(25544);
const stations = await space.orbit.group("STATIONS", 100);

if (primary) {
  const now = new Date();
  const all = space.traffic.nearestAt(primary, stations, now, stations.length);
  const unresolved = all.filter((item) => item.separation === "indistinguishable-ephemeris");
  const nearestResolved = all.filter((item) => item.separation === "resolved").slice(0, 10);

  console.table(nearestResolved.map((item) => ({
    name: item.satellite.name,
    norad: item.satellite.noradCatalogId,
    modeledDistanceKm: item.distanceKm,
    relativeSpeedKmS: item.relativeSpeedKmS,
  })));
  console.log("GP states indistinguishable from primary:", unresolved.length);
  console.log("A 0 km GP-state separation does NOT prove a physical clearance of zero.");
  console.table(unresolved.map((item) => ({
    name: item.satellite.name,
    norad: item.satellite.noradCatalogId,
    reason: item.separation,
  })));

  // Alternative: ask the SDK to exclude unresolved catalog states directly.
  console.log("Resolved-only nearest:", space.traffic.nearestAt(
    primary, stations, now, 10, { includeIndistinguishable: false },
  ).length);
}
