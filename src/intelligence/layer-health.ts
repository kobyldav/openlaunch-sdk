import { isVerifiedImageBytes } from "../providers/image-validation.js";
import type { GibsLayerId, NasaGibsClient } from "../providers/gibs.js";
import type { MeteosatClient, MeteosatMapOptions } from "../providers/meteosat.js";

/** Optional, single-image provider check; does not assert a capture date. */
export type SpaceImageProbe =
  | { source: "nasa-gibs"; layer: GibsLayerId; date: Date | string; z: number; x: number; y: number }
  | { source: "meteosat"; map: MeteosatMapOptions };

export interface SpaceImageAvailability {
  provider: "nasa-gibs" | "eumetsat";
  status: "available" | "unavailable" | "error";
  checkedAt: string;
  /** Always null unless a separate trusted provider acquisition record is obtained. */
  observedAt: null;
  verifiedAcquisition: false;
  contentType: string | null;
  imageBytes: number | null;
  /** Request time is NEVER an acquisition timestamp. */
  requestedTime: string | null;
  details: string;
}
export interface SpaceImageProbeClients {
  gibs: Pick<NasaGibsClient, "fetchTile">;
  meteosat: Pick<MeteosatClient, "fetchMap">;
}
export async function probeSpaceImage(
  clients: SpaceImageProbeClients,
  request: SpaceImageProbe,
  now: () => Date = () => new Date(),
): Promise<SpaceImageAvailability> {
  const provider = request.source === "nasa-gibs" ? "nasa-gibs" : "eumetsat";
  const date = request.source === "nasa-gibs"
    ? (request.date instanceof Date ? request.date : new Date(request.date))
    : request.map.time === undefined ? null
      : (request.map.time instanceof Date ? request.map.time : new Date(request.map.time));
  if (date !== null && !Number.isFinite(date.getTime())) throw new RangeError("Invalid image probe date");
  const requestedTime = date?.toISOString() ?? null;
  try {
    const result = request.source === "nasa-gibs"
      ? await clients.gibs.fetchTile(request.layer, request.date, request.z, request.x, request.y)
      : await clients.meteosat.fetchMap(request.map);
    if (!isVerifiedImageBytes(result.image, result.contentType))
      throw new Error("Provider did not return valid image magic bytes");
    return {
      provider, status: "available", checkedAt: now().toISOString(),
      observedAt: null, verifiedAcquisition: false, contentType: result.contentType,
      imageBytes: result.image.byteLength, requestedTime,
      details: "Image bytes confirmed; acquisition time, AOI coverage and freshness are not verified.",
    };
  } catch (error) {
    const unavailable = error instanceof Error && /\b(?:HTTP 404|HTTP 410)\b/.test(error.message);
    return {
      provider, status: unavailable ? "unavailable" : "error", checkedAt: now().toISOString(),
      observedAt: null, verifiedAcquisition: false, contentType: null, imageBytes: null, requestedTime,
      details: unavailable ? "Provider returned HTTP 404/410 for this image."
        : "Image probe failed; this is not proof that the satellite made no observation.",
    };
  }
}
