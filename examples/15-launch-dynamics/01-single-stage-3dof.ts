/**
 * Numerical point-mass 3DOF ascent in rotating Earth coordinates.
 * Network: no
 * The vehicle is fictional, not a published launch profile.
 */
import { OpenLaunch } from "../../src/index.js";

const sdk=new OpenLaunch();
const result=sdk.dynamics.simulate({
  site:{latitudeDeg:28.5,longitudeDeg:-80.5,altitudeM:3},
  liftoff:new Date("2026-10-12T12:00:00Z"),
  vehicle:{
    name:"Fictional single-stage demonstrator",payloadMassKg:100,
    referenceAreaM2:0.6,dragCoefficient:0.32,
    stages:[{
      name:"stage 1",dryMassKg:200,propellantMassKg:700,
      thrustSeaLevelN:35000,thrustVacuumN:40000,
      ispSeaLevelS:280,ispVacuumS:315,
    }],
  },
  guidance:{program:[
    {tSeconds:0,elevationDeg:90,azimuthDeg:90},
    {tSeconds:40,elevationDeg:80,azimuthDeg:90},
  ]},
  durationSeconds:90,stepSeconds:0.5,
});
console.log(result.summary);
console.table(result.events);
