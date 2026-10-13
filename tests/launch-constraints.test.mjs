import test from "node:test";
import assert from "node:assert/strict";
import {
  limitLaunchThrottle,
  simulateLaunch,
} from "../dist/index.js";

function model(overrides={}) {
  const vehicle={
    name:"Generic qualification fixture",
    payloadMassKg:100,
    fairingMassKg:30,
    dragCoefficient:0.25,
    referenceAreaM2:2,
    stages:[
      {
        name:"Booster",dryMassKg:1000,propellantMassKg:5000,
        thrustSeaLevelN:300_000,thrustVacuumN:330_000,
        ispSeaLevelS:250,ispVacuumS:280,
        coastAfterSeparationSeconds:3,
      },
      {
        name:"Upper stage",dryMassKg:300,propellantMassKg:1000,
        thrustSeaLevelN:60_000,thrustVacuumN:65_000,
        ispSeaLevelS:280,ispVacuumS:310,
      },
    ],
    ...overrides.vehicle,
  };
  return {
    liftoff:new Date("2019-06-05T12:00:00Z"),
    site:{latitudeDeg:28.56,longitudeDeg:-80.58,altitudeM:3},
    stepSeconds:0.5,
    durationSeconds:180,
    guidance:[
      {timeSeconds:0,pitchDeg:90,headingDeg:90},
      {timeSeconds:20,pitchDeg:85,headingDeg:90},
      {timeSeconds:80,pitchDeg:50,headingDeg:90},
      {timeSeconds:180,pitchDeg:15,headingDeg:90},
    ],
    ...overrides,
    vehicle,
  };
}

test("limitLaunchThrottle applies axial thrust acceleration constraint",()=>{
  const data={
    commandedThrottle:1,
    thrustAtFullThrottleN:100_000,
    massKg:1000,
    densityKgM3:0,
    dynamicPressurePa:0,
    relativeVelocityMps:{x:0,y:0,z:0},
    radialVerticalSpeedMps:0,
    gravityAndDragAccelerationMps2:{x:0,y:0,z:0},
    thrustDirection:{x:1,y:0,z:0},
  };
  const limited=limitLaunchThrottle({...model(),flightConstraints:{maxAxialAccelerationG:2}},data);
  assert.ok(limited.effectiveThrottle>0 && limited.effectiveThrottle<0.2);
  assert.equal(limited.throttleLimiter,"axial-g");
  const raw=limitLaunchThrottle(model(),data);
  assert.equal(raw.effectiveThrottle,1);
  assert.equal(raw.throttleLimiter,"none");
});

test("max-q feedback starts throttling before the specified pressure threshold",()=>{
  const base={
    commandedThrottle:1,thrustAtFullThrottleN:100_000,massKg:1000,
    densityKgM3:0.2,dynamicPressurePa:39_000,
    relativeVelocityMps:{x:600,y:0,z:0},
    radialVerticalSpeedMps:0,
    gravityAndDragAccelerationMps2:{x:0,y:0,z:0},
    thrustDirection:{x:1,y:0,z:0},
  };
  const throttled=limitLaunchThrottle({...model(),flightConstraints:{maxDynamicPressurePa:40_000,maxQResponseSeconds:5}},base);
  assert.ok(throttled.effectiveThrottle<0.5);
  assert.equal(throttled.throttleLimiter,"max-q");
});

test("conditional fairing release only occurs after modeled altitude and pressure criteria",()=>{
  const flight=simulateLaunch(model({
    vehicle:{fairingSeparation:{earliestSeconds:20,minAltitudeKm:75,maxDynamicPressurePa:3_000}},
    durationSeconds:180,
  }));
  const event=flight.events.find(e=>e.kind==="fairing-jettison");
  assert.ok(event,"expected a fairing release after lower atmosphere transit");
  assert.ok(event.elapsedSeconds>=20);
  assert.ok(event.altitudeKm>=75);
  assert.ok(event.massBeforeKg-event.massAfterKg>=29.99);
  const atEvent=flight.telemetry.find(p=>Math.abs(p.elapsedSeconds-event.elapsedSeconds)<0.001);
  assert.ok(atEvent.dynamicPressurePa<=3_000);
});

test("unreachable fairing policy holds fairing mass and reports an explicit warning",()=>{
  const baseline=simulateLaunch(model({durationSeconds:10,vehicle:{}}));
  const held=simulateLaunch(model({
    durationSeconds:10,
    vehicle:{fairingSeparation:{earliestSeconds:0,minAltitudeKm:10_000}},
  }));
  assert.equal(held.events.filter(e=>e.kind==="fairing-jettison").length,0);
  assert.equal(held.finalMassKg,baseline.finalMassKg);
  assert.ok(held.constraintViolations.some(x=>/Fairing/.test(x)));
});

test("stage separation event audits the actual discarded dry mass",()=>{
  const flight=simulateLaunch(model({durationSeconds:180}));
  const separation=flight.events.find(e=>e.kind==="stage-separation");
  assert.ok(separation);
  assert.equal(separation.massBeforeKg-separation.massAfterKg,1000);
  assert.equal(separation.massKg,separation.massAfterKg);
  assert.ok(flight.telemetry.some(p=>p.stageIndex===1));
});

test("pressure and axial limits produce explicit sample diagnostics",()=>{
  const limited=simulateLaunch(model({
    flightConstraints:{maxDynamicPressurePa:45_000,maxAxialAccelerationG:4.5,maxQResponseSeconds:6},
    vehicle:{fairingSeparation:{earliestSeconds:30,minAltitudeKm:80,maxDynamicPressurePa:1500}},
    durationSeconds:240,
  }));
  assert.ok(limited.throttledSamples>0);
  assert.ok(limited.maxQPa>0);
  assert.ok(limited.maxQPa<45_000, "deterministic reference profile must stay below nominal Max-Q target");
  assert.ok(limited.maxAxialAccelerationG<=4.5+1e-6);
  assert.ok(limited.telemetry.some(p=>p.throttleLimiter==="max-q" || p.throttleLimiter==="both"));
  assert.ok(limited.telemetry.every(p=>p.effectiveThrottle<=p.commandedThrottle+1e-10));
  assert.ok(limited.telemetry.every(p=>p.effectiveThrottle>=0 && p.effectiveThrottle<=1));
  assert.ok(limited.maxAxialAccelerationG>0);
  assert.ok(Array.isArray(limited.constraintViolations));
  assert.ok(limited.finalOrbit);
});

test("legacy time-triggered fairing and invalid policies remain explicit",()=>{
  const fixed=simulateLaunch(model({durationSeconds:50,vehicle:{fairingJettisonSeconds:25}}));
  const event=fixed.events.find(e=>e.kind==="fairing-jettison");
  assert.ok(event);
  assert.ok(Math.abs(event.elapsedSeconds-25)<0.001);
  assert.throws(()=>simulateLaunch(model({
    vehicle:{fairingJettisonSeconds:25,fairingSeparation:{earliestSeconds:20}},
  })),/not both/);
  assert.throws(()=>simulateLaunch(model({
    flightConstraints:{maxDynamicPressurePa:-1},
  })),/maxDynamicPressurePa/);
});
