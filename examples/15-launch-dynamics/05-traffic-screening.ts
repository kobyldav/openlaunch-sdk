/**
 * Pass a fictional rocket's numerical TEME-like states into v0.7 satellite
 * screening. The GMST frame approximation is NOT operational conjunction clearance.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const sdk=new OpenLaunch();
const rocket=sdk.dynamics.simulate({
  site:{latitudeDeg:28.5,longitudeDeg:-80.5,altitudeM:3},
  liftoff:new Date(),durationSeconds:100,stepSeconds:2,
  vehicle:{name:"Illustrative",payloadMassKg:100,referenceAreaM2:0.5,dragCoefficient:0.3,
    stages:[{name:"booster",dryMassKg:200,propellantMassKg:1000,
      thrustSeaLevelN:55000,thrustVacuumN:60000,
      ispSeaLevelS:295,ispVacuumS:325}]},
  guidance:{program:[{tSeconds:0,elevationDeg:90,azimuthDeg:90},
    {tSeconds:100,elevationDeg:70,azimuthDeg:90}]},
});
const catalog=await sdk.orbit.group("STATIONS",100);
const screening=sdk.traffic.screenTrajectory(rocket.toTrajectory(),catalog,500,10);
console.table(screening.map(e=>({
  object:e.satellite.name,
  tca:e.tca.toISOString(),modeledDistanceKm:e.missDistanceKm,
})));
console.warn("Illustrative rocket trajectory, bounded catalog, approximate frame; not a safety analysis.");
