import type { Sgp4Satellite } from "../orbit/sgp4.js";
import {
  closestApproachTrajectoryToSatellite,
  SampledTemeTrajectory,
} from "./trajectory.js";
import type { TrajectoryClosestApproach } from "./types.js";

export interface AuditedEncounter {
  approach: TrajectoryClosestApproach;
  withinThreshold: boolean;
  warnings: string[];
  /** Heuristic time needed to traverse half the requested threshold radius. */
  characteristicCrossingSeconds: number;
}
export interface TrajectoryScreenAudit {
  checked: number;
  succeeded: number;
  skipped: number;
  thresholdKm: number;
  encounters: AuditedEncounter[];
  failures: { satelliteName: string; reason: string }[];
  warnings: string[];
  operationalClearance: false;
}
export interface TrajectoryAuditOptions {
  thresholdKm: number;
  maxEphemerisAgeHours?: number;
  maxSatellites?: number;
}

/**
 * Returns nearest approach for each object regardless of threshold. Detects
 * under-resolved trajectory sampling and stale public elements; does NOT prove
 * no closer encounter occurred between trajectory interpolation samples.
 */
export function auditTrajectoryAgainstCatalog(
  trajectory: SampledTemeTrajectory,
  satellites: readonly Sgp4Satellite[],
  options: TrajectoryAuditOptions,
): TrajectoryScreenAudit {
  if (!(Number.isFinite(options.thresholdKm) && options.thresholdKm > 0)) throw new RangeError("thresholdKm must be > 0");
  const maxAge = options.maxEphemerisAgeHours ?? 72;
  if (!(Number.isFinite(maxAge) && maxAge > 0)) throw new RangeError("maxEphemerisAgeHours must be > 0");
  const maxSatellites = options.maxSatellites ?? 2_000;
  if (!(Number.isInteger(maxSatellites) && maxSatellites > 0)) throw new RangeError("maxSatellites must be a positive integer");
  if (satellites.length > maxSatellites) throw new RangeError("Satellite set exceeds maxSatellites: explicit bounded screening is required");

  const encounters: AuditedEncounter[] = [];
  const failures: TrajectoryScreenAudit["failures"] = [];
  for (const satellite of satellites) {
    try {
      const approach = closestApproachTrajectoryToSatellite(trajectory, satellite);
      const speed = approach.relativeSpeedKmS;
      const characteristicCrossingSeconds = speed > 0 ? options.thresholdKm / (2 * speed) : Infinity;
      const warnings: string[] = [];
      if (Math.abs(approach.satelliteElementAgeHours) > maxAge) {
        warnings.push("The propagated public GP element epoch is beyond the configured freshness threshold.");
      }
      if (trajectory.maxStepSeconds > characteristicCrossingSeconds) {
        warnings.push("Trajectory sample interval is large relative to the threshold crossing time; refine sampling and validate with independent ephemerides.");
      }
      encounters.push({
        approach, withinThreshold: approach.missDistanceKm <= options.thresholdKm,
        warnings, characteristicCrossingSeconds,
      });
    } catch (error) {
      failures.push({
        satelliteName: satellite.sourceInfo.name ?? String(satellite.sourceInfo.noradCatalogId ?? "unnamed"),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  encounters.sort((a,b) => a.approach.missDistanceKm - b.approach.missDistanceKm);
  const warnings = [
    "A modeled geometric miss distance is not collision probability or operational launch clearance.",
    "Only supplied catalog satellites were checked. The catalog can omit untracked or maneuvering objects.",
  ];
  if (failures.length) warnings.push("One or more satellites could not be propagated; screening is incomplete.");
  if (encounters.some(x=>x.warnings.length)) warnings.push("Some encounters have low-confidence timing or element freshness flags.");

  return {
    checked: satellites.length,
    succeeded: encounters.length,
    skipped: failures.length,
    thresholdKm: options.thresholdKm,
    encounters, failures, warnings, operationalClearance: false,
  };
}
