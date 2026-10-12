/**
 * Two-body osculating orbit estimate from a numerical end state. A perigee
 * below Earth's surface marks an incomplete/suborbital ascent.
 * Network: no
 */
import {
  LaunchDynamicsEngine,
} from "../../src/index.js";

const engine=new LaunchDynamicsEngine();
const result=engine.simulate({
  site:{latitudeDeg:5,longitudeDeg:-52,altitudeM:10},
  liftoff:new Date("2026-10-12T12:00:00Z"),
  vehicle:{name:"Suborbital test",payloadMassKg:50,referenceAreaM2:0.3,dragCoefficient:0.2,
    stages:[{name:"stage",dryMassKg:100,propellantMassKg:600,
      thrustSeaLevelN:30000,thrustVacuumN:35000,
      ispSeaLevelS:260,ispVacuumS:290}]},
  guidance:{program:[{tSeconds:0,elevationDeg:90,azimuthDeg:90}]},
  durationSeconds:100,stepSeconds:1,
});
console.log(result.summary.finalOrbit);
console.log({orbitalInsertionConfirmed:false});
