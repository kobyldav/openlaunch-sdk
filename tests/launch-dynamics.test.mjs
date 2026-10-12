import test from "node:test";
import assert from "node:assert/strict";
import {
  LaunchDynamicsEngine, OpenLaunch, Sgp4Satellite, airAtAltitude,
  ecefToTemeApprox, gravityEcefMps2, guidanceAt, launchToCzml,
  launchGroundTrackGeoJson, offNadirGroundReachKm, totalMass,
  twoBodyOrbitEstimate,
} from "../dist/index.js";

function fixture(overrides={}) {
  return {
    site:{latitudeDeg:28.5,longitudeDeg:-80.5,altitudeM:3},
    liftoff:new Date("2019-06-05T12:00:00Z"),
    vehicle:{
      name:"OpenLaunch illustrative ascent",
      payloadMassKg:50, referenceAreaM2:0.4,dragCoefficient:0.3,
      fairingMassKg:10,fairingJettisonAtSeconds:18,
      stages:[
        {
          name:"booster",dryMassKg:200,propellantMassKg:500,
          thrustVacuumN:44000,thrustSeaLevelN:40000,
          ispVacuumS:310,ispSeaLevelS:290,coastAfterBurnSeconds:3,
        },
        {
          name:"upper",dryMassKg:60,propellantMassKg:200,
          thrustVacuumN:12000,thrustSeaLevelN:11000,
          ispVacuumS:330,ispSeaLevelS:320,
        },
      ],
    },
    guidance:{program:[
      {tSeconds:0,elevationDeg:90,azimuthDeg:80},
      {tSeconds:12,elevationDeg:88,azimuthDeg:80},
      {tSeconds:40,elevationDeg:80,azimuthDeg:80},
      {tSeconds:100,elevationDeg:60,azimuthDeg:80},
    ]},
    stepSeconds:0.5,durationSeconds:95,
    ...overrides,
  };
}

test("3DOF simulator returns finite ECEF and inertial states from a rotating pad", ()=>{
  const result=new LaunchDynamicsEngine().simulate(fixture());
  assert.equal(result.model,"rotating-ecef-3dof-rk4");
  assert.equal(result.frameAccuracy,"approximate-TEME-via-GMST");
  assert.ok(result.samples.length>100);
  const first=result.samples[0];
  assert.equal(first.tSeconds,0);
  assert.equal(first.velocityEcefMps.x,0);
  assert.equal(first.velocityEcefMps.y,0);
  assert.ok(first.speedInertialMps>300&&first.speedInertialMps<500);
  assert.ok(Math.abs(first.latitudeDeg-28.5)<1e-7);
  assert.ok(Math.abs(first.longitudeDeg+80.5)<1e-7);
  assert.ok(result.samples.every(s=>Number.isFinite(s.altitudeM)&&Number.isFinite(s.massKg)&&s.massKg>0));
  assert.ok(result.samples.every(s=>Number.isFinite(s.velocityTemeKmS.x)));
  assert.equal(result.summary.initialMassKg,1020);
});

test("burnout, coast, stage separation, fairing and ignition change mass consistently",()=>{
  const result=new LaunchDynamicsEngine().simulate(fixture());
  const kinds=result.events.map(e=>e.kind);
  assert.ok(kinds.includes("stage-burnout"));
  assert.ok(kinds.includes("stage-separation"));
  assert.ok(kinds.includes("fairing-jettison"));
  assert.ok(kinds.includes("stage-ignition"));
  const burn=result.events.find(e=>e.kind==="stage-burnout");
  const sep=result.events.find(e=>e.kind==="stage-separation");
  assert.ok(sep.tSeconds>=burn.tSeconds+2.99);
  assert.ok(result.summary.finalMassKg<result.summary.initialMassKg);
  assert.ok(result.samples.every(s=>s.propellantRemainingKg>=0));
  assert.ok(result.samples.every((s,i,arr)=>i===0||s.massKg<=arr[i-1].massKg+1e-6));
  assert.equal(result.summary.terminatedBy,"duration");
});

test("fairing is optional, and a one-stage rocket coasts safely after depletion",()=>{
  const base=fixture();
  const vehicle={...base.vehicle,fairingMassKg:undefined,fairingJettisonAtSeconds:undefined,stages:[base.vehicle.stages[0]]};
  const r=new LaunchDynamicsEngine().simulate({...base,vehicle,durationSeconds:65});
  assert.ok(r.events.some(e=>e.kind==="stage-burnout"));
  assert.ok(!r.events.some(e=>e.kind==="stage-separation"));
  assert.ok(!r.events.some(e=>e.kind==="fairing-jettison"));
  assert.ok(r.samples.some(s=>s.flightMode==="complete"));
});

test("smaller RK4 integration step converges towards larger-step solution",()=>{
  const engine=new LaunchDynamicsEngine();
  const base=fixture({durationSeconds:20});
  const coarse=engine.simulate({...base,stepSeconds:1});
  const fine=engine.simulate({...base,stepSeconds:0.25});
  const a=coarse.samples.at(-1).positionEcefM;
  const b=fine.samples.at(-1).positionEcefM;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<25);
});

test("atmosphere and gravity helpers have meaningful physical boundaries",()=>{
  const sea=airAtAltitude(0);
  const high=airAtAltitude(130_000);
  assert.ok(sea.densityKgM3>1&&sea.densityKgM3<1.4);
  assert.ok(high.densityKgM3>=0&&high.densityKgM3<sea.densityKgM3*1e-5);
  const g=gravityEcefMps2([6378137,0,0]);
  assert.ok(g[0]<-9&&g[0]>-10);
  assert.ok(Math.abs(g[1])<1e-12);
  assert.ok(offNadirGroundReachKm(550,25)>0);
});

test("ENU control program interpolates pitch, throttle and wrap-around azimuth",()=>{
  const guidance={program:[
    {tSeconds:0,elevationDeg:90,azimuthDeg:350,throttle:0.5},
    {tSeconds:10,elevationDeg:30,azimuthDeg:10,throttle:1},
  ]};
  const at=guidanceAt(guidance,5);
  assert.ok(Math.abs(at.elevationDeg-60)<1e-12);
  assert.ok(Math.abs(at.azimuthDeg)<1e-12||Math.abs(at.azimuthDeg-360)<1e-12);
  assert.ok(Math.abs(at.throttle-0.75)<1e-12);
});

test("trajectory can be consumed by v0.7 space traffic and exported to Cesium CZML",()=>{
  const result=new OpenLaunch().dynamics.simulate(fixture({durationSeconds:25}));
  const trajectory=result.toTrajectory();
  assert.ok(trajectory.points.length>2);
  const iss=Sgp4Satellite.fromTle(
    "1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992",
    "2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442",
  );
  const encounters=new OpenLaunch().traffic.screenTrajectory(trajectory,[iss],100000);
  assert.equal(encounters.length,1);
  assert.ok(Number.isFinite(encounters[0].missDistanceKm));
  const czml=launchToCzml(result);
  assert.equal(czml[0].id,"document");
  assert.equal(czml[1].position.referenceFrame,"FIXED");
  const geojson=launchGroundTrackGeoJson(result);
  assert.equal(geojson.geometry.type,"LineString");
  assert.equal(geojson.geometry.coordinates.length,result.samples.length);
});

test("LL2 adapter strictly requires numeric pad coordinates and explicit vehicle",()=>{
  const engine=new LaunchDynamicsEngine();
  const base=fixture({durationSeconds:20});
  const launch={name:"Example",net:base.liftoff,pad:{
    latitude:28.5,longitude:-80.5
  }};
  const result=engine.fromLaunch({
    launch,vehicle:base.vehicle,guidance:base.guidance,durationSeconds:20,stepSeconds:1,
  });
  assert.equal(result.start.getTime(),base.liftoff.getTime());
  assert.throws(()=>engine.fromLaunch({
    launch:{...launch,pad:undefined},
    vehicle:base.vehicle,guidance:base.guidance,durationSeconds:20,
  }),/pad coordinates/i);
});

test("validation rejects incomplete or nonphysical vehicle, time and guidance inputs",()=>{
  const engine=new LaunchDynamicsEngine();
  assert.throws(()=>engine.simulate({...fixture(),stepSeconds:0}),/stepSeconds/);
  assert.throws(()=>engine.simulate({...fixture(),guidance:{program:[{
    tSeconds:1,elevationDeg:90,azimuthDeg:90,
  }]}}),/T\+0/);
  assert.throws(()=>engine.simulate({...fixture(),vehicle:{
    ...fixture().vehicle,stages:[{
      ...fixture().vehicle.stages[0],propellantMassKg:-1,
    }],
  }}),/Invalid stage/);
});

test("mass helper uses remaining propellant in active stage and full upper stages",()=>{
  const v=fixture().vehicle;
  assert.equal(totalMass(v,0,500,true),1020);
  assert.equal(totalMass(v,0,0,true),520);
  assert.equal(totalMass(v,1,200,false),310);
});
