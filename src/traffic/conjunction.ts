import { Sgp4Satellite } from "../orbit/sgp4.js";
import type { CartesianKm } from "../orbit/types.js";
import type {
  CloseApproachSearchOptions,
  ClosestApproach,
  ClosestApproachOptions,
  ConjunctionQuality,
  RtnSeparation,
} from "./types.js";

interface Sample {
  timeMs: number;
  distanceSqKm2: number;
}

export function closestApproach(
  primary: Sgp4Satellite,
  secondary: Sgp4Satellite,
  options: ClosestApproachOptions,
): ClosestApproach {
  validateOptions(options);
  const stepSeconds = options.stepSeconds ?? 60;
  const samples = sampleDistances(primary, secondary, options, stepSeconds);
  let bestIndex = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i]!.distanceSqKm2 < samples[bestIndex]!.distanceSqKm2) bestIndex = i;
  }

  const best = samples[bestIndex]!;
  const lo = samples[Math.max(0, bestIndex - 1)]!.timeMs;
  const hi = samples[Math.min(samples.length - 1, bestIndex + 1)]!.timeMs;
  const toleranceMs = options.refinementToleranceMs ?? 1;
  const refinedMs = hi > lo
    ? goldenSectionMinimum(
        (timeMs) => distanceSqAt(primary, secondary, timeMs),
        lo,
        hi,
        toleranceMs,
      )
    : best.timeMs;

  return buildApproach(primary, secondary, refinedMs, stepSeconds, hi > lo);
}

export function findCloseApproaches(
  primary: Sgp4Satellite,
  secondary: Sgp4Satellite,
  options: CloseApproachSearchOptions,
): ClosestApproach[] {
  validateOptions(options);
  if (!(options.thresholdKm > 0)) throw new RangeError("thresholdKm must be > 0");
  const stepSeconds = options.stepSeconds ?? 60;
  const samples = sampleDistances(primary, secondary, options, stepSeconds);
  const thresholdSq = options.thresholdKm ** 2;
  const events: ClosestApproach[] = [];

  for (let i = 0; i < samples.length; i++) {
    const current = samples[i]!;
    const previous = samples[i - 1];
    const next = samples[i + 1];
    const localMinimum =
      (!previous || current.distanceSqKm2 <= previous.distanceSqKm2) &&
      (!next || current.distanceSqKm2 <= next.distanceSqKm2);

    if (!localMinimum) continue;

    const lo = previous?.timeMs ?? current.timeMs;
    const hi = next?.timeMs ?? current.timeMs;
    const refinedMs = hi > lo
      ? goldenSectionMinimum(
          (timeMs) => distanceSqAt(primary, secondary, timeMs),
          lo,
          hi,
          options.refinementToleranceMs ?? 1,
        )
      : current.timeMs;

    const approach = buildApproach(primary, secondary, refinedMs, stepSeconds, hi > lo);
    if (approach.missDistanceKm > options.thresholdKm) continue;

    const duplicate = events.some(
      (event) => Math.abs(event.tca.getTime() - approach.tca.getTime()) < stepSeconds * 500,
    );
    if (!duplicate) events.push(approach);
  }

  return events
    .sort((a, b) => a.tca.getTime() - b.tca.getTime())
    .slice(0, options.maxEvents ?? 100);
}

function sampleDistances(
  primary: Sgp4Satellite,
  secondary: Sgp4Satellite,
  options: ClosestApproachOptions,
  stepSeconds: number,
): Sample[] {
  const startMs = options.start.getTime();
  const endMs = options.end.getTime();
  const stepMs = stepSeconds * 1000;
  const estimated = Math.floor((endMs - startMs) / stepMs) + 2;
  const maxSamples = options.maxSamples ?? 100_000;
  if (estimated > maxSamples) {
    throw new RangeError(
      `Conjunction search requires ~${estimated} samples; increase stepSeconds or maxSamples`,
    );
  }

  const samples: Sample[] = [];
  for (let timeMs = startMs; timeMs <= endMs;) {
    samples.push({ timeMs, distanceSqKm2: distanceSqAt(primary, secondary, timeMs) });
    if (timeMs === endMs) break;
    timeMs = Math.min(timeMs + stepMs, endMs);
  }
  return samples;
}

function buildApproach(
  primary: Sgp4Satellite,
  secondary: Sgp4Satellite,
  timeMs: number,
  coarseStepSeconds: number,
  refined: boolean,
): ClosestApproach {
  const tca = new Date(timeMs);
  const p = primary.stateAt(tca);
  const s = secondary.stateAt(tca);

  const relativePositionTemeKm = subtract(s.positionTemeKm, p.positionTemeKm);
  const relativeVelocityTemeKmS = subtract(s.velocityTemeKmS, p.velocityTemeKmS);
  const missDistanceKm = magnitude(relativePositionTemeKm);
  const relativeSpeedKmS = magnitude(relativeVelocityTemeKmS);
  const rtn = toRtn(relativePositionTemeKm, p.positionTemeKm, p.velocityTemeKmS);

  return {
    primary: primary.sourceInfo,
    secondary: secondary.sourceInfo,
    tca,
    missDistanceKm,
    relativeSpeedKmS,
    relativePositionTemeKm,
    relativeVelocityTemeKmS,
    rtn,
    quality: quality(primary, secondary, tca),
    coarseStepSeconds,
    refined,
  };
}

function quality(primary: Sgp4Satellite, secondary: Sgp4Satellite, at: Date): ConjunctionQuality {
  const a = primary.elementAgeHours(at);
  const b = secondary.elementAgeHours(at);
  const maxAge = Math.max(Math.abs(a), Math.abs(b));
  const freshness =
    maxAge <= 24 ? "excellent" :
    maxAge <= 72 ? "good" :
    maxAge <= 168 ? "stale" :
    "very-stale";

  return {
    frame: "TEME",
    model: "SGP4/SDP4",
    primaryElementAgeHours: a,
    secondaryElementAgeHours: b,
    maxAbsoluteElementAgeHours: maxAge,
    freshness,
    covarianceAvailable: false,
    collisionProbabilityAvailable: false,
  };
}

function toRtn(
  relativePosition: CartesianKm,
  primaryPosition: CartesianKm,
  primaryVelocity: CartesianKm,
): RtnSeparation {
  const radial = normalize(primaryPosition);
  const normal = normalize(cross(primaryPosition, primaryVelocity));
  const alongTrack = normalize(cross(normal, radial));
  return {
    radialKm: dot(relativePosition, radial),
    alongTrackKm: dot(relativePosition, alongTrack),
    crossTrackKm: dot(relativePosition, normal),
  };
}

function distanceSqAt(primary: Sgp4Satellite, secondary: Sgp4Satellite, timeMs: number): number {
  const time = new Date(timeMs);
  const a = primary.stateAt(time).positionTemeKm;
  const b = secondary.stateAt(time).positionTemeKm;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return dx * dx + dy * dy + dz * dz;
}

function goldenSectionMinimum(
  fn: (x: number) => number,
  lower: number,
  upper: number,
  tolerance: number,
): number {
  const phi = (1 + Math.sqrt(5)) / 2;
  let a = lower;
  let b = upper;
  let c = b - (b - a) / phi;
  let d = a + (b - a) / phi;
  let fc = fn(c);
  let fd = fn(d);

  for (let i = 0; i < 80 && b - a > tolerance; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - (b - a) / phi;
      fc = fn(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + (b - a) / phi;
      fd = fn(d);
    }
  }
  return (a + b) / 2;
}

function validateOptions(options: ClosestApproachOptions): void {
  if (Number.isNaN(options.start.getTime()) || Number.isNaN(options.end.getTime())) {
    throw new TypeError("start and end must be valid Date objects");
  }
  if (options.end.getTime() <= options.start.getTime()) throw new RangeError("end must be after start");
  const step = options.stepSeconds ?? 60;
  if (!(step > 0)) throw new RangeError("stepSeconds must be > 0");
}

function subtract(a: CartesianKm, b: CartesianKm): CartesianKm {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function magnitude(v: CartesianKm): number {
  return Math.hypot(v.x, v.y, v.z);
}

function dot(a: CartesianKm, b: CartesianKm): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: CartesianKm, b: CartesianKm): CartesianKm {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v: CartesianKm): CartesianKm {
  const n = magnitude(v);
  if (!(n > 0)) throw new RangeError("Cannot normalize zero vector");
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}
