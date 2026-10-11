import type { CelesTrakClient, OmmRecord } from "../providers/celestrak.js";
import { OrbitEngine } from "../orbit/engine.js";
import { Sgp4Satellite } from "../orbit/sgp4.js";
import { closestApproach, findCloseApproaches } from "./conjunction.js";
import type {
  CatalogScreenOptions,
  CloseApproachSearchOptions,
  ClosestApproach,
  ClosestApproachOptions,
  NearestObject,
} from "./types.js";

export class TrafficEngine {
  constructor(
    private readonly celestrak: CelesTrakClient,
    private readonly orbit: OrbitEngine,
  ) {}

  closestApproach(
    primary: Sgp4Satellite,
    secondary: Sgp4Satellite,
    options: ClosestApproachOptions,
  ): ClosestApproach {
    return closestApproach(primary, secondary, options);
  }

  closeApproaches(
    primary: Sgp4Satellite,
    secondary: Sgp4Satellite,
    options: CloseApproachSearchOptions,
  ): ClosestApproach[] {
    return findCloseApproaches(primary, secondary, options);
  }

  screen(
    primary: Sgp4Satellite,
    candidates: readonly Sgp4Satellite[],
    options: CatalogScreenOptions,
  ): ClosestApproach[] {
    if (!(options.thresholdKm > 0)) throw new RangeError("thresholdKm must be > 0");
    const maxResults = options.maxResults ?? 100;
    const results: ClosestApproach[] = [];

    for (const candidate of candidates) {
      if (sameSatellite(primary, candidate)) continue;
      try {
        const event = closestApproach(primary, candidate, options);
        if (event.missDistanceKm <= options.thresholdKm) results.push(event);
      } catch {
        // Bad/decayed element sets should not abort a bounded catalog screen.
      }
    }

    return results
      .sort((a, b) => a.missDistanceKm - b.missDistanceKm)
      .slice(0, maxResults);
  }

  screenRecords(
    primary: Sgp4Satellite,
    records: readonly OmmRecord[],
    options: CatalogScreenOptions,
  ): ClosestApproach[] {
    const maxObjects = options.maxObjects ?? records.length;
    const candidates = records
      .slice(0, maxObjects)
      .flatMap((record) => {
        try {
          return [this.orbit.fromOmm(record)];
        } catch {
          return [];
        }
      });
    return this.screen(primary, candidates, options);
  }

  async screenGroup(
    primary: Sgp4Satellite,
    group: string,
    options: CatalogScreenOptions,
  ): Promise<ClosestApproach[]> {
    const maxObjects = options.maxObjects ?? 2_000;
    const records = await this.celestrak.byGroup(group);
    return this.screenRecords(primary, records.slice(0, maxObjects), {
      ...options,
      maxObjects,
    });
  }

  nearestAt(
    primary: Sgp4Satellite,
    candidates: readonly Sgp4Satellite[],
    at: Date,
    limit = 10,
  ): NearestObject[] {
    const p = primary.stateAt(at);
    const output: NearestObject[] = [];

    for (const candidate of candidates) {
      if (sameSatellite(primary, candidate)) continue;
      try {
        const s = candidate.stateAt(at);
        const dx = s.positionTemeKm.x - p.positionTemeKm.x;
        const dy = s.positionTemeKm.y - p.positionTemeKm.y;
        const dz = s.positionTemeKm.z - p.positionTemeKm.z;
        const dvx = s.velocityTemeKmS.x - p.velocityTemeKmS.x;
        const dvy = s.velocityTemeKmS.y - p.velocityTemeKmS.y;
        const dvz = s.velocityTemeKmS.z - p.velocityTemeKmS.z;
        output.push({
          satellite: candidate.sourceInfo,
          distanceKm: Math.hypot(dx, dy, dz),
          relativeSpeedKmS: Math.hypot(dvx, dvy, dvz),
          at: new Date(at),
        });
      } catch {
        // Ignore unpropagatable catalog entries.
      }
    }

    return output.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, Math.max(0, limit));
  }
}

function sameSatellite(a: Sgp4Satellite, b: Sgp4Satellite): boolean {
  const ac = a.sourceInfo.noradCatalogId;
  const bc = b.sourceInfo.noradCatalogId;
  return ac !== undefined && bc !== undefined ? ac === bc : a === b;
}
