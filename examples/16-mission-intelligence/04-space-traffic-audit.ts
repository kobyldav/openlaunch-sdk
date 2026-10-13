import { OpenLaunch } from "../../src/index.js";
import { genericLaunchModel } from "../15-launch-trajectory/00-model.js";

// NETWORK: no. Historical 2019 TLE and matching generic 2019 simulation.
const line1="1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const line2="2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";
const space=new OpenLaunch();
const flight=space.trajectory.simulate(genericLaunchModel);
const iss=space.orbit.fromTle(line1,line2,{name:"ISS historical 2019"});
const audit=space.trajectory.auditTraffic(flight,[iss],{
  thresholdKm:25,maxEphemerisAgeHours:72,
});
console.log({
  modeledNearest:audit.encounters[0]?.approach.missDistanceKm,
  warnings:audit.encounters.flatMap(e=>e.warnings),
  skipped:audit.skipped,operationalClearance:audit.operationalClearance,
});
