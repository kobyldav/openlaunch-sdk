import test from "node:test";
import assert from "node:assert/strict";
import {
  OrbitScenario,
  SampledTemeTrajectory,
  SENSOR_PRESETS,
  Sgp4Satellite,
  bbox,
  closestApproach,
  closestApproachTrajectoryToSatellite,
  findPasses,
  findSensorAccessWindows,
  offNadirGroundReachKm,
  requiredOffNadirDeg,
  satelliteToCzml,
} from "../dist/index.js";

const ISS_LINE1 = "1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const ISS_LINE2 = "2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";

const NEARBY_LINE1 = "1 25545U 98067B   19156.50900463  .00003075  00000-0  59442-4 0  9991";
const NEARBY_LINE2 = "2 25545  51.6433  59.2583 0008217  16.4489 347.7017 15.51174618173443";

test("SGP4 propagates a TLE into plausible LEO state and geodetic coordinates", () => {
  const sat = Sgp4Satellite.fromTle(ISS_LINE1, ISS_LINE2, { name: "ISS test" });
  const state = sat.stateAt(new Date("2019-06-05T12:30:00Z"));

  const radius = Math.hypot(state.positionTemeKm.x, state.positionTemeKm.y, state.positionTemeKm.z);
  const speed = Math.hypot(state.velocityTemeKmS.x, state.velocityTemeKmS.y, state.velocityTemeKmS.z);

  assert.ok(radius > 6500 && radius < 7000);
  assert.ok(speed > 7 && speed < 8.5);
  assert.ok(state.geodetic.heightKm > 250 && state.geodetic.heightKm < 600);
  assert.ok(state.geodetic.latitudeDeg >= -90 && state.geodetic.latitudeDeg <= 90);
  assert.ok(state.geodetic.longitudeDeg >= -180 && state.geodetic.longitudeDeg <= 180);
  assert.equal(state.propagationMethod, "SGP4-near-earth");
});

test("OMM input initializes the same SGP4/SDP4 path", () => {
  const sat = Sgp4Satellite.fromOmm({
    OBJECT_NAME: "HELIOS 2A",
    OBJECT_ID: "2004-049A",
    EPOCH: "2025-03-26T05:19:34.116960",
    MEAN_MOTION: 15.00555103,
    ECCENTRICITY: 0.000583,
    INCLINATION: 98.3164,
    RA_OF_ASC_NODE: 103.8411,
    ARG_OF_PERICENTER: 20.5667,
    MEAN_ANOMALY: 339.5789,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: "U",
    NORAD_CAT_ID: 28492,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 8655,
    BSTAR: 0.00048021,
    MEAN_MOTION_DOT: 0.00005995,
    MEAN_MOTION_DDOT: 0,
  });

  const state = sat.stateAt(new Date("2025-03-26T06:00:00Z"));
  assert.ok(Number.isFinite(state.geodetic.heightKm));
  assert.equal(sat.sourceInfo.noradCatalogId, 28492);
  assert.equal(sat.sourceInfo.source, "OMM");
});

test("ground pass search refines AOS/TCA/LOS for a real inclination geometry", () => {
  const sat = Sgp4Satellite.fromTle(ISS_LINE1, ISS_LINE2);
  const observer = { latitudeDeg: 50.0755, longitudeDeg: 14.4378, heightM: 250 };
  const passes = findPasses(sat, observer, {
    start: new Date("2019-06-05T00:00:00Z"),
    end: new Date("2019-06-07T00:00:00Z"),
    minElevationDeg: 5,
    stepSeconds: 60,
  });

  assert.ok(passes.length > 0);
  for (const pass of passes) {
    assert.ok(pass.aos < pass.tca && pass.tca < pass.los);
    assert.ok(pass.maxElevationDeg >= 5);
    assert.ok(pass.durationSeconds > 0);
    assert.ok(pass.minRangeKm > 0);
  }
});

test("closest approach refines a near-coorbital encounter and exposes RTN geometry", () => {
  const a = Sgp4Satellite.fromTle(ISS_LINE1, ISS_LINE2, { noradCatalogId: 25544 });
  const b = Sgp4Satellite.fromTle(NEARBY_LINE1, NEARBY_LINE2, { noradCatalogId: 25545 });
  const event = closestApproach(a, b, {
    start: new Date("2019-06-05T12:00:00Z"),
    end: new Date("2019-06-05T14:00:00Z"),
    stepSeconds: 60,
  });

  assert.ok(event.missDistanceKm > 0 && event.missDistanceKm < 100);
  assert.ok(event.relativeSpeedKmS >= 0);
  assert.equal(event.quality.model, "SGP4/SDP4");
  assert.equal(event.quality.collisionProbabilityAvailable, false);

  const rtnNorm = Math.hypot(event.rtn.radialKm, event.rtn.alongTrackKm, event.rtn.crossTrackKm);
  assert.ok(Math.abs(rtnNorm - event.missDistanceKm) < 1e-6);
});

test("sensor access geometry supports swath and off-nadir reach without claiming tasking", () => {
  assert.ok(offNadirGroundReachKm(500, 30) > 0);
  assert.ok(requiredOffNadirDeg(500, 100) > 0);

  const sat = Sgp4Satellite.fromTle(ISS_LINE1, ISS_LINE2);
  const windows = findSensorAccessWindows(
    sat,
    { name: "wide test sensor", kind: "optical", nadirSwathWidthKm: 5000 },
    {
      area: bbox(13.9, 49.8, 14.9, 50.4),
      start: new Date("2019-06-05T00:00:00Z"),
      end: new Date("2019-06-07T00:00:00Z"),
      stepSeconds: 60,
    },
  );

  assert.ok(windows.length > 0);
  assert.equal(windows[0].geometryModel, "spherical-earth-swath");
  assert.ok(windows[0].minGroundDistanceKm >= 0);
});

test("CZML and scenario export produce time-tagged Earth-fixed paths", () => {
  const sat = Sgp4Satellite.fromTle(ISS_LINE1, ISS_LINE2, { name: "ISS" });
  const start = new Date("2019-06-05T12:00:00Z");
  const end = new Date("2019-06-05T12:10:00Z");

  const czml = satelliteToCzml(sat, { start, end, stepSeconds: 60 });
  assert.equal(czml[0].id, "document");
  assert.equal(czml.length, 2);

  const scenario = new OrbitScenario(start, end).addSatellite("iss", sat, "ISS");
  const snapshot = scenario.snapshot(new Date("2019-06-05T12:05:00Z"));
  assert.equal(snapshot.length, 1);
  assert.equal(scenario.toCzml(60).length, 2);
});

test("nominal public sensor presets remain explicit metadata, not acquisition guarantees", () => {
  assert.equal(SENSOR_PRESETS.sentinel2Msi.kind, "optical");
  assert.equal(SENSOR_PRESETS.sentinel1Iw.kind, "sar");
  assert.ok(SENSOR_PRESETS.sentinel2Msi.nadirSwathWidthKm > 0);
});


test("sampled TEME trajectory can be screened against an SGP4 satellite", () => {
  const sat = Sgp4Satellite.fromTle(ISS_LINE1, ISS_LINE2);
  const times = [
    new Date("2019-06-05T12:00:00Z"),
    new Date("2019-06-05T12:05:00Z"),
    new Date("2019-06-05T12:10:00Z"),
  ];
  const trajectory = new SampledTemeTrajectory(times.map((time) => {
    const state = sat.stateAt(time);
    return {
      time,
      positionTemeKm: state.positionTemeKm,
      velocityTemeKmS: state.velocityTemeKmS,
    };
  }));

  const interpolated = trajectory.stateAt(new Date("2019-06-05T12:02:30Z"));
  assert.ok(Number.isFinite(interpolated.positionTemeKm.x));

  const event = closestApproachTrajectoryToSatellite(trajectory, sat);
  assert.ok(event.missDistanceKm < 1);
  assert.equal(event.interpolation, "cubic-hermite");
});
