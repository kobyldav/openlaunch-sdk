/**
 * Find the closest SGP4/SDP4 approach between two catalog objects.
 * Collision probability is intentionally not fabricated without covariance.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const [iss] = await space.orbit.byName("ISS");
const [tiangong] = await space.orbit.byName("CSS");

if (iss && tiangong) {
  const start = new Date();
  const event = space.traffic.closestApproach(iss, tiangong, {
    start,
    end: new Date(start.getTime() + 24 * 3_600_000),
    stepSeconds: 120,
  });

  console.log({
    tca: event.tca.toISOString(),
    missDistanceKm: event.missDistanceKm,
    relativeSpeedKmS: event.relativeSpeedKmS,
    rtnKm: event.rtn,
    quality: event.quality,
  });
}
