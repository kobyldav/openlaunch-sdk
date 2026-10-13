import { writeFileSync } from "node:fs";
import { OpenLaunch, launchToCzml } from "../dist/index.js";

const space=new OpenLaunch();
const model={
  liftoff:new Date("2019-06-05T12:00:00Z"),
  site:{name:"Illustrative Atlantic-coast pad",latitudeDeg:28.56,longitudeDeg:-80.58,altitudeM:3},
  durationSeconds:170,
  stepSeconds:1,
  guidance:[
    {timeSeconds:0,pitchDeg:90,headingDeg:90,throttle:1},
    {timeSeconds:20,pitchDeg:85,headingDeg:90,throttle:1},
    {timeSeconds:80,pitchDeg:50,headingDeg:90,throttle:1},
    {timeSeconds:170,pitchDeg:15,headingDeg:90,throttle:0.9},
  ],
  vehicle:{
    name:"Generic illustrative two-stage launch vehicle (NOT Falcon 9)",
    payloadMassKg:100,
    fairingMassKg:30,
    fairingJettisonSeconds:25,
    dragCoefficient:0.25,
    referenceAreaM2:2,
    stages:[
      {name:"Illustrative booster",dryMassKg:1000,propellantMassKg:5000,
        thrustSeaLevelN:300000,thrustVacuumN:330000,ispSeaLevelS:250,ispVacuumS:280,
        coastAfterSeparationSeconds:3},
      {name:"Illustrative upper stage",dryMassKg:300,propellantMassKg:1000,
        thrustSeaLevelN:60000,thrustVacuumN:65000,ispSeaLevelS:280,ispVacuumS:310},
    ],
  },
};

console.log("=== OpenLaunch v0.8 | generic launch-vehicle study ===");
console.log("NOT actual SpaceX launch data or a flight-qualified profile.");
const result=space.trajectory.simulate(model);
console.log("\nSummary:",{
  initialMassKg:result.initialMassKg,
  finalMassKg:result.finalMassKg,
  maxAltitudeKm:result.maxAltitudeKm,
  maxQkPa:result.maxQPa/1000,
  maxQTime:result.maxQTime.toISOString(),
  termination:result.termination,
  steps:result.trajectory.length,
  frame:result.frame,
});

console.log("\nFlight events:");
console.table(result.events.map(e=>({
  event:e.kind,tPlusSeconds:e.elapsedSeconds.toFixed(2),
  altitudeKm:e.altitudeKm.toFixed(2),massKg:e.massKg.toFixed(1),stage:e.stageIndex,
})));

console.log("\nTelemetry every 20 seconds:");
console.table(result.telemetry.filter(p=>Math.abs(p.elapsedSeconds/20-Math.round(p.elapsedSeconds/20))<0.002).map(p=>({
  t:p.elapsedSeconds,altitudeKm:p.altitudeKm.toFixed(2),
  speedMps:p.inertialSpeedMps.toFixed(0),qPa:p.dynamicPressurePa.toFixed(0),
  massKg:p.massKg.toFixed(1),
})));

const envelope=space.trajectory.monteCarlo(model,{runs:12,seed:202608,pitchSigmaDeg:0.2});
console.log("\nMonte Carlo dispersion:",{
  successfulRuns:envelope.successfulRuns,
  failedRuns:envelope.failedRuns,
  finalP95Km:envelope.dispersion.at(-1)?.p95DeviationKm,
});

const tle1="1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const tle2="2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";
const iss=space.orbit.fromTle(tle1,tle2,{name:"ISS historical 2019"});
const screen=space.trajectory.screenSatellites(model,[iss],{thresholdKm:20000});
console.log("\nHistorical ISS relative-motion screening (illustrative only):");
console.table(screen.approaches.map(e=>({
  object:e.satellite.name,tca:e.tca.toISOString(),
  missDistanceKm:e.missDistanceKm.toFixed(1),
  relativeSpeedKmS:e.relativeSpeedKmS.toFixed(2),
})));
console.log(screen.warning);

if(process.argv.includes("--czml")){
  const path="launch-demo.czml";
  writeFileSync(path,JSON.stringify(launchToCzml(result),null,2));
  console.log("\nCreated",path,"— load it in Cesium.");
}
