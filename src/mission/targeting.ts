import { BODIES, PHYSICS } from "../science/constants.js";
import { simulateLaunch } from "../trajectory/simulate.js";
import type { LaunchModel, LaunchSimulation } from "../trajectory/types.js";

export interface OrbitTarget {
  perigeeAltitudeKm: number;
  apogeeAltitudeKm: number;
  inclinationDeg?: number;
  /** Default tolerance 20 km. */
  altitudeToleranceKm?: number;
  /** Default tolerance 2 degrees. */
  inclinationToleranceDeg?: number;
}
export interface GuidanceSweepOptions {
  /** Explicit candidate pitch offsets in degrees. NOT a closed-loop trajectory optimizer. */
  pitchOffsetsDeg: readonly number[];
  /** Explicit candidate heading offsets in degrees. */
  headingOffsetsDeg: readonly number[];
  maxCandidates?: number;
}
export interface TargetAssessment {
  achieved: boolean;
  score: number;
  altitudePerigeeErrorKm: number | null;
  altitudeApogeeErrorKm: number | null;
  inclinationErrorDeg: number | null;
  maxQPa: number;
  maxAxialAccelerationG: number;
  violations: string[];
  reasoning: string[];
}
export interface GuidanceCandidate {
  pitchOffsetDeg: number;
  headingOffsetDeg: number;
  assessment: TargetAssessment;
  simulation: LaunchSimulation;
}
export interface GuidanceSweepResult {
  target: OrbitTarget;
  evaluated: number;
  best: GuidanceCandidate;
  candidates: GuidanceCandidate[];
  achieved: boolean;
  method: "bounded-grid-sweep";
  warning: string;
}

export function assessOrbitTarget(result: LaunchSimulation, target: OrbitTarget): TargetAssessment {
  validateTarget(target);
  const orbit = result.finalOrbit;
  const perigeeError = orbit && Number.isFinite(orbit.perigeeAltitudeKm)
    ? Math.abs(orbit.perigeeAltitudeKm - target.perigeeAltitudeKm) : null;
  const apogeeError = orbit && orbit.apogeeAltitudeKm !== null && Number.isFinite(orbit.apogeeAltitudeKm)
    ? Math.abs(orbit.apogeeAltitudeKm - target.apogeeAltitudeKm) : null;
  const inclinationError = target.inclinationDeg !== undefined && orbit && Number.isFinite(orbit.inclinationDeg)
    ? Math.abs(orbit.inclinationDeg - target.inclinationDeg) : null;
  const altitudeTolerance = target.altitudeToleranceKm ?? 20;
  const inclinationTolerance = target.inclinationToleranceDeg ?? 2;
  const violations = [...result.constraintViolations];
  const reasoning: string[] = [];
  const bound = orbit?.classification === "bound-orbit-candidate" && orbit.perigeeAbove160Km;
  if (!bound) reasoning.push("Instantaneous two-body orbit is not a bound candidate with perigee above 160 km.");
  if (perigeeError === null || perigeeError > altitudeTolerance) reasoning.push("Target perigee tolerance was not met.");
  if (apogeeError === null || apogeeError > altitudeTolerance) reasoning.push("Target apogee tolerance was not met.");
  if (target.inclinationDeg !== undefined && (inclinationError === null || inclinationError > inclinationTolerance)) {
    reasoning.push("Target inclination tolerance was not met.");
  }
  if (violations.length > 0) reasoning.push("Launch model constraint violations were reported.");

  const score =
    (perigeeError ?? 1e6) / altitudeTolerance +
    (apogeeError ?? 1e6) / altitudeTolerance +
    (target.inclinationDeg === undefined ? 0 : (inclinationError ?? 1e4) / inclinationTolerance) +
    (bound ? 0 : 1000) +
    100 * violations.length;
  const achieved =
    bound &&
    perigeeError !== null && perigeeError <= altitudeTolerance &&
    apogeeError !== null && apogeeError <= altitudeTolerance &&
    (target.inclinationDeg === undefined || (inclinationError !== null && inclinationError <= inclinationTolerance)) &&
    violations.length === 0;

  return {
    achieved, score,
    altitudePerigeeErrorKm: perigeeError,
    altitudeApogeeErrorKm: apogeeError,
    inclinationErrorDeg: inclinationError,
    maxQPa: result.maxQPa,
    maxAxialAccelerationG: result.maxAxialAccelerationG,
    violations, reasoning,
  };
}

/**
 * Transparent bounded grid sweep over time-tagged guidance offsets. No promise
 * that any candidate can achieve target orbit or that the result is globally optimal.
 */
export function sweepLaunchGuidance(model: LaunchModel, target: OrbitTarget, options: GuidanceSweepOptions): GuidanceSweepResult {
  validateTarget(target);
  const pitches = options.pitchOffsetsDeg, headings = options.headingOffsetsDeg;
  const maxCandidates = options.maxCandidates ?? 64;
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 256) throw new RangeError("maxCandidates must be 1..256");
  if (!pitches.length || !headings.length) throw new RangeError("Guidance sweep requires nonempty pitch and heading grids");
  if (pitches.length * headings.length > maxCandidates) throw new RangeError("Candidate grid exceeds maxCandidates");
  if ([...pitches, ...headings].some(v => !Number.isFinite(v) || Math.abs(v) > 45))
    throw new RangeError("Offset must be finite and within +/-45 degrees");

  const candidates: GuidanceCandidate[] = [];
  for (const pitchOffsetDeg of pitches) {
    for (const headingOffsetDeg of headings) {
      const guidance = model.guidance.map(knot => ({
        ...knot,
        pitchDeg: Math.min(90, Math.max(-90, knot.pitchDeg + pitchOffsetDeg)),
        headingDeg: knot.headingDeg + headingOffsetDeg,
      }));
      const simulation = simulateLaunch({ ...model, guidance });
      candidates.push({
        pitchOffsetDeg, headingOffsetDeg, simulation,
        assessment: assessOrbitTarget(simulation, target),
      });
    }
  }
  candidates.sort((a, b) => a.assessment.score - b.assessment.score);
  return {
    target, evaluated: candidates.length,
    best: candidates[0]!,
    candidates,
    achieved: candidates.some(candidate => candidate.assessment.achieved),
    method: "bounded-grid-sweep",
    warning: "A guidance grid sweep is not closed-loop flight guidance, globally optimized insertion, or proof of collision clearance.",
  };
}

/** Ideal vacuum-only staged rocket-equation delta-v upper-level diagnostic. */
export function idealStagedDeltaVMps(model: LaunchModel): number {
  let wet = model.vehicle.payloadMassKg + (model.vehicle.fairingMassKg ?? 0) +
    model.vehicle.stages.reduce((s, stage) => s + stage.dryMassKg + stage.propellantMassKg, 0);
  let deltaV = 0;
  for (let i = 0; i < model.vehicle.stages.length; i++) {
    const stage = model.vehicle.stages[i]!;
    if (!(wet > stage.propellantMassKg && stage.ispVacuumS > 0)) throw new RangeError("Nonphysical stage mass/ISP");
    deltaV += PHYSICS.standardGravity * stage.ispVacuumS * Math.log(wet / (wet - stage.propellantMassKg));
    wet -= stage.propellantMassKg;
    if (i < model.vehicle.stages.length - 1) wet -= stage.dryMassKg;
  }
  return deltaV;
}

/** Two-body circular orbit speed alone. Does not include ascent gravity/drag losses. */
export function circularSpeedAtAltitudeMps(altitudeKm: number): number {
  if (!Number.isFinite(altitudeKm) || altitudeKm < 0) throw new RangeError("altitudeKm must be finite and non-negative");
  return Math.sqrt(BODIES.earth.mu / (BODIES.earth.radius + altitudeKm * 1000));
}

function validateTarget(target: OrbitTarget): void {
  if (![target.perigeeAltitudeKm, target.apogeeAltitudeKm].every(x => Number.isFinite(x) && x >= 0))
    throw new RangeError("Target altitudes must be finite and non-negative");
  if (target.apogeeAltitudeKm < target.perigeeAltitudeKm) throw new RangeError("Target apogee must be >= perigee");
  if (target.inclinationDeg !== undefined && (!Number.isFinite(target.inclinationDeg) || target.inclinationDeg < 0 || target.inclinationDeg > 180))
    throw new RangeError("Target inclination must be 0..180 degrees");
  if (target.altitudeToleranceKm !== undefined && !(target.altitudeToleranceKm > 0))
    throw new RangeError("altitudeToleranceKm must be positive");
  if (target.inclinationToleranceDeg !== undefined && !(target.inclinationToleranceDeg > 0))
    throw new RangeError("inclinationToleranceDeg must be positive");
}
