import type { CartesianKm, SatelliteSourceInfo } from "../orbit/types.js";

export interface RtnSeparation {
  radialKm: number;
  alongTrackKm: number;
  crossTrackKm: number;
}

export interface ConjunctionQuality {
  frame: "TEME";
  model: "SGP4/SDP4";
  primaryElementAgeHours: number;
  secondaryElementAgeHours: number;
  maxAbsoluteElementAgeHours: number;
  freshness: "excellent" | "good" | "stale" | "very-stale";
  covarianceAvailable: false;
  collisionProbabilityAvailable: false;
}

export interface ClosestApproach {
  primary: SatelliteSourceInfo;
  secondary: SatelliteSourceInfo;
  tca: Date;
  missDistanceKm: number;
  relativeSpeedKmS: number;
  relativePositionTemeKm: CartesianKm;
  relativeVelocityTemeKmS: CartesianKm;
  rtn: RtnSeparation;
  quality: ConjunctionQuality;
  coarseStepSeconds: number;
  refined: boolean;
}

export interface ClosestApproachOptions {
  start: Date;
  end: Date;
  stepSeconds?: number;
  refinementToleranceMs?: number;
  maxSamples?: number;
}

export interface CloseApproachSearchOptions extends ClosestApproachOptions {
  thresholdKm: number;
  maxEvents?: number;
}

export interface CatalogScreenOptions extends ClosestApproachOptions {
  thresholdKm: number;
  maxResults?: number;
  maxObjects?: number;
}

/** A coincidence means the public propagated states cannot resolve separation.
 * It is NOT proof that two physical objects are touching, docked, or identical.
 */
export type EphemerisSeparation = "resolved" | "indistinguishable-ephemeris";

export interface NearestSearchOptions {
  /** Defaults to true for backwards compatibility. */
  includeIndistinguishable?: boolean;
}

export interface NearestObject {
  satellite: SatelliteSourceInfo;
  distanceKm: number;
  relativeSpeedKmS: number;
  at: Date;
  /** Flag coincident propagated states instead of presenting 0 km as a measured physical distance. */
  separation: EphemerisSeparation;
}

export interface TimedTemeState {
  time: Date;
  positionTemeKm: CartesianKm;
  velocityTemeKmS: CartesianKm;
}

export interface TrajectoryClosestApproach {
  satellite: SatelliteSourceInfo;
  tca: Date;
  missDistanceKm: number;
  relativeSpeedKmS: number;
  relativePositionTemeKm: CartesianKm;
  relativeVelocityTemeKmS: CartesianKm;
  satelliteRtn: RtnSeparation;
  satelliteElementAgeHours: number;
  interpolation: "cubic-hermite";
  maxTrajectoryStepSeconds: number;
}

export interface TrajectoryScreenOptions {
  thresholdKm: number;
  maxResults?: number;
}
