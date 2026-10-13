import { writeFileSync } from "node:fs";
import { OpenLaunch, launchToCzml } from "../dist/index.js";

const space=new OpenLaunch();
const model={
  liftoff:new Date("2019-06-05T12:00:00Z"),
  site:{name:"Illustrative Atlantic-coast pad",latitudeDeg:28.56,longitudeDeg:-80.58,altitudeM:3},
  durationSeconds:240,
  stepSeconds:0.5,
  flightConstraints:{maxDynamicPressurePa:45_000,maxAxialAccelerationG:4.5,maxQResponseSeconds:6},
  guidance:[
    {timeSeconds:0,pitchDeg:90,headingDeg:90,throttle:1},
    {timeSeconds:20,pitchDeg:85,headingDeg:90,throttle:1},
    {timeSeconds:80,pitchDeg:50,headingDeg:90,throttle:1},
    {timeSeconds:170,pitchDeg:15,headingDeg:90,throttle:0.9},
    {timeSeconds:240,pitchDeg:10,headingDeg:90,throttle:0.9},
  ],
  vehicle:{
    name:"Generic illustrative two-stage launch vehicle (NOT Falcon 9)",
    payloadMassKg:100,
    fairingMassKg:30,
    fairingSeparation:{earliestSeconds:30,minAltitudeKm:80,maxDynamicPressurePa:1500},
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

console.log("=== OpenLaunch v0.8.1 | constrained generic launch study ===");
console.log("NOT actual SpaceX launch data or a flight-qualified profile.");
const result=space.trajectory.simulate(model);
console.log("\nSummary:",{
  initialMassKg:result.initialMassKg,
  finalMassKg:result.finalMassKg,
  maxAltitudeKm:result.maxAltitudeKm,
  maxQkPa:result.maxQPa/1000,
  requestedMaxQkPa:model.flightConstraints.maxDynamicPressurePa/1000,
  maxAxialAccelerationG:result.maxAxialAccelerationG,
  throttledSamples:result.throttledSamples,
  constraintViolations:result.constraintViolations,
  maxQTime:result.maxQTime.toISOString(),
  termination:result.termination,
  steps:result.trajectory.length,
  frame:result.frame,
  finalOrbit:result.finalOrbit ? {
    classification:result.finalOrbit.classification,
    perigeeAltitudeKm:result.finalOrbit.perigeeAltitudeKm,
    apogeeAltitudeKm:result.finalOrbit.apogeeAltitudeKm,
    eccentricity:result.finalOrbit.eccentricity,
    periodMinutes:result.finalOrbit.periodMinutes,
  } : null,
});

console.log("\nReminder: initial inertial speed includes Earth rotation; air-relative speed starts near 0.\n");
console.log("Flight events:");
console.table(result.events.map(e=>({
  event:e.kind,tPlusSeconds:e.elapsedSeconds.toFixed(2),
  altitudeKm:e.altitudeKm.toFixed(2),massKg:e.massKg.toFixed(1),stage:e.stageIndex,
  releasedMassKg:e.massBeforeKg !== undefined ? (e.massBeforeKg-e.massAfterKg).toFixed(1) : "-",
})));

console.log("\nTelemetry near every 20 seconds:");
const checkpoints = Array.from({length:Math.ceil(result.totalSimulatedSeconds/20)+1},(_,i)=>Math.min(i*20,result.totalSimulatedSeconds));
console.table(checkpoints.map(t=>{
  const p=result.telemetry.reduce((best,item)=>
    Math.abs(item.elapsedSeconds-t) < Math.abs(best.elapsedSeconds-t) ? item : best,
  );
  return {
    requestedT:t,actualT:p.elapsedSeconds.toFixed(2),
    altitudeKm:p.altitudeKm.toFixed(2),
    inertialMps:p.inertialSpeedMps.toFixed(0),
    airRelativeMps:p.atmosphericRelativeSpeedMps.toFixed(0),
    qPa:p.dynamicPressurePa.toFixed(0),
    massKg:p.massKg.toFixed(1),
    throttle:p.effectiveThrottle.toFixed(2),
    limiter:p.throttleLimiter,
  };
}));

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
