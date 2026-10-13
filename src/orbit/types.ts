export interface CartesianKm {
  x: number;
  y: number;
  z: number;
}

export interface GeodeticState {
  latitudeDeg: number;
  longitudeDeg: number;
  heightKm: number;
}

export interface Sgp4State {
  time: Date;
  positionTemeKm: CartesianKm;
  velocityTemeKmS: CartesianKm;
  positionEcfKm: CartesianKm;
  geodetic: GeodeticState;
  sourceAgeHours: number;
  propagationMethod: "SGP4-near-earth" | "SDP4-deep-space";
}

export interface GroundObserver {
  latitudeDeg: number;
  longitudeDeg: number;
  heightM?: number;
}

export interface LookAngleState {
  time: Date;
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
  rangeRateKmS: number;
}

export interface GroundTrackPoint {
  time: Date;
  latitudeDeg: number;
  longitudeDeg: number;
  heightKm: number;
  positionEcfKm: CartesianKm;
}

export interface PassWindow {
  aos: Date;
  tca: Date;
  los: Date;
  durationSeconds: number;
  maxElevationDeg: number;
  minRangeKm: number;
  aosAzimuthDeg: number;
  tcaAzimuthDeg: number;
  losAzimuthDeg: number;
  clippedAtStart: boolean;
  clippedAtEnd: boolean;
}

export interface PassSearchOptions {
  start: Date;
  end: Date;
  minElevationDeg?: number;
  stepSeconds?: number;
  maxPasses?: number;
}

export interface GroundTrackOptions {
  start: Date;
  end: Date;
  stepSeconds?: number;
  maxPoints?: number;
}

export interface SatelliteIdentity {
  name?: string;
  objectId?: string;
  noradCatalogId?: number;
}

export interface SatelliteSourceInfo extends SatelliteIdentity {
  source: "OMM" | "TLE";
  epoch: Date;
}

export class OrbitPropagationError extends Error {
  readonly noradCatalogId?: number;
  readonly at: Date;
  readonly code?: number;

  constructor(message: string, at: Date, options: { noradCatalogId?: number; code?: number } = {}) {
    super(message);
    this.name = "OrbitPropagationError";
    this.at = at;
    if (options.noradCatalogId !== undefined) this.noradCatalogId = options.noradCatalogId;
    if (options.code !== undefined) this.code = options.code;
  }
}
