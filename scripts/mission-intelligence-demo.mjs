import {
  OpenLaunch, bbox, point, inspectEoProduct, selectEoAssets,
  landsatC2SurfaceTemperature, summarizeSentinel2Scl,
  ObservationDiscoveryClient,
} from "../dist/index.js";

console.log("=== OpenLaunch SDK v0.9.0 | offline mission + EO intelligence ===");
console.log("No provider credentials required; EO records are synthetic for API verification.");

const fakeScene={
  type:"Feature",
  id:"DEMO_LANDSAT_SCENE",
  collection:"landsat-c2-l2",
  geometry:null,
  properties:{datetime:"2026-10-01T10:00:00Z","eo:cloud_cover":12},
  assets:{
    red:{href:"https://example.invalid/B4.tif",type:"image/tiff",roles:["data"],gsd:30,"eo:bands":[{name:"red"}]},
    ST_B10:{href:"https://example.invalid/ST_B10.tif",type:"image/tiff",roles:["data"],gsd:30},
    QA_PIXEL:{href:"https://example.invalid/QA_PIXEL.tif",roles:["data"],gsd:30},
  },
};
const product=inspectEoProduct(fakeScene);
console.log("\nRaster asset capabilities:",{
  product:product.id,
  resolutionsM:product.availableResolutionsM,
  layers:product.availableKinds,
  thermalAssetKeys:selectEoAssets(product,"thermal").map(a=>a.key),
  downloadedPixels:false,
});
console.log("Decoded thermal sample (only when real Landsat ST_B10 DN is supplied):",
  landsatC2SurfaceTemperature(44000));
console.log("Decoded synthetic Sentinel SCL:",summarizeSentinel2Scl([4,5,6,8,9,10,3,0]));

const fakeProvider={stac:{search:async search=>({
  type:"FeatureCollection",
  features:[{...fakeScene,collection:search.collections[0]}],
})}};
const discovery=new ObservationDiscoveryClient(fakeProvider,fakeProvider);
const report=await discovery.discover({
  area:bbox(12,49,13,50),
  from:new Date("2026-10-01T00:00:00Z"),
  to:new Date("2026-10-13T00:00:00Z"),
  layers:["optical","thermal","elevation"],
});
console.log("\nSample catalog discovery:",{
  statuses:report.queryStatuses.map(s=>({provider:s.provider,layer:s.layer,status:s.status})),
  layerCounts:Object.fromEntries(["optical","thermal","elevation"].map(l=>[l,report.scenes.filter(s=>s.layer===l).length])),
  catalogOnly:report.catalogOnly,
});

const sdk=new OpenLaunch();
const liftoff=new Date("2019-06-05T12:00:00Z");
const model={
  liftoff,
  site:{latitudeDeg:28.56,longitudeDeg:-80.58,altitudeM:3},
  durationSeconds:25,stepSeconds:1,
  guidance:[
    {timeSeconds:0,pitchDeg:90,headingDeg:90},
    {timeSeconds:25,pitchDeg:80,headingDeg:90},
  ],
  vehicle:{
    name:"Generic single-stage diagnostic; NOT Falcon 9",
    payloadMassKg:100,dragCoefficient:0.2,referenceAreaM2:1,
    stages:[{
      name:"stage",dryMassKg:200,propellantMassKg:300,
      thrustSeaLevelN:30000,thrustVacuumN:33000,
      ispSeaLevelS:250,ispVacuumS:280,
    }],
  },
};
const target={perigeeAltitudeKm:200,apogeeAltitudeKm:200,inclinationDeg:51.6};
const sweep=sdk.mission.sweep(model,target,{
  pitchOffsetsDeg:[-5,0,5],
  headingOffsetsDeg:[-2,0,2],
  maxCandidates:16,
});
console.log("\nMission feasibility:",{
  target,
  studied:sweep.evaluated,
  targetAchieved:sweep.achieved,
  bestScore:sweep.best.assessment.score,
  bestPerigeeAltitudeKm:sweep.best.simulation.finalOrbit?.perigeeAltitudeKm,
  bestOrbitClass:sweep.best.simulation.finalOrbit?.classification,
  nominalVacuumDeltaVMps:sdk.mission.idealDeltaV(model),
  targetCircularSpeedMps:sdk.mission.circularSpeed(200),
  warning:sweep.warning,
});

const tle1="1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const tle2="2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";
const iss=sdk.orbit.fromTle(tle1,tle2,{name:"ISS historical"});
const audit=sdk.trajectory.auditTraffic(sweep.best.simulation,[iss],{
  thresholdKm:100,maxEphemerisAgeHours:24,
});
console.log("\nCatalog screening audit:",{
  checked:audit.checked,
  skipped:audit.skipped,
  nearestKm:audit.encounters[0]?.approach.missDistanceKm,
  encounterWarnings:audit.encounters.flatMap(e=>e.warnings),
  operationalClearance:audit.operationalClearance,
});
