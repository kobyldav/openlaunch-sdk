import type { Sgp4Satellite } from "../orbit/sgp4.js";
import type { Sgp4State } from "../orbit/types.js";
import { mergeCzml, satelliteToCzml, type CzmlPacket } from "./czml.js";

export interface ScenarioSatellite {
  id: string;
  satellite: Sgp4Satellite;
  name?: string;
}

export interface ScenarioSnapshotObject {
  id: string;
  name?: string;
  state: Sgp4State;
}

export class OrbitScenario {
  readonly start: Date;
  readonly end: Date;
  private readonly objects: ScenarioSatellite[] = [];

  constructor(start: Date, end: Date) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new RangeError("OrbitScenario requires a valid start < end");
    }
    this.start = new Date(start);
    this.end = new Date(end);
  }

  addSatellite(id: string, satellite: Sgp4Satellite, name?: string): this {
    if (!id.trim()) throw new TypeError("scenario satellite id cannot be empty");
    if (this.objects.some((item) => item.id === id)) throw new Error(`Scenario already contains id ${id}`);
    this.objects.push({
      id,
      satellite,
      ...(name ? { name } : {}),
    });
    return this;
  }

  list(): readonly ScenarioSatellite[] {
    return this.objects;
  }

  snapshot(at: Date): ScenarioSnapshotObject[] {
    if (at < this.start || at > this.end) throw new RangeError("snapshot time lies outside scenario interval");
    return this.objects.map((item) => ({
      id: item.id,
      ...(item.name ? { name: item.name } : {}),
      state: item.satellite.stateAt(at),
    }));
  }

  toCzml(stepSeconds = 30): CzmlPacket[] {
    return mergeCzml(
      ...this.objects.map((item) =>
        satelliteToCzml(item.satellite, {
          id: item.id,
          ...(item.name ? { name: item.name } : {}),
          start: this.start,
          end: this.end,
          stepSeconds,
        }),
      ),
    );
  }
}
