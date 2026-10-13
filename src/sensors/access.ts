import { centerOf, type AreaOfInterest } from "../geo/types.js";
import { haversineDistanceM, WGS84 } from "../science/geodesy.js";
import type { Sgp4Satellite } from "../orbit/sgp4.js";
import type {
  SensorAccessSearchOptions,
  SensorAccessWindow,
  SensorModel,
} from "./types.js";

const EARTH_RADIUS_KM = WGS84.a / 1000;

export const SENSOR_PRESETS = Object.freeze({
  sentinel2Msi: {
    name: "Sentinel-2 MSI",
    kind: "optical",
    nadirSwathWidthKm: 290,
    nominalResolutionM: 10,
  } satisfies SensorModel,
  sentinel1Iw: {
    name: "Sentinel-1 IW",
    kind: "sar",
    nadirSwathWidthKm: 250,
    nominalResolutionM: 10,
  } satisfies SensorModel,
  landsatOliTirs: {
    name: "Landsat OLI/TIRS",
    kind: "optical",
    nadirSwathWidthKm: 185,
    nominalResolutionM: 30,
  } satisfies SensorModel,
});

export function findSensorAccessWindows(
  satellite: Sgp4Satellite,
  sensor: SensorModel,
  options: SensorAccessSearchOptions,
): SensorAccessWindow[] {
  validateSensor(sensor);
  validateWindow(options.start, options.end);
  const stepSeconds = options.stepSeconds ?? 20;
  if (!(stepSeconds > 0 && stepSeconds <= 300)) throw new RangeError("stepSeconds must be in (0, 300]");
  const maxWindows = options.maxWindows ?? 100;
  const target = targetGeometry(options.area);

  let previousTime = options.start;
  let previousMargin = accessMarginKm(satellite, sensor, target, previousTime);
  let inside = previousMargin >= 0;
  let start = inside ? options.start : null;

  const windows: SensorAccessWindow[] = [];
  const endMs = options.end.getTime();
  const stepMs = stepSeconds * 1000;

  for (let ms = Math.min(options.start.getTime() + stepMs, endMs); ms <= endMs;) {
    const currentTime = new Date(ms);
    const currentMargin = accessMarginKm(satellite, sensor, target, currentTime);

    if (!inside && previousMargin < 0 && currentMargin >= 0) {
      start = refineBoundary(satellite, sensor, target, previousTime, currentTime, true);
      inside = true;
    }

    if (inside && previousMargin >= 0 && currentMargin < 0) {
      const end = refineBoundary(satellite, sensor, target, previousTime, currentTime, false);
      if (start) {
        windows.push(buildWindow(satellite, sensor, target, start, end));
        if (windows.length >= maxWindows) return windows;
      }
      start = null;
      inside = false;
    }

    if (ms === endMs) break;
    previousTime = currentTime;
    previousMargin = currentMargin;
    ms = Math.min(ms + stepMs, endMs);
  }

  if (inside && start) windows.push(buildWindow(satellite, sensor, target, start, options.end));
  return windows.slice(0, maxWindows);
}

export function offNadirGroundReachKm(altitudeKm: number, offNadirDeg: number): number {
  if (!(altitudeKm >= 0)) throw new RangeError("altitudeKm must be >= 0");
  if (!(offNadirDeg >= 0 && offNadirDeg < 90)) throw new RangeError("offNadirDeg must be in [0, 90)");
  if (offNadirDeg === 0) return 0;

  const r = EARTH_RADIUS_KM + altitudeKm;
  const beta = radians(offNadirDeg);
  const horizonBeta = Math.asin(EARTH_RADIUS_KM / r);
  if (beta >= horizonBeta) return EARTH_RADIUS_KM * Math.acos(EARTH_RADIUS_KM / r);

  let lo = 0;
  let hi = Math.acos(EARTH_RADIUS_KM / r);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const predicted = offNadirForCentralAngleRad(r, mid);
    if (predicted < beta) lo = mid;
    else hi = mid;
  }
  return EARTH_RADIUS_KM * (lo + hi) / 2;
}

export function requiredOffNadirDeg(altitudeKm: number, groundDistanceKm: number): number {
  if (!(altitudeKm >= 0)) throw new RangeError("altitudeKm must be >= 0");
  if (!(groundDistanceKm >= 0)) throw new RangeError("groundDistanceKm must be >= 0");
  const r = EARTH_RADIUS_KM + altitudeKm;
  const horizonCentralAngle = Math.acos(EARTH_RADIUS_KM / r);
  const psi = groundDistanceKm / EARTH_RADIUS_KM;
  if (psi > horizonCentralAngle) return Number.POSITIVE_INFINITY;
  return degrees(offNadirForCentralAngleRad(r, psi));
}

function buildWindow(
  satellite: Sgp4Satellite,
  sensor: SensorModel,
  target: TargetGeometry,
  start: Date,
  end: Date,
): SensorAccessWindow {
  const closest = minimizeGroundDistanceTime(satellite, target, start, end);
  const state = satellite.stateAt(closest);
  const groundDistanceKm = distanceToTargetKm(state.geodetic.latitudeDeg, state.geodetic.longitudeDeg, target);
  const offNadirReachKm = sensor.maxOffNadirDeg !== undefined
    ? offNadirGroundReachKm(state.geodetic.heightKm, sensor.maxOffNadirDeg)
    : 0;

  return {
    start,
    closest,
    end,
    durationSeconds: (end.getTime() - start.getTime()) / 1000,
    minGroundDistanceKm: groundDistanceKm,
    targetRadiusKm: target.radiusKm,
    swathHalfWidthKm: sensor.nadirSwathWidthKm / 2,
    offNadirReachKm,
    requiredOffNadirDegAtClosest: requiredOffNadirDeg(
      state.geodetic.heightKm,
      Math.max(0, groundDistanceKm - target.radiusKm),
    ),
    satelliteAltitudeKmAtClosest: state.geodetic.heightKm,
    sensor,
    geometryModel: "spherical-earth-swath",
  };
}

interface TargetGeometry {
  latitudeDeg: number;
  longitudeDeg: number;
  radiusKm: number;
}

function targetGeometry(area: AreaOfInterest): TargetGeometry {
  const [longitudeDeg, latitudeDeg] = centerOf(area);
  const [west, south, east, north] = area.bbox;
  const center = { latitudeDeg, longitudeDeg };
  const corners = [
    { latitudeDeg: south, longitudeDeg: west },
    { latitudeDeg: south, longitudeDeg: east },
    { latitudeDeg: north, longitudeDeg: west },
    { latitudeDeg: north, longitudeDeg: east },
  ];
  const radiusKm = Math.max(
    0,
    ...corners.map((corner) => haversineDistanceM(center, corner) / 1000),
  );
  return { latitudeDeg, longitudeDeg, radiusKm };
}

function accessMarginKm(
  satellite: Sgp4Satellite,
  sensor: SensorModel,
  target: TargetGeometry,
  time: Date,
): number {
  const state = satellite.stateAt(time);
  const groundDistanceKm = distanceToTargetKm(
    state.geodetic.latitudeDeg,
    state.geodetic.longitudeDeg,
    target,
  );
  const offNadirReachKm = sensor.maxOffNadirDeg !== undefined
    ? offNadirGroundReachKm(state.geodetic.heightKm, sensor.maxOffNadirDeg)
    : 0;
  const reachKm = sensor.nadirSwathWidthKm / 2 + offNadirReachKm + target.radiusKm;
  return reachKm - groundDistanceKm;
}

function distanceToTargetKm(latitudeDeg: number, longitudeDeg: number, target: TargetGeometry): number {
  return haversineDistanceM(
    { latitudeDeg, longitudeDeg },
    { latitudeDeg: target.latitudeDeg, longitudeDeg: target.longitudeDeg },
  ) / 1000;
}

function refineBoundary(
  satellite: Sgp4Satellite,
  sensor: SensorModel,
  target: TargetGeometry,
  lower: Date,
  upper: Date,
  entering: boolean,
): Date {
  let lo = lower.getTime();
  let hi = upper.getTime();
  for (let i = 0; i < 35 && hi - lo > 5; i++) {
    const mid = (lo + hi) / 2;
    const margin = accessMarginKm(satellite, sensor, target, new Date(mid));
    if (entering ? margin >= 0 : margin < 0) hi = mid;
    else lo = mid;
  }
  return new Date((lo + hi) / 2);
}

function minimizeGroundDistanceTime(
  satellite: Sgp4Satellite,
  target: TargetGeometry,
  start: Date,
  end: Date,
): Date {
  let lo = start.getTime();
  let hi = end.getTime();

  const objective = (ms: number): number => {
    const state = satellite.stateAt(new Date(ms));
    return distanceToTargetKm(state.geodetic.latitudeDeg, state.geodetic.longitudeDeg, target);
  };

  for (let i = 0; i < 45 && hi - lo > 5; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (objective(m1) < objective(m2)) hi = m2;
    else lo = m1;
  }
  return new Date((lo + hi) / 2);
}

function offNadirForCentralAngleRad(satelliteRadiusKm: number, centralAngleRad: number): number {
  return Math.atan2(
    EARTH_RADIUS_KM * Math.sin(centralAngleRad),
    satelliteRadiusKm - EARTH_RADIUS_KM * Math.cos(centralAngleRad),
  );
}

function validateSensor(sensor: SensorModel): void {
  if (!(sensor.nadirSwathWidthKm > 0)) throw new RangeError("sensor.nadirSwathWidthKm must be > 0");
  if (
    sensor.maxOffNadirDeg !== undefined &&
    !(sensor.maxOffNadirDeg >= 0 && sensor.maxOffNadirDeg < 90)
  ) {
    throw new RangeError("sensor.maxOffNadirDeg must be in [0, 90)");
  }
}

function validateWindow(start: Date, end: Date): void {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new RangeError("sensor access requires a valid start < end");
  }
}

const radians = (value: number): number => value * Math.PI / 180;
const degrees = (value: number): number => value * 180 / Math.PI;
