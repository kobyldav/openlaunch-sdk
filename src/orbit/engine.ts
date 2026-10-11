import type { CelesTrakClient, OmmRecord } from "../providers/celestrak.js";
import { findPasses, lookAnglesAt, nextPass } from "./passes.js";
import { Sgp4Satellite } from "./sgp4.js";
import type {
  GroundObserver,
  GroundTrackOptions,
  GroundTrackPoint,
  LookAngleState,
  PassSearchOptions,
  PassWindow,
  SatelliteIdentity,
} from "./types.js";

export class OrbitEngine {
  constructor(private readonly celestrak: CelesTrakClient) {}

  fromOmm(record: OmmRecord): Sgp4Satellite {
    return Sgp4Satellite.fromOmm(record);
  }

  fromTle(line1: string, line2: string, identity: SatelliteIdentity = {}): Sgp4Satellite {
    return Sgp4Satellite.fromTle(line1, line2, identity);
  }

  async byCatalogNumber(catalogNumber: number | string): Promise<Sgp4Satellite | null> {
    const [record] = await this.celestrak.byCatalogNumber(catalogNumber);
    return record ? Sgp4Satellite.fromOmm(record) : null;
  }

  async byName(name: string): Promise<Sgp4Satellite[]> {
    const records = await this.celestrak.byName(name);
    return records.map((record) => Sgp4Satellite.fromOmm(record));
  }

  async group(group: string, maxObjects = 1_000): Promise<Sgp4Satellite[]> {
    if (!(maxObjects > 0)) return [];
    const records = await this.celestrak.byGroup(group);
    return records.slice(0, maxObjects).flatMap((record) => {
      try {
        return [Sgp4Satellite.fromOmm(record)];
      } catch {
        return [];
      }
    });
  }

  lookAngles(satellite: Sgp4Satellite, observer: GroundObserver, time: Date): LookAngleState {
    return lookAnglesAt(satellite, observer, time);
  }

  passes(satellite: Sgp4Satellite, observer: GroundObserver, options: PassSearchOptions): PassWindow[] {
    return findPasses(satellite, observer, options);
  }

  nextPass(
    satellite: Sgp4Satellite,
    observer: GroundObserver,
    from = new Date(),
    searchHours = 48,
    minElevationDeg = 0,
  ): PassWindow | null {
    return nextPass(satellite, observer, from, searchHours, minElevationDeg);
  }

  groundTrack(satellite: Sgp4Satellite, options: GroundTrackOptions): GroundTrackPoint[] {
    return satellite.groundTrack(options);
  }
}
