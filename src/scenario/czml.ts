import type { Sgp4Satellite } from "../orbit/sgp4.js";

export interface CzmlSatelliteOptions {
  id?: string;
  name?: string;
  start: Date;
  end: Date;
  stepSeconds?: number;
  pathWidth?: number;
  maxPoints?: number;
}

export type CzmlPacket = Record<string, unknown>;

export function satelliteToCzml(
  satellite: Sgp4Satellite,
  options: CzmlSatelliteOptions,
): CzmlPacket[] {
  validateWindow(options.start, options.end);
  const stepSeconds = options.stepSeconds ?? 30;
  const maxPoints = options.maxPoints ?? 20_000;
  const durationSeconds = (options.end.getTime() - options.start.getTime()) / 1000;
  const estimated = Math.floor(durationSeconds / stepSeconds) + 2;
  if (!(stepSeconds > 0)) throw new RangeError("stepSeconds must be > 0");
  if (estimated > maxPoints) {
    throw new RangeError(`CZML export would contain ~${estimated} samples; increase stepSeconds or maxPoints`);
  }

  const epoch = options.start;
  const cartesian: number[] = [];
  for (let ms = options.start.getTime(); ms <= options.end.getTime();) {
    const time = new Date(ms);
    const state = satellite.stateAt(time);
    cartesian.push(
      (ms - epoch.getTime()) / 1000,
      state.positionEcfKm.x * 1000,
      state.positionEcfKm.y * 1000,
      state.positionEcfKm.z * 1000,
    );
    if (ms === options.end.getTime()) break;
    ms = Math.min(ms + stepSeconds * 1000, options.end.getTime());
  }

  const identity = satellite.sourceInfo;
  const id = options.id ?? (identity.noradCatalogId !== undefined ? `norad-${identity.noradCatalogId}` : "satellite");
  const name = options.name ?? identity.name ?? id;
  const availability = `${options.start.toISOString()}/${options.end.toISOString()}`;

  return [
    {
      id: "document",
      name: "OpenLaunch orbital scenario",
      version: "1.0",
      clock: {
        interval: availability,
        currentTime: options.start.toISOString(),
        multiplier: 60,
        range: "LOOP_STOP",
        step: "SYSTEM_CLOCK_MULTIPLIER",
      },
    },
    {
      id,
      name,
      availability,
      position: {
        epoch: epoch.toISOString(),
        referenceFrame: "FIXED",
        interpolationAlgorithm: "LAGRANGE",
        interpolationDegree: 5,
        cartesian,
      },
      point: {
        pixelSize: 8,
        outlineWidth: 1,
      },
      path: {
        show: true,
        width: options.pathWidth ?? 2,
        leadTime: Math.min(5_400, durationSeconds),
        trailTime: Math.min(5_400, durationSeconds),
        resolution: stepSeconds,
      },
      label: {
        text: name,
        show: true,
        font: "12px sans-serif",
        pixelOffset: { cartesian2: [10, -10] },
      },
      properties: {
        noradCatalogId: identity.noradCatalogId,
        objectId: identity.objectId,
        elementEpoch: identity.epoch.toISOString(),
        propagation: satellite.satrec.method === "d" ? "SDP4" : "SGP4",
        frameNote: "TEME propagated state rotated to Earth-fixed coordinates using GMST; no polar-motion/EOP correction.",
      },
    },
  ];
}

export function mergeCzml(...documents: readonly CzmlPacket[][]): CzmlPacket[] {
  const packets: CzmlPacket[] = [];
  let documentPacket: CzmlPacket | undefined;
  for (const doc of documents) {
    for (const packet of doc) {
      if (packet.id === "document") {
        documentPacket ??= packet;
      } else {
        packets.push(packet);
      }
    }
  }
  return [documentPacket ?? { id: "document", version: "1.0" }, ...packets];
}

function validateWindow(start: Date, end: Date): void {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new RangeError("CZML export requires a valid start < end");
  }
}
