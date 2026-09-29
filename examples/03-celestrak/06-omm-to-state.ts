/**
 * Convert OMM to approximate two-body state
 *
 * Convert mean elements to Keplerian elements and an approximate state vector. This is intentionally not SGP4.
 *
 * Uses: OpenLaunch, ommToOrbitalElements, ommToApproximateState
 * Network: yes
 */
import { OpenLaunch, ommToApproximateState, ommToOrbitalElements } from "../../src/index.js";

const space = new OpenLaunch();
const [iss] = await space.celestrak.byCatalogNumber(25544);
if (iss) {
  console.log(ommToOrbitalElements(iss));
  console.log(ommToApproximateState(iss));
}
