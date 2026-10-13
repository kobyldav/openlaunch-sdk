import {
  degreesToRadians,
  ecfToLookAngles,
  geodeticToEcf,
} from "satellite.js";
import { Sgp4Satellite } from "./sgp4.js";
import type {
  GroundObserver,
  LookAngleState,
  PassSearchOptions,
  PassWindow,
} from "./types.js";

interface BasicLook {
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
}

export function lookAnglesAt(
  satellite: Sgp4Satellite,
  observer: GroundObserver,
  time: Date,
  rangeRateSampleSeconds = 0.5,
): LookAngleState {
  validateObserver(observer);
  const look = basicLookAngles(satellite, observer, time);

  const observerGd = observerGeodetic(observer);
  const observerEcf = geodeticToEcf(observerGd);
  const dtMs = Math.max(0.05, rangeRateSampleSeconds) * 1000;
  const before = satellite.stateAt(new Date(time.getTime() - dtMs));
  const after = satellite.stateAt(new Date(time.getTime() + dtMs));
  const beforeRange = distance(observerEcf, before.positionEcfKm);
  const afterRange = distance(observerEcf, after.positionEcfKm);

  return {
    time: new Date(time),
    ...look,
    rangeRateKmS: (afterRange - beforeRange) / (2 * dtMs / 1000),
  };
}

export function findPasses(
  satellite: Sgp4Satellite,
  observer: GroundObserver,
  options: PassSearchOptions,
): PassWindow[] {
  validateObserver(observer);
  validateWindow(options.start, options.end);

  const minElevationDeg = options.minElevationDeg ?? 0;
  const stepSeconds = options.stepSeconds ?? 30;
  const maxPasses = options.maxPasses ?? 100;
  if (!(stepSeconds > 0 && stepSeconds <= 600)) throw new RangeError("stepSeconds must be in (0, 600]");
  if (minElevationDeg < -5 || minElevationDeg >= 90) throw new RangeError("minElevationDeg must be in [-5, 90)");
  if (!(maxPasses > 0)) return [];

  const startMs = options.start.getTime();
  const endMs = options.end.getTime();
  const stepMs = stepSeconds * 1000;
  const passes: PassWindow[] = [];

  let previousTime = options.start;
  let previousElevation = elevationAt(satellite, observer, previousTime);
  let inside = previousElevation >= minElevationDeg;
  let aos: Date | null = inside ? options.start : null;
  let clippedAtStart = inside;

  for (let ms = Math.min(startMs + stepMs, endMs); ms <= endMs;) {
    const currentTime = new Date(ms);
    const currentElevation = elevationAt(satellite, observer, currentTime);

    if (!inside && previousElevation < minElevationDeg && currentElevation >= minElevationDeg) {
      aos = refineCrossing(satellite, observer, previousTime, currentTime, minElevationDeg, true);
      clippedAtStart = false;
      inside = true;
    }

    if (inside && previousElevation >= minElevationDeg && currentElevation < minElevationDeg) {
      const los = refineCrossing(satellite, observer, previousTime, currentTime, minElevationDeg, false);
      if (aos) {
        passes.push(buildPass(satellite, observer, aos, los, clippedAtStart, false));
        if (passes.length >= maxPasses) return passes;
      }
      aos = null;
      inside = false;
      clippedAtStart = false;
    }

    if (ms === endMs) break;
    previousTime = currentTime;
    previousElevation = currentElevation;
    ms = Math.min(ms + stepMs, endMs);
  }

  if (inside && aos) {
    passes.push(buildPass(satellite, observer, aos, options.end, clippedAtStart, true));
  }

  return passes.slice(0, maxPasses);
}

export function nextPass(
  satellite: Sgp4Satellite,
  observer: GroundObserver,
  from = new Date(),
  searchHours = 48,
  minElevationDeg = 0,
): PassWindow | null {
  const passes = findPasses(satellite, observer, {
    start: from,
    end: new Date(from.getTime() + searchHours * 3_600_000),
    minElevationDeg,
    stepSeconds: 30,
    maxPasses: 1,
  });
  return passes[0] ?? null;
}

function basicLookAngles(
  satellite: Sgp4Satellite,
  observer: GroundObserver,
  time: Date,
): BasicLook {
  const state = satellite.stateAt(time);
  const look = ecfToLookAngles(observerGeodetic(observer), state.positionEcfKm);
  return {
    azimuthDeg: normalizeDegrees(toDegrees(look.azimuth)),
    elevationDeg: toDegrees(look.elevation),
    rangeKm: look.rangeSat,
  };
}

function elevationAt(
  satellite: Sgp4Satellite,
  observer: GroundObserver,
  time: Date,
): number {
  return basicLookAngles(satellite, observer, time).elevationDeg;
}

function observerGeodetic(observer: GroundObserver) {
  return {
    longitude: degreesToRadians(observer.longitudeDeg),
    latitude: degreesToRadians(observer.latitudeDeg),
    height: (observer.heightM ?? 0) / 1000,
  };
}

function buildPass(
  satellite: Sgp4Satellite,
  observer: GroundObserver,
  aos: Date,
  los: Date,
  clippedAtStart: boolean,
  clippedAtEnd: boolean,
): PassWindow {
  const tca = maximizeElevationTime(satellite, observer, aos, los);
  const aosLook = basicLookAngles(satellite, observer, aos);
  const tcaLook = basicLookAngles(satellite, observer, tca);
  const losLook = basicLookAngles(satellite, observer, los);

  return {
    aos,
    tca,
    los,
    durationSeconds: (los.getTime() - aos.getTime()) / 1000,
    maxElevationDeg: tcaLook.elevationDeg,
    minRangeKm: tcaLook.rangeKm,
    aosAzimuthDeg: aosLook.azimuthDeg,
    tcaAzimuthDeg: tcaLook.azimuthDeg,
    losAzimuthDeg: losLook.azimuthDeg,
    clippedAtStart,
    clippedAtEnd,
  };
}

function refineCrossing(
  satellite: Sgp4Satellite,
  observer: GroundObserver,
  lower: Date,
  upper: Date,
  thresholdDeg: number,
  rising: boolean,
): Date {
  let lo = lower.getTime();
  let hi = upper.getTime();

  for (let i = 0; i < 32 && hi - lo > 5; i++) {
    const mid = (lo + hi) / 2;
    const elevation = elevationAt(satellite, observer, new Date(mid));
    if (rising ? elevation >= thresholdDeg : elevation < thresholdDeg) hi = mid;
    else lo = mid;
  }
  return new Date((lo + hi) / 2);
}

function maximizeElevationTime(
  satellite: Sgp4Satellite,
  observer: GroundObserver,
  start: Date,
  end: Date,
): Date {
  let lo = start.getTime();
  let hi = end.getTime();

  for (let i = 0; i < 40 && hi - lo > 5; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const e1 = elevationAt(satellite, observer, new Date(m1));
    const e2 = elevationAt(satellite, observer, new Date(m2));
    if (e1 < e2) lo = m1;
    else hi = m2;
  }
  return new Date((lo + hi) / 2);
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function toDegrees(rad: number): number {
  return rad * 180 / Math.PI;
}

function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function validateObserver(observer: GroundObserver): void {
  if (!Number.isFinite(observer.latitudeDeg) || observer.latitudeDeg < -90 || observer.latitudeDeg > 90) {
    throw new RangeError("observer.latitudeDeg must be within [-90, 90]");
  }
  if (!Number.isFinite(observer.longitudeDeg) || observer.longitudeDeg < -180 || observer.longitudeDeg > 180) {
    throw new RangeError("observer.longitudeDeg must be within [-180, 180]");
  }
  if (observer.heightM !== undefined && !Number.isFinite(observer.heightM)) {
    throw new RangeError("observer.heightM must be finite");
  }
}

function validateWindow(start: Date, end: Date): void {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    throw new RangeError("pass search requires a valid start < end");
  }
}
