/**
 * Screen a bounded CelesTrak group for close approaches.
 * Use bounded object counts and explicit windows to control CPU cost.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const primary = await space.orbit.byCatalogNumber(25544);

if (primary) {
  const start = new Date();
  const events = await space.traffic.screenGroup(primary, "STATIONS", {
    start,
    end: new Date(start.getTime() + 12 * 3_600_000),
    thresholdKm: 500,
    stepSeconds: 120,
    maxObjects: 100,
    maxResults: 20,
  });

  console.table(events.map((event) => ({
    object: event.secondary.name,
    tca: event.tca.toISOString(),
    missDistanceKm: event.missDistanceKm,
    relativeSpeedKmS: event.relativeSpeedKmS,
    freshness: event.quality.freshness,
  })));
}
