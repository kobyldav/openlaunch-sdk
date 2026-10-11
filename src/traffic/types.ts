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

export interface NearestObject {
  satellite: SatelliteSourceInfo;
  distanceKm: number;
  relativeSpeedKmS: number;
  at: Date;
}
