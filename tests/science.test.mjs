import test from "node:test";
import assert from "node:assert/strict";
import {
  BODIES, convert, orbitalPeriod, circularVelocity, hohmannTransfer, earthMarsHohmann,
  rocketEquationDeltaV, geodeticToEcef, ecefToGeodetic, isa1976, freeSpacePathLossDb,
  quatFromAxisAngle, quatRotateVector, stateToOrbitalElements, orbitalElementsToState,
  marsMissionReference, consumablesForMission, LinearKalmanFilter, identity
} from "../dist/index.js";

const approx = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} !~= ${expected}`);

test("unit engine supports affine and linear conversions", () => {
  approx(convert(1, "km", "m"), 1000, 1e-12);
  approx(convert(0, "C", "K"), 273.15, 1e-12);
  approx(convert(32, "F", "C"), 0, 1e-9);
});

test("orbital mechanics returns sane LEO values", () => {
  const r = BODIES.earth.radius + 400_000;
  approx(circularVelocity(r), 7668.6, 10);
  approx(orbitalPeriod(r), 5553, 20);
  const transfer = hohmannTransfer(r, BODIES.earth.radius + 800_000, BODIES.earth.mu);
  assert.ok(transfer.totalDeltaVMps > 0 && transfer.transferTimeSeconds > 0);
});

test("state vector round trip preserves orbit approximately", () => {
  const source = { semiMajorAxisM: BODIES.earth.radius + 700_000, eccentricity: 0.01, inclinationRad: 0.7, raanRad: 1.1, argumentOfPeriapsisRad: 0.3, trueAnomalyRad: 2.0 };
  const state = orbitalElementsToState(source);
  const recovered = stateToOrbitalElements(state);
  approx(recovered.semiMajorAxisM, source.semiMajorAxisM, 0.1);
  approx(recovered.eccentricity, source.eccentricity, 1e-9);
  approx(recovered.inclinationRad, source.inclinationRad, 1e-9);
});

test("Earth-Mars reference produces plausible Hohmann transfer", () => {
  const transfer = earthMarsHohmann();
  assert.ok(transfer.transferTimeDays > 200 && transfer.transferTimeDays < 300);
  assert.ok(transfer.synodicPeriodDays > 700 && transfer.synodicPeriodDays < 900);
  const mission = marsMissionReference();
  assert.ok(mission.transMarsInjectionDeltaVMps > 3000);
});

test("geodesy ECEF round trip", () => {
  const geo = { latitudeDeg: 50.0, longitudeDeg: 14.0, altitudeM: 350 };
  const back = ecefToGeodetic(geodeticToEcef(geo));
  approx(back.latitudeDeg, geo.latitudeDeg, 1e-7);
  approx(back.longitudeDeg, geo.longitudeDeg, 1e-7);
  approx(back.altitudeM, geo.altitudeM, 0.01);
});

test("atmosphere sea level is close to ISA", () => {
  const a = isa1976(0);
  approx(a.temperatureK, 288.15, 1e-9);
  approx(a.pressurePa, 101325, 1e-6);
  assert.ok(a.densityKgM3 > 1.2 && a.densityKgM3 < 1.3);
});

test("communications FSPL increases with distance", () => {
  assert.ok(freeSpacePathLossDb(1_000_000, 8.4e9) > freeSpacePathLossDb(100_000, 8.4e9));
});

test("quaternion rotates vector", () => {
  const q = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
  const v = quatRotateVector(q, [1, 0, 0]);
  approx(v[0], 0, 1e-12); approx(v[1], 1, 1e-12);
});

test("rocket equation and life support", () => {
  assert.ok(rocketEquationDeltaV(1000, 500, 350) > 2000);
  const c = consumablesForMission(4, 100);
  assert.ok(c.totalKg > 0 && c.waterKg > c.oxygenKg);
});

test("linear Kalman filter runs predict/update", () => {
  const kf = new LinearKalmanFilter([0, 1], identity(2));
  kf.predict([[1,1],[0,1]], [[0.01,0],[0,0.01]]);
  const state = kf.update([1.2], [[1,0]], [[0.1]]);
  assert.equal(state.x.length, 2);
  assert.ok(Number.isFinite(state.x[0]));
});

test("Lambert solver finds a finite quarter-orbit transfer", async () => {
  const { solveLambertUniversal, norm3 } = await import("../dist/index.js");
  const r = BODIES.earth.radius + 400_000;
  const period = orbitalPeriod(r);
  const solution = solveLambertUniversal([r,0,0], [0,r,0], period / 4, BODIES.earth.mu);
  assert.ok(Number.isFinite(norm3(solution.departureVelocityMps)));
  approx(norm3(solution.departureVelocityMps), circularVelocity(r), 20);
});
