import type { CacheAdapter } from "../cache.js";
import { MemoryCache } from "../cache.js";
import { HttpClient, type HttpTelemetryEvent } from "../http.js";
import type { Query } from "../types.js";

export type CelesTrakFormat = "JSON" | "JSON-PRETTY" | "CSV" | "XML" | "KVN" | "TLE" | "2LE" | "3LE";
export interface CelesTrakQuery { catnr?: string | number; intdes?: string; group?: string; name?: string; special?: string; format?: CelesTrakFormat; }
export interface OmmRecord {
  OBJECT_NAME?: string; OBJECT_ID?: string; EPOCH?: string; MEAN_MOTION?: number; ECCENTRICITY?: number; INCLINATION?: number;
  RA_OF_ASC_NODE?: number; ARG_OF_PERICENTER?: number; MEAN_ANOMALY?: number; EPHEMERIS_TYPE?: number; CLASSIFICATION_TYPE?: string;
  NORAD_CAT_ID?: number; ELEMENT_SET_NO?: number; REV_AT_EPOCH?: number; BSTAR?: number; MEAN_MOTION_DOT?: number; MEAN_MOTION_DDOT?: number;
  [key: string]: unknown;
}
export interface CelesTrakOptions { fetch?: typeof fetch; cache?: CacheAdapter | false; cacheTtlMs?: number; timeoutMs?: number; onTelemetry?: (event: HttpTelemetryEvent) => void; }

function queryToParams(query: CelesTrakQuery, defaultFormat: CelesTrakFormat = "JSON"): Query {
  const out: Query = { FORMAT: query.format ?? defaultFormat };
  if (query.catnr !== undefined) out.CATNR = query.catnr;
  if (query.intdes) out.INTDES = query.intdes;
  if (query.group) out.GROUP = query.group;
  if (query.name) out.NAME = query.name;
  if (query.special) out.SPECIAL = query.special;
  return out;
}

export class CelesTrakClient {
  private readonly http: HttpClient;
  constructor(options: CelesTrakOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error("No fetch implementation available");
    const cache = options.cache === false ? undefined : options.cache ?? new MemoryCache(200);
    this.http = new HttpClient({ baseUrl: "https://celestrak.org/NORAD/elements/", fetchImpl, ...(cache ? { cache } : {}), cacheTtlMs: options.cacheTtlMs ?? 30 * 60_000, retries: 2, retryDelayMs: 750, timeoutMs: options.timeoutMs ?? 30_000, headers: {}, maxConcurrency: 2, minRequestIntervalMs: 250, deduplicate: true, circuitBreaker: { failureThreshold: 4, cooldownMs: 30_000 }, ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}) });
  }
  gp(query: CelesTrakQuery): Promise<OmmRecord[]> { return this.http.get<OmmRecord[]>("gp.php", queryToParams(query)); }
  first(query: CelesTrakQuery): Promise<OmmRecord[]> { return this.http.get<OmmRecord[]>("gp-first.php", queryToParams(query)); }
  byCatalogNumber(catnr: string | number): Promise<OmmRecord[]> { return this.gp({ catnr }); }
  byInternationalDesignator(intdes: string): Promise<OmmRecord[]> { return this.gp({ intdes }); }
  byGroup(group: string): Promise<OmmRecord[]> { return this.gp({ group }); }
  byName(name: string): Promise<OmmRecord[]> { return this.gp({ name }); }
  special(special: "GPZ" | "GPZ-PLUS" | "DECAYING" | string): Promise<OmmRecord[]> { return this.gp({ special }); }
  stations(): Promise<OmmRecord[]> { return this.byGroup("STATIONS"); }
  active(): Promise<OmmRecord[]> { return this.byGroup("ACTIVE"); }
  starlink(): Promise<OmmRecord[]> { return this.byGroup("STARLINK"); }
  gpsOperational(): Promise<OmmRecord[]> { return this.byGroup("GPS-OPS"); }
  galileo(): Promise<OmmRecord[]> { return this.byGroup("GALILEO"); }
  geoActive(): Promise<OmmRecord[]> { return this.byGroup("GEO"); }
  cubesats(): Promise<OmmRecord[]> { return this.byGroup("CUBESAT"); }
  weather(): Promise<OmmRecord[]> { return this.byGroup("WEATHER"); }
  science(): Promise<OmmRecord[]> { return this.byGroup("SCIENCE"); }
  async text(query: CelesTrakQuery, format: CelesTrakFormat = "TLE"): Promise<string> { return this.http.get<string>("gp.php", queryToParams({ ...query, format }, format), {}, { bypassCache: false }); }
  async supplemental(query: CelesTrakQuery & { source?: string; file?: string }): Promise<OmmRecord[]> {
    const q = queryToParams(query);
    if (query.source) q.SOURCE = query.source;
    if (query.file) q.FILE = query.file;
    return this.http.get<OmmRecord[]>("supplemental/sup-gp.php", q);
  }
}

import { BODIES } from "../science/constants.js";
import { orbitalElementsToState, solveKepler, trueAnomalyFromEccentric, type OrbitalElements, type StateVector } from "../science/orbits.js";
import { toRadians } from "../science/units.js";

/** Convert a CelesTrak OMM mean-element record to a two-body element set. This is NOT SGP4 propagation. */
export function ommToOrbitalElements(record: OmmRecord, mu = BODIES.earth.mu): OrbitalElements {
  const meanMotionRevDay = Number(record.MEAN_MOTION);
  const eccentricity = Number(record.ECCENTRICITY);
  const inclinationRad = toRadians(Number(record.INCLINATION));
  const raanRad = toRadians(Number(record.RA_OF_ASC_NODE));
  const argumentOfPeriapsisRad = toRadians(Number(record.ARG_OF_PERICENTER));
  const meanAnomalyRad = toRadians(Number(record.MEAN_ANOMALY));
  if (![meanMotionRevDay, eccentricity, inclinationRad, raanRad, argumentOfPeriapsisRad, meanAnomalyRad].every(Number.isFinite)) throw new Error("OMM record is missing required mean elements");
  const n = meanMotionRevDay * 2 * Math.PI / 86400;
  const semiMajorAxisM = (mu / (n * n)) ** (1 / 3);
  const eccentricAnomaly = solveKepler(meanAnomalyRad, eccentricity);
  const trueAnomalyRad = trueAnomalyFromEccentric(eccentricAnomaly, eccentricity);
  const semiLatusRectumM = semiMajorAxisM * (1 - eccentricity ** 2);
  const specificAngularMomentum = Math.sqrt(mu * semiLatusRectumM);
  return { semiMajorAxisM, eccentricity, inclinationRad, raanRad, argumentOfPeriapsisRad, trueAnomalyRad, semiLatusRectumM, specificAngularMomentum, specificOrbitalEnergy: -mu / (2 * semiMajorAxisM) };
}

/** Approximate state vector from OMM using Keplerian elements only. For operational satellite tracking use a validated SGP4 implementation. */
export function ommToApproximateState(record: OmmRecord, mu = BODIES.earth.mu): StateVector { return orbitalElementsToState(ommToOrbitalElements(record, mu), mu); }
