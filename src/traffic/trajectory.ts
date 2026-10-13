import type { Sgp4Satellite } from "../orbit/sgp4.js";
import type { CartesianKm } from "../orbit/types.js";
import type {
  RtnSeparation,
  TimedTemeState,
  TrajectoryClosestApproach,
  TrajectoryScreenOptions,
} from "./types.js";

export class SampledTemeTrajectory {
  readonly points: readonly TimedTemeState[];
  readonly start: Date;
  readonly end: Date;
  readonly maxStepSeconds: number;

  constructor(points: readonly TimedTemeState[]) {
    if (points.length < 2) throw new RangeError("SampledTemeTrajectory requires at least two states");
    const copy = points.map((point) => ({
      time: new Date(point.time),
      positionTemeKm: { ...point.positionTemeKm },
      velocityTemeKmS: { ...point.velocityTemeKmS },
    }));

    let maxStepSeconds = 0;
    for (let i = 0; i < copy.length; i++) {
      const current = copy[i]!;
      if (Number.isNaN(current.time.getTime())) throw new TypeError("trajectory contains an invalid Date");
      if (!finiteVec(current.positionTemeKm) || !finiteVec(current.velocityTemeKmS)) {
        throw new TypeError("trajectory contains a non-finite state vector");
      }
      if (i > 0) {
        const previous = copy[i - 1]!;
        const deltaSeconds = (current.time.getTime() - previous.time.getTime()) / 1000;
        if (!(deltaSeconds > 0)) throw new RangeError("trajectory times must be strictly increasing");
        maxStepSeconds = Math.max(maxStepSeconds, deltaSeconds);
      }
    }

    this.points = copy;
    this.start = new Date(copy[0]!.time);
    this.end = new Date(copy[copy.length - 1]!.time);
    this.maxStepSeconds = maxStepSeconds;
  }

  stateAt(time: Date): TimedTemeState {
    const ms = time.getTime();
    if (Number.isNaN(ms)) throw new TypeError("time must be a valid Date");
    if (ms < this.start.getTime() || ms > this.end.getTime()) {
      throw new RangeError("requested time lies outside sampled trajectory");
    }

    const index = findSegment(this.points, ms);
    const a = this.points[index]!;
    const b = this.points[index + 1]!;
    if (ms === a.time.getTime()) return cloneState(a);
    if (ms === b.time.getTime()) return cloneState(b);

    const dtSeconds = (b.time.getTime() - a.time.getTime()) / 1000;
    const u = (ms - a.time.getTime()) / (dtSeconds * 1000);
    const u2 = u * u;
    const u3 = u2 * u;

    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;

    const dh00 = (6 * u2 - 6 * u) / dtSeconds;
    const dh10 = 3 * u2 - 4 * u + 1;
    const dh01 = (-6 * u2 + 6 * u) / dtSeconds;
    const dh11 = 3 * u2 - 2 * u;

    return {
      time: new Date(ms),
      positionTemeKm: combineHermitePosition(a, b, h00, h10, h01, h11, dtSeconds),
      velocityTemeKmS: combineHermiteVelocity(a, b, dh00, dh10, dh01, dh11),
    };
  }
}

export function closestApproachTrajectoryToSatellite(
  trajectory: SampledTemeTrajectory,
  satellite: Sgp4Satellite,
): TrajectoryClosestApproach {
  const sampleTimes = buildCoarseTimes(trajectory);
  let bestIndex = 0;
  let bestDistanceSq = trajectorySatelliteDistanceSq(trajectory, satellite, sampleTimes[0]!);

  for (let i = 1; i < sampleTimes.length; i++) {
    const distanceSq = trajectorySatelliteDistanceSq(trajectory, satellite, sampleTimes[i]!);
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = i;
    }
  }

  let bestTimeMs = sampleTimes[bestIndex]!;
  const intervals: Array<[number, number]> = [];
  if (bestIndex > 0) intervals.push([sampleTimes[bestIndex - 1]!, sampleTimes[bestIndex]!]);
  if (bestIndex < sampleTimes.length - 1) intervals.push([sampleTimes[bestIndex]!, sampleTimes[bestIndex + 1]!]);

  for (const [lo, hi] of intervals) {
    const candidate = goldenSectionMinimum(
      (timeMs) => trajectorySatelliteDistanceSq(trajectory, satellite, timeMs),
      lo,
      hi,
      1,
    );
    const distanceSq = trajectorySatelliteDistanceSq(trajectory, satellite, candidate);
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestTimeMs = candidate;
    }
  }

  return buildTrajectoryApproach(trajectory, satellite, bestTimeMs);
}

export function screenTrajectoryAgainstSatellites(
  trajectory: SampledTemeTrajectory,
  satellites: readonly Sgp4Satellite[],
  options: TrajectoryScreenOptions,
): TrajectoryClosestApproach[] {
  if (!(options.thresholdKm > 0)) throw new RangeError("thresholdKm must be > 0");
  const output: TrajectoryClosestApproach[] = [];

  for (const satellite of satellites) {
    try {
      const event = closestApproachTrajectoryToSatellite(trajectory, satellite);
      if (event.missDistanceKm <= options.thresholdKm) output.push(event);
    } catch {
      // A decayed/bad GP element set must not abort screening of the rest of the catalog.
    }
  }

  return output
    .sort((a, b) => a.missDistanceKm - b.missDistanceKm)
    .slice(0, options.maxResults ?? 100);
}

function buildCoarseTimes(trajectory: SampledTemeTrajectory): number[] {
  const times: number[] = [];
  for (let i = 0; i < trajectory.points.length - 1; i++) {
    const a = trajectory.points[i]!.time.getTime();
    const b = trajectory.points[i + 1]!.time.getTime();
    if (i === 0) times.push(a);
    times.push((a + b) / 2, b);
  }
  return times;
}

function buildTrajectoryApproach(
  trajectory: SampledTemeTrajectory,
  satellite: Sgp4Satellite,
  timeMs: number,
): TrajectoryClosestApproach {
  const time = new Date(timeMs);
  const t = trajectory.stateAt(time);
  const s = satellite.stateAt(time);
  const relativePositionTemeKm = subtract(t.positionTemeKm, s.positionTemeKm);
  const relativeVelocityTemeKmS = subtract(t.velocityTemeKmS, s.velocityTemeKmS);

  return {
    satellite: satellite.sourceInfo,
    tca: time,
    missDistanceKm: magnitude(relativePositionTemeKm),
    relativeSpeedKmS: magnitude(relativeVelocityTemeKmS),
    relativePositionTemeKm,
    relativeVelocityTemeKmS,
    satelliteRtn: toRtn(relativePositionTemeKm, s.positionTemeKm, s.velocityTemeKmS),
    satelliteElementAgeHours: satellite.elementAgeHours(time),
    interpolation: "cubic-hermite",
    maxTrajectoryStepSeconds: trajectory.maxStepSeconds,
  };
}

function trajectorySatelliteDistanceSq(
  trajectory: SampledTemeTrajectory,
  satellite: Sgp4Satellite,
  timeMs: number,
): number {
  const time = new Date(timeMs);
  const t = trajectory.stateAt(time).positionTemeKm;
  const s = satellite.stateAt(time).positionTemeKm;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const dz = t.z - s.z;
  return dx * dx + dy * dy + dz * dz;
}

function findSegment(points: readonly TimedTemeState[], timeMs: number): number {
  let lo = 0;
  let hi = points.length - 2;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const a = points[mid]!.time.getTime();
    const b = points[mid + 1]!.time.getTime();
    if (timeMs < a) hi = mid - 1;
    else if (timeMs > b) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(points.length - 2, lo));
}

function combineHermitePosition(
  a: TimedTemeState,
  b: TimedTemeState,
  h00: number,
  h10: number,
  h01: number,
  h11: number,
  dtSeconds: number,
): CartesianKm {
  return {
    x: h00 * a.positionTemeKm.x + h10 * dtSeconds * a.velocityTemeKmS.x + h01 * b.positionTemeKm.x + h11 * dtSeconds * b.velocityTemeKmS.x,
    y: h00 * a.positionTemeKm.y + h10 * dtSeconds * a.velocityTemeKmS.y + h01 * b.positionTemeKm.y + h11 * dtSeconds * b.velocityTemeKmS.y,
    z: h00 * a.positionTemeKm.z + h10 * dtSeconds * a.velocityTemeKmS.z + h01 * b.positionTemeKm.z + h11 * dtSeconds * b.velocityTemeKmS.z,
  };
}

function combineHermiteVelocity(
  a: TimedTemeState,
  b: TimedTemeState,
  dh00: number,
  dh10: number,
  dh01: number,
  dh11: number,
): CartesianKm {
  return {
    x: dh00 * a.positionTemeKm.x + dh10 * a.velocityTemeKmS.x + dh01 * b.positionTemeKm.x + dh11 * b.velocityTemeKmS.x,
    y: dh00 * a.positionTemeKm.y + dh10 * a.velocityTemeKmS.y + dh01 * b.positionTemeKm.y + dh11 * b.velocityTemeKmS.y,
    z: dh00 * a.positionTemeKm.z + dh10 * a.velocityTemeKmS.z + dh01 * b.positionTemeKm.z + dh11 * b.velocityTemeKmS.z,
  };
}

function toRtn(
  relativePosition: CartesianKm,
  referencePosition: CartesianKm,
  referenceVelocity: CartesianKm,
): RtnSeparation {
  const radial = normalize(referencePosition);
  const normal = normalize(cross(referencePosition, referenceVelocity));
  const alongTrack = normalize(cross(normal, radial));
  return {
    radialKm: dot(relativePosition, radial),
    alongTrackKm: dot(relativePosition, alongTrack),
    crossTrackKm: dot(relativePosition, normal),
  };
}

function goldenSectionMinimum(
  fn: (value: number) => number,
  lower: number,
  upper: number,
  tolerance: number,
): number {
  if (upper <= lower) return lower;
  const phi = (1 + Math.sqrt(5)) / 2;
  let a = lower;
  let b = upper;
  let c = b - (b - a) / phi;
  let d = a + (b - a) / phi;
  let fc = fn(c);
  let fd = fn(d);

  for (let i = 0; i < 64 && b - a > tolerance; i++) {
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

function cloneState(state: TimedTemeState): TimedTemeState {
  return {
    time: new Date(state.time),
    positionTemeKm: { ...state.positionTemeKm },
    velocityTemeKmS: { ...state.velocityTemeKmS },
  };
}

function finiteVec(v: CartesianKm): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
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
