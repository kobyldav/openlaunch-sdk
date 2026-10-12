import type { CartesianKm } from "../orbit/types.js";
import type { Launch } from "../types.js";
import type { SampledTemeTrajectory } from "../traffic/trajectory.js";

/** All masses kg, positions m, velocities m/s and forces N unless named otherwise. */
export interface LaunchSite {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeM: number;
}
export interface AscentStage {
  name: string;
  dryMassKg: number;
  propellantMassKg: number;
  thrustVacuumN: number;
  thrustSeaLevelN: number;
  ispVacuumS: number;
  ispSeaLevelS: number;
  /** Optional coast after burnout, before jettison and next-stage ignition. */
  coastAfterBurnSeconds?: number;
}
export interface LaunchVehicle {
  name: string;
  stages: readonly AscentStage[];
  payloadMassKg: number;
  referenceAreaM2: number;
  dragCoefficient: number;
  fairingMassKg?: number;
  fairingJettisonAtSeconds?: number;
}
export interface PitchProgramPoint {
  tSeconds: number;
  /** Angle above the local tangent plane; 90 degrees is vertical. */
  elevationDeg: number;
  /** Clockwise from local north. */
  azimuthDeg: number;
  throttle?: number;
}
export interface AscentGuidance {
  program: readonly PitchProgramPoint[];
}
export interface LaunchEnvironment {
  /** Rotating spherical central field by default; optional J2 gravity perturbation. */
  useJ2?: boolean;
  /** Uniform ENU wind model in m/s; not a realistic vertical wind profile. */
  windEastMps?: number;
  windNorthMps?: number;
  windUpMps?: number;
  /** Atmospheric density exponentially extended above ISA's upper boundary. */
  upperAtmosphereScaleHeightM?: number;
}
export interface LaunchSimulationOptions {
  site: LaunchSite;
  liftoff: Date;
  vehicle: LaunchVehicle;
  guidance: AscentGuidance;
  /** Fixed maximum integration step; RK4 substeps also split at staging/guidance events. */
  stepSeconds?: number;
  durationSeconds: number;
  environment?: LaunchEnvironment;
  /** Stop when the rocket intersects this altitude (defaults to launch pad altitude). */
  stopAtImpact?: boolean;
  /** Strict upper bound on returned samples. */
  maxSamples?: number;
}
export type AscentEventKind =
  | "liftoff" | "stage-burnout" | "stage-separation" | "stage-ignition"
  | "fairing-jettison" | "max-q" | "impact" | "simulation-end";
export interface AscentEvent {
  kind: AscentEventKind;
  time: Date;
  tSeconds: number;
  stageName?: string;
  massKg: number;
  altitudeM: number;
  details?: string;
}
export interface AscentSample {
  time: Date;
  tSeconds: number;
  stageIndex: number;
  flightMode: "powered" | "coast" | "complete";
  massKg: number;
  propellantRemainingKg: number;
  positionEcefM: CartesianKm;
  velocityEcefMps: CartesianKm;
  /** Approximate inertial/TEME position for v0.7 exploratory traffic integration. */
  positionTemeKm: CartesianKm;
  velocityTemeKmS: CartesianKm;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeM: number;
  speedInertialMps: number;
  speedAirRelativeMps: number;
  dynamicPressurePa: number;
  mach: number;
  thrustN: number;
  accelerationProperMps2: number;
}
export interface OsculatingOrbitEstimate {
  /** Two-body osculating estimate from the final inertial-like state. */
  eccentricity: number;
  inclinationDeg: number;
  periapsisAltitudeKm: number;
  apoapsisAltitudeKm: number | null;
  specificOrbitalEnergyJkg: number;
  bound: boolean;
}
export interface AscentSummary {
  initialMassKg: number;
  finalMassKg: number;
  elapsedSeconds: number;
  maxDynamicPressurePa: number;
  maxProperAccelerationMps2: number;
  maxAltitudeM: number;
  maxInertialSpeedMps: number;
  finalOrbit: OsculatingOrbitEstimate;
  terminatedBy: "duration" | "impact";
}
export interface AscentSimulationResult {
  vehicleName: string;
  start: Date;
  samples: AscentSample[];
  events: AscentEvent[];
  summary: AscentSummary;
  model: "rotating-ecef-3dof-rk4";
  /** v0.8 uses GMST rotation, not full IERS/EOP transformations. */
  frameAccuracy: "approximate-TEME-via-GMST";
  limitations: readonly string[];
  toTrajectory(): SampledTemeTrajectory;
}
export interface LaunchScenarioInput extends Omit<LaunchSimulationOptions, "site" | "liftoff"> {
  launch: Pick<Launch, "name" | "net" | "pad">;
}
