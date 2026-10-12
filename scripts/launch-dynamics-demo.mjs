import {
  OpenLaunch,
  launchGroundTrackGeoJson,
  launchToCzml,
} from "../dist/index.js";

const space=new OpenLaunch({timeoutMs:30_000});
const now=new Date("2026-10-12T12:00:00Z");
const vehicle={
  name:"OpenLaunch ILLUSTRATIVE two-stage vehicle (NOT Falcon 9)",
  payloadMassKg:2500,referenceAreaM2:10.8,dragCoefficient:0.33,
  fairingMassKg:1200,fairingJettisonAtSeconds:210,
  stages:[
    {
      name:"Illustrative booster",dryMassKg:24000,propellantMassKg:285000,
      thrustSeaLevelN:5_000_000,thrustVacuumN:5_550_000,
      ispSeaLevelS:292,ispVacuumS:322,coastAfterBurnSeconds:5,
    },
    {
      name:"Illustrative upper",dryMassKg:4300,propellantMassKg:71000,
      thrustSeaLevelN:720_000,thrustVacuumN:820_000,
      ispSeaLevelS:310,ispVacuumS:348,
    },
  ],
};
const guidance={program:[
  {tSeconds:0,elevationDeg:90,azimuthDeg:90,throttle:1},
  {tSeconds:35,elevationDeg:87,azimuthDeg:90,throttle:1},
  {tSeconds:90,elevationDeg:70,azimuthDeg:90,throttle:1},
  {tSeconds:180,elevationDeg:40,azimuthDeg:90,throttle:1},
  {tSeconds:330,elevationDeg:18,azimuthDeg:90,throttle:1},
  {tSeconds:520,elevationDeg:5,azimuthDeg:90,throttle:1},
]};

let site={latitudeDeg:28.5619,longitudeDeg:-80.5774,altitudeM:3};
let liftoff=now;
let source="illustrative demo pad + synthetic T0";

if(process.env.OPENLAUNCH_LIVE==="1"){
  const launch=await space.launches.next();
  if(!launch)throw new Error("No LL2 launch was available");
  if(launch.pad?.latitude===undefined||launch.pad?.longitude===undefined)
    throw new Error("LL2 launch missing pad coordinates");
  site={latitudeDeg:launch.pad.latitude,longitudeDeg:launch.pad.longitude,altitudeM:0};
  liftoff=launch.net;
  source=`Launch Library 2: ${launch.name} (pad/time ONLY; no ascent profile)`;
}
const simulation=space.dynamics.simulate({
  vehicle,guidance,site,liftoff,stepSeconds:2,durationSeconds:570,
  environment:{useJ2:true,windEastMps:3,windNorthMps:-2},
});
console.log("=== OpenLaunch v0.8 Launch Dynamics ===");
console.log("Launch metadata source:",source);
console.log("Trajectory provenance: illustrative vehicle/guidance inputs, not measured or authoritative.");
console.log("\nSummary:",simulation.summary);
console.log("\nEvents:");
console.table(simulation.events.map(event=>({
  tSeconds:Number(event.tSeconds.toFixed(2)),
  event:event.kind,stage:event.stageName,
  altitudeKm:Number((event.altitudeM/1000).toFixed(2)),
  massKg:Number(event.massKg.toFixed(1)),
})));
console.log("\nOutput geometry:",{
  samples:simulation.samples.length,
  czmlPackets:launchToCzml(simulation).length,
  geojsonTrackPositions:launchGroundTrackGeoJson(simulation).geometry.coordinates.length,
  frameAccuracy:simulation.frameAccuracy,
});

if(process.env.OPENLAUNCH_LIVE==="1"){
  const satellites=await space.orbit.group("ACTIVE",250);
  const events=space.traffic.screenTrajectory(simulation.toTrajectory(),satellites,500,10);
  console.log("\nExploratory satellite screening (limited ACTIVE subset):");
  console.table(events.map(event=>({
    name:event.satellite.name,
    tca:event.tca.toISOString(),
    missDistanceKm:Number(event.missDistanceKm.toFixed(2)),
    relativeSpeedKmS:Number(event.relativeSpeedKmS.toFixed(2)),
  })));
  console.log("Warning: nominal 3DOF path + limited catalog + GMST frame approximation cannot provide operational collision clearance.");
}
