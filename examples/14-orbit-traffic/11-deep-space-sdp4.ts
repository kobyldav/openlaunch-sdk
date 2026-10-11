/**
 * Fetch a geosynchronous object and let the propagator choose deep-space mode.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const geo = await space.orbit.group("GEO", 1);
const satellite = geo[0];

if (satellite) {
  const state = satellite.stateAt(new Date());
  console.log({
    name: satellite.sourceInfo.name,
    method: state.propagationMethod,
    altitudeKm: state.geodetic.heightKm,
    longitudeDeg: state.geodetic.longitudeDeg,
  });
}
