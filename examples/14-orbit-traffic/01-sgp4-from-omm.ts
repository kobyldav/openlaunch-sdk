/**
 * Propagate a live CelesTrak OMM record with SGP4/SDP4.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const satellite = await space.orbit.byCatalogNumber(25544);

if (satellite) {
  const state = satellite.stateAt(new Date());
  console.log({
    name: satellite.sourceInfo.name,
    norad: satellite.sourceInfo.noradCatalogId,
    elementEpoch: satellite.sourceInfo.epoch,
    elementAgeHours: state.sourceAgeHours,
    propagation: state.propagationMethod,
    latitudeDeg: state.geodetic.latitudeDeg,
    longitudeDeg: state.geodetic.longitudeDeg,
    altitudeKm: state.geodetic.heightKm,
    positionTemeKm: state.positionTemeKm,
    velocityTemeKmS: state.velocityTemeKmS,
  });
}
