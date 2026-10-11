import type { AreaOfInterest } from "../geo/types.js";

export type SensorKind = "optical" | "sar" | "thermal" | "generic";

export interface SensorModel {
  name: string;
  kind: SensorKind;
  nadirSwathWidthKm: number;
  maxOffNadirDeg?: number;
  nominalResolutionM?: number;
}

export interface SensorAccessSearchOptions {
  area: AreaOfInterest;
  start: Date;
  end: Date;
  stepSeconds?: number;
  maxWindows?: number;
}

export interface SensorAccessWindow {
  start: Date;
  closest: Date;
  end: Date;
  durationSeconds: number;
  minGroundDistanceKm: number;
  targetRadiusKm: number;
  swathHalfWidthKm: number;
  offNadirReachKm: number;
  requiredOffNadirDegAtClosest: number;
  satelliteAltitudeKmAtClosest: number;
  sensor: SensorModel;
  geometryModel: "spherical-earth-swath";
}
