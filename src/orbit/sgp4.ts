import {
  degreesLat,
  degreesLong,
  eciToEcf,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  twoline2satrec,
  type OMMJsonObject,
  type SatRec,
} from "satellite.js";
import type { OmmRecord } from "../providers/celestrak.js";
import type {
  CartesianKm,
  GroundTrackOptions,
  GroundTrackPoint,
  SatelliteIdentity,
  SatelliteSourceInfo,
  Sgp4State,
} from "./types.js";
import { OrbitPropagationError } from "./types.js";

const MIN_VALID_RADIUS_KM = 6_300;

export class Sgp4Satellite {
  readonly satrec: SatRec;
  readonly sourceInfo: SatelliteSourceInfo;

  private constructor(satrec: SatRec, sourceInfo: SatelliteSourceInfo) {
    this.satrec = satrec;
    this.sourceInfo = sourceInfo;
  }

  static fromOmm(record: OmmRecord): Sgp4Satellite {
    const omm = normalizeOmm(record);
    const satrec = json2satrec(omm);
    const epoch = parseUtcEpoch(omm.EPOCH);
    return new Sgp4Satellite(satrec, {
      source: "OMM",
      epoch,
      name: omm.OBJECT_NAME,
      objectId: omm.OBJECT_ID,
      noradCatalogId: Number(omm.NORAD_CAT_ID),
    });
  }

  static fromTle(line1: string, line2: string, identity: SatelliteIdentity = {}): Sgp4Satellite {
    if (!line1.trim().startsWith("1 ") || !line2.trim().startsWith("2 ")) {
      throw new TypeError("TLE input must contain valid line 1 and line 2 records");
    }
    const satrec = twoline2satrec(line1, line2);
    const catalog = Number(satrec.satnum);
    const epoch = satrecEpochDate(satrec);
    return new Sgp4Satellite(satrec, {
      source: "TLE",
      epoch,
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.objectId ? { objectId: identity.objectId } : {}),
      ...(identity.noradCatalogId !== undefined && Number.isFinite(identity.noradCatalogId)
        ? { noradCatalogId: identity.noradCatalogId }
        : Number.isFinite(catalog)
          ? { noradCatalogId: catalog }
          : {}),
    });
  }

  stateAt(time: Date): Sgp4State {
    assertDate(time);
    const raw = propagate(this.satrec, time);
    if (!raw || !raw.position || !raw.velocity) {
      throw new OrbitPropagationError(
        `SGP4 propagation failed with SatRec error ${this.satrec.error}`,
        time,
        this.errorIdentity(),
      );
    }

    const positionTemeKm = copyVec(raw.position);
    const velocityTemeKmS = copyVec(raw.velocity);
    const radiusKm = magnitude(positionTemeKm);

    if (!Number.isFinite(radiusKm) || radiusKm < MIN_VALID_RADIUS_KM) {
      throw new OrbitPropagationError(
        `SGP4 produced a physically invalid Earth-centered radius (${radiusKm} km)`,
        time,
        this.errorIdentity(),
      );
    }

    const gmst = gstime(time);
    const ecf = eciToEcf(raw.position, gmst);
    const gd = eciToGeodetic(raw.position, gmst);

    return {
      time: new Date(time),
      positionTemeKm,
      velocityTemeKmS,
      positionEcfKm: copyVec(ecf),
      geodetic: {
        latitudeDeg: degreesLat(gd.latitude),
        longitudeDeg: degreesLong(gd.longitude),
        heightKm: gd.height,
      },
      sourceAgeHours: (time.getTime() - this.sourceInfo.epoch.getTime()) / 3_600_000,
      propagationMethod: this.satrec.method === "d" ? "SDP4-deep-space" : "SGP4-near-earth",
    };
  }

  states(times: readonly Date[]): Sgp4State[] {
    return times.map((time) => this.stateAt(time));
  }

  groundTrack(options: GroundTrackOptions): GroundTrackPoint[] {
    const stepSeconds = options.stepSeconds ?? 30;
    validateWindow(options.start, options.end);
    if (!(stepSeconds > 0)) throw new RangeError("stepSeconds must be > 0");
    const maxPoints = options.maxPoints ?? 20_000;
    const durationSeconds = (options.end.getTime() - options.start.getTime()) / 1000;
    const estimated = Math.floor(durationSeconds / stepSeconds) + 1;
    if (estimated > maxPoints) {
      throw new RangeError(`Ground track would contain ~${estimated} points; increase stepSeconds or maxPoints`);
    }

    const points: GroundTrackPoint[] = [];
    for (let ms = options.start.getTime(); ms <= options.end.getTime(); ms += stepSeconds * 1000) {
      const state = this.stateAt(new Date(ms));
      points.push({
        time: state.time,
        latitudeDeg: state.geodetic.latitudeDeg,
        longitudeDeg: state.geodetic.longitudeDeg,
        heightKm: state.geodetic.heightKm,
        positionEcfKm: state.positionEcfKm,
      });
    }
    if (points.length === 0 || points[points.length - 1]!.time.getTime() !== options.end.getTime()) {
      const state = this.stateAt(options.end);
      points.push({
        time: state.time,
        latitudeDeg: state.geodetic.latitudeDeg,
        longitudeDeg: state.geodetic.longitudeDeg,
        heightKm: state.geodetic.heightKm,
        positionEcfKm: state.positionEcfKm,
      });
    }
    return points;
  }

  elementAgeHours(at = new Date()): number {
    return (at.getTime() - this.sourceInfo.epoch.getTime()) / 3_600_000;
  }

  private errorIdentity(): { noradCatalogId?: number; code?: number } {
    return {
      ...(this.sourceInfo.noradCatalogId !== undefined ? { noradCatalogId: this.sourceInfo.noradCatalogId } : {}),
      ...(this.satrec.error !== undefined ? { code: Number(this.satrec.error) } : {}),
    };
  }
}

export function normalizeOmm(record: OmmRecord): OMMJsonObject {
  const missing: string[] = [];
  const needString = (name: keyof OmmRecord): string => {
    const value = record[name];
    if (typeof value === "string" && value.length > 0) return value;
    missing.push(String(name));
    return "";
  };
  const needNumber = (name: keyof OmmRecord, fallback?: number): number => {
    const value = Number(record[name]);
    if (Number.isFinite(value)) return value;
    if (fallback !== undefined) return fallback;
    missing.push(String(name));
    return Number.NaN;
  };

  const epoch = needString("EPOCH");
  const norad = needNumber("NORAD_CAT_ID");
  const meanMotion = needNumber("MEAN_MOTION");
  const eccentricity = needNumber("ECCENTRICITY");
  const inclination = needNumber("INCLINATION");
  const raan = needNumber("RA_OF_ASC_NODE");
  const argPer = needNumber("ARG_OF_PERICENTER");
  const meanAnomaly = needNumber("MEAN_ANOMALY");

  if (missing.length) {
    throw new TypeError(`OMM record is missing required SGP4 fields: ${[...new Set(missing)].join(", ")}`);
  }

  return {
    OBJECT_NAME: typeof record.OBJECT_NAME === "string" && record.OBJECT_NAME ? record.OBJECT_NAME : `NORAD ${norad}`,
    OBJECT_ID: typeof record.OBJECT_ID === "string" ? record.OBJECT_ID : "",
    EPOCH: epoch,
    MEAN_MOTION: meanMotion,
    ECCENTRICITY: eccentricity,
    INCLINATION: inclination,
    RA_OF_ASC_NODE: raan,
    ARG_OF_PERICENTER: argPer,
    MEAN_ANOMALY: meanAnomaly,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: record.CLASSIFICATION_TYPE === "C" ? "C" : "U",
    NORAD_CAT_ID: norad,
    ELEMENT_SET_NO: needNumber("ELEMENT_SET_NO", 0),
    ...(record.REV_AT_EPOCH !== undefined ? { REV_AT_EPOCH: needNumber("REV_AT_EPOCH", 0) } : {}),
    BSTAR: needNumber("BSTAR", 0),
    MEAN_MOTION_DOT: needNumber("MEAN_MOTION_DOT", 0),
    MEAN_MOTION_DDOT: needNumber("MEAN_MOTION_DDOT", 0),
  };
}

export function satrecEpochDate(satrec: SatRec): Date {
  const year = satrec.epochyr < 57 ? satrec.epochyr + 2000 : satrec.epochyr + 1900;
  const jan1 = Date.UTC(year, 0, 1);
  return new Date(jan1 + (satrec.epochdays - 1) * 86_400_000);
}

function parseUtcEpoch(value: string): Date {
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid OMM epoch: ${value}`);
  return date;
}

function copyVec(value: { x: number; y: number; z: number }): CartesianKm {
  return { x: value.x, y: value.y, z: value.z };
}

function magnitude(v: CartesianKm): number {
  return Math.hypot(v.x, v.y, v.z);
}

function assertDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new TypeError("Expected a valid Date");
}

function validateWindow(start: Date, end: Date): void {
  assertDate(start);
  assertDate(end);
  if (end.getTime() <= start.getTime()) throw new RangeError("end must be after start");
}
