import type { CartesianKm } from "../orbit/types.js";
import type { TimedTemeState } from "../traffic/types.js";
import type { LaunchOrbitalAssessment } from "./orbit-analysis.js";

/** Generic vehicle data. Never interpret these values as a specific real launch vehicle. */
export interface LaunchStage {
  name: string;
  dryMassKg: number;
  propellantMassKg: number;
  thrustSeaLevelN: number;
  thrustVacuumN: number;
  ispSeaLevelS: number;
  ispVacuumS: number;
  /** Coast after this stage's separation, before next stage ignition. Default: 0. */
  coastAfterSeparationSeconds?: number;
}

/** Pitch is degrees above local horizontal, heading clockwise from north. */
export interface GuidanceKnot {
  timeSeconds: number;
  pitchDeg: number;
  headingDeg: number;
  throttle?: number;
}

/** Input assumptions, not inferred from a launch's name or NET alone. */
export interface LaunchVehicle {
  name: string;
  stages: readonly LaunchStage[];
  payloadMassKg: number;
  fairingMassKg?: number;
  fairingJettisonSeconds?: number;
  /** Optional event-driven fairing release. Takes precedence over fixed-time release. */
  fairingSeparation?: {
    earliestSeconds: number;
    minAltitudeKm?: number;
    maxDynamicPressurePa?: number;
  };
  dragCoefficient: number;
  referenceAreaM2: number;
}

export interface LaunchSite {
  name?: string;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeM?: number;
}

export interface LaunchModel {
  vehicle: LaunchVehicle;
  site: LaunchSite;
  liftoff: Date;
  guidance: readonly GuidanceKnot[];
  /** Nominal solver step. Event boundaries can produce smaller steps. */
  stepSeconds?: number;
  /** Upper time limit, never an orbit-insertion guarantee. */
  durationSeconds: number;
  /** Use first-order zonal J2 acceleration as well as two-body gravity. Default true. */
  enableJ2?: boolean;
  /** Coast with the remaining payload/stage when fuel is exhausted. Default true. */
  coastAfterBurnout?: boolean;
  /** Optional idealized first-order throttle constraint controller. */
  flightConstraints?: {
    maxDynamicPressurePa?: number;
    maxAxialAccelerationG?: number;
    /** Response horizon in seconds for max-Q prediction. Default 5s. */
    maxQResponseSeconds?: number;
  };
  /** Maximum output samples. Default 20000. */
  maxSamples?: number;
}

export type LaunchEventKind =
  | "liftoff"
  | "engine-ignition"
  | "engine-cutoff"
  | "stage-separation"
  | "fairing-jettison"
  | "max-q"
  | "ground-impact"
  | "simulation-end";

export interface LaunchEvent {
  kind: LaunchEventKind;
  time: Date;
  elapsedSeconds: number;
  altitudeKm: number;
  massKg: number;
  stageIndex: number | null;
  detail?: string;
  /** For discrete mass-release events, allows auditing discontinuities. */
  massBeforeKg?: number;
  massAfterKg?: number;
}

export interface LaunchTelemetry {
  time: Date;
  elapsedSeconds: number;
  stageIndex: number | null;
  massKg: number;
  propellantRemainingKg: number;
  altitudeKm: number;
  latitudeDeg: number;
  longitudeDeg: number;
  inertialSpeedMps: number;
  atmosphericRelativeSpeedMps: number;
  verticalSpeedMps: number;
  dynamicPressurePa: number;
  mach: number;
  accelerationMps2: number;
  thrustN: number;
  /** Scheduled throttle from the guidance profile. */
  commandedThrottle: number;
  /** Applied throttle after idealized constraint limiting. */
  effectiveThrottle: number;
  throttleLimiter: "none" | "max-q" | "axial-g" | "both";
  dragN: number;
  gravityMps2: number;
  positionTemeKm: CartesianKm;
  velocityTemeKmS: CartesianKm;
}

export interface LaunchSimulation {
  model: LaunchModel;
  trajectory: readonly TimedTemeState[];
  telemetry: readonly LaunchTelemetry[];
  events: readonly LaunchEvent[];
  initialMassKg: number;
  finalMassKg: number;
  finalOrbit: LaunchOrbitalAssessment | null;
  maxQPa: number;
  maxAxialAccelerationG: number;
  throttledSamples: number;
  /** Constraints are best effort and may be exceeded: never imply certification. */
  constraintViolations: readonly string[];
  maxQTime: Date;
  maxAltitudeKm: number;
  totalSimulatedSeconds: number;
  termination: "duration" | "ground-impact" | "burnout";
  frame: "TEME-approx-GMST";
  limitations: readonly string[];
}

/** Percentile-style 3D position dispersion around the nominal path at fixed times. */
export interface TrajectoryDispersion {
  time: Date;
  elapsedSeconds: number;
  minDeviationKm: number;
  p50DeviationKm: number;
  p95DeviationKm: number;
  maxDeviationKm: number;
  contributingRuns: number;
}

export interface MonteCarloConfig {
  runs: number;
  seed?: number;
  thrustSigmaFraction?: number;
  ispSigmaFraction?: number;
  dragSigmaFraction?: number;
  pitchSigmaDeg?: number;
  headingSigmaDeg?: number;
  maxRuns?: number;
}

export interface LaunchMonteCarloResult {
  nominal: LaunchSimulation;
  successfulRuns: number;
  failedRuns: number;
  dispersion: readonly TrajectoryDispersion[];
  seed: number;
}

export interface DerivativeState {
  positionM: CartesianKm;
  velocityMps: CartesianKm;
  massKg: number;
}
