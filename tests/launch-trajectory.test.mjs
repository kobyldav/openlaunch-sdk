import test from "node:test";
import assert from "node:assert/strict";
import {
  OpenLaunch, SampledTemeTrajectory, Sgp4Satellite, guidanceAt,
  initialLaunchState, launchMonteCarlo, simulateLaunch, rk4LaunchStep,
} from "../dist/index.js";

const liftoff = new Date("2019-06-05T12:00:00Z");
const line1 = "1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const line2 = "2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";

function fixture(overrides = {}) {
  return {
    liftoff,
    site: { latitudeDeg: 28.56, longitudeDeg: -80.58, altitudeM: 3 },
    durationSeconds: 120,
    stepSeconds: 0.5,
    guidance: [
      { timeSeconds: 0, pitchDeg: 90, headingDeg: 90 },
      { timeSeconds: 40, pitchDeg: 85, headingDeg: 90 },
      { timeSeconds: 110, pitchDeg: 70, headingDeg: 92, throttle: 0.85 },
    ],
    vehicle: {
      name: "Generic two-stage validation vehicle",
      payloadMassKg: 100,
      fairingMassKg: 30,
      fairingJettisonSeconds: 25,
      dragCoefficient: 0.25,
      referenceAreaM2: 2,
      stages: [
        {
          name: "Booster",
          dryMassKg: 1000,
          propellantMassKg: 5000,
          thrustSeaLevelN: 300_000,
          thrustVacuumN: 330_000,
          ispSeaLevelS: 250,
          ispVacuumS: 280,
          coastAfterSeparationSeconds: 3,
        },
        {
          name: "Upper stage",
          dryMassKg: 300,
          propellantMassKg: 1000,
          thrustSeaLevelN: 60_000,
          thrustVacuumN: 65_000,
          ispSeaLevelS: 280,
          ispVacuumS: 310,
        },
      ],
    },
    ...overrides,
  };
}

test("initial state includes Earth rotation and staged wet mass", () => {
  const model = fixture();
  const state = initialLaunchState(model);
  assert.equal(state.massKg, 7430);
  assert.ok(Math.hypot(state.velocityMps.x, state.velocityMps.y) > 350);
  assert.ok(Math.hypot(state.positionM.x, state.positionM.y, state.positionM.z) > 6_300_000);
});

test("guidance interpolation respects heading wrap and throttle", () => {
  const knots = [
    { timeSeconds: 0, pitchDeg: 90, headingDeg: 350, throttle: 1 },
    { timeSeconds: 10, pitchDeg: 50, headingDeg: 10, throttle: 0.4 },
  ];
  const mid = guidanceAt(knots, 5);
  assert.equal(mid.pitchDeg, 70);
  assert.equal(mid.headingDeg, 360);
  assert.ok(Math.abs(mid.throttle - 0.7) < 1e-12);
});

test("multi-stage RK4 launch records physical telemetry and discrete staging events", () => {
  const result=simulateLaunch(fixture());
  assert.equal(result.frame, "TEME-approx-GMST");
  assert.ok(result.telemetry.length > 100);
  assert.equal(result.trajectory.length, result.telemetry.length);
  assert.ok(result.finalMassKg < result.initialMassKg);
  assert.ok(result.maxQPa > 0);
  assert.ok(result.maxAltitudeKm > 1);
  assert.ok(result.events.some(e=>e.kind==="stage-separation"));
  assert.ok(result.events.some(e=>e.kind==="fairing-jettison"));
  assert.ok(result.events.filter(e=>e.kind==="engine-ignition").length>=2);
  assert.ok(result.events.some(e=>e.kind==="engine-cutoff"));
  assert.ok(result.events.some(e=>e.kind==="max-q"));
  assert.ok(result.telemetry.every(p=>p.massKg>0 && Number.isFinite(p.altitudeKm)));
  assert.ok(result.telemetry.every((p,i,a)=>!i || p.time>a[i-1].time));
  assert.ok(result.telemetry.every((p,i,a)=>!i || p.massKg<=a[i-1].massKg+1e-6));
  assert.ok(Math.abs(result.telemetry.at(-1).massKg-result.finalMassKg)<1e-6);
  assert.ok(result.trajectory.length===new Set(result.trajectory.map(p=>p.time.getTime())).size);
});

test("rocket engine thrust is zero after all propellant burns out", () => {
  const model=fixture({ durationSeconds: 220 });
  const result=simulateLaunch(model);
  const last=result.telemetry.at(-1);
  assert.ok(last.massKg > 0);
  assert.equal(last.thrustN, 0);
  assert.equal(last.stageIndex, null);
});

test("fixed RK4 propagator does not change mass when coasting", () => {
  const model=fixture();
  const state=initialLaunchState(model);
  const next=rk4LaunchStep(model,state,{
    stage: null,elapsedSeconds:0,engineOn:false,
  },1);
  assert.equal(next.massKg,state.massKg);
  assert.ok(Math.hypot(next.positionM.x-state.positionM.x,next.positionM.y-state.positionM.y,next.positionM.z-state.positionM.z)>100);
});

test("validation rejects unsafe or nonsensical simulation input", () => {
  const model=fixture();
  assert.throws(()=>simulateLaunch({...model,stepSeconds:0}),/stepSeconds/);
  assert.throws(()=>simulateLaunch({...model,site:{latitudeDeg:100,longitudeDeg:0}}),/latitude/);
  assert.throws(()=>simulateLaunch({...model,guidance:[{timeSeconds:0,pitchDeg:100,headingDeg:90}]}),/pitchDeg/);
  assert.throws(()=>simulateLaunch({...model,vehicle:{...model.vehicle,stages:[]}}),/stage/);
  assert.throws(()=>simulateLaunch({...model,durationSeconds:200_000}),/durationSeconds/);
});

test("simulated TEME approximation can be screened with v0.7 traffic API", () => {
  const space=new OpenLaunch();
  const rocket=space.trajectory.simulate(fixture());
  const trajectory=new SampledTemeTrajectory(rocket.trajectory);
  const mid=trajectory.stateAt(new Date(liftoff.getTime()+50_000));
  assert.ok(Number.isFinite(mid.positionTemeKm.x));

  const iss=Sgp4Satellite.fromTle(line1,line2);
  const result=space.trajectory.screenSatellites(fixture(),[iss],{thresholdKm:20000});
  assert.equal(result.screeningFrame,"TEME-approx-GMST");
  assert.ok(Array.isArray(result.approaches));
  assert.ok(result.approaches.length>0);
  assert.ok(result.approaches[0].missDistanceKm>=0);
});

test("seeded launch Monte Carlo yields deterministic uncertainty envelope", () => {
  const model=fixture({durationSeconds:45,stepSeconds:1});
  const a=launchMonteCarlo(model,{runs:8,seed:1403,pitchSigmaDeg:0.1});
  const b=launchMonteCarlo(model,{runs:8,seed:1403,pitchSigmaDeg:0.1});
  assert.equal(a.successfulRuns,8);
  assert.equal(a.failedRuns,0);
  assert.deepEqual(
    a.dispersion.map(p=>p.p95DeviationKm),
    b.dispersion.map(p=>p.p95DeviationKm),
  );
  assert.ok(a.dispersion.at(-1).maxDeviationKm>0);
  assert.ok(a.dispersion.every(p=>p.p95DeviationKm>=p.p50DeviationKm));
});
