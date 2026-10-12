/**
 * Export a 3DOF ascent to Cesium CZML and GeoJSON ground track.
 * Network: no
 */
import {
  LaunchDynamicsEngine, launchToCzml, launchGroundTrackGeoJson,
} from "../../src/index.js";

const simulation=new LaunchDynamicsEngine().simulate({
  site:{latitudeDeg:28.5,longitudeDeg:-80.5,altitudeM:3},
  liftoff:new Date("2026-10-12T12:00:00Z"),
  vehicle:{name:"Illustrative",payloadMassKg:100,referenceAreaM2:0.5,dragCoefficient:0.3,
    stages:[{name:"booster",dryMassKg:200,propellantMassKg:500,
      thrustSeaLevelN:35000,thrustVacuumN:39000,
      ispSeaLevelS:285,ispVacuumS:315}]},
  guidance:{program:[{tSeconds:0,elevationDeg:90,azimuthDeg:90}]},
  durationSeconds:45,stepSeconds:1,
});
console.log(JSON.stringify(launchToCzml(simulation),null,2));
console.log(JSON.stringify(launchGroundTrackGeoJson(simulation),null,2));
