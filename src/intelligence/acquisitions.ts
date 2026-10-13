import type { SensorAccessWindow } from "../sensors/types.js";
import type { StacItem } from "../providers/stac.js";
import { sceneDatetime } from "../eo/scenes.js";

export interface AccessCatalogMatch {
  sceneId: string;
  sceneTime: Date;
  accessWindowStart: Date;
  accessWindowEnd: Date;
  closestTime: Date;
  temporalOffsetSeconds: number;
  platformMetadata?: string;
  platformMatchesRequest: boolean | null;
  confidence: "time-and-platform" | "time-only";
  acquisitionProvedForExactAoi: false;
}
export interface AccessCatalogReport {
  matches: AccessCatalogMatch[];
  unmatchedSceneIds: string[];
  unmatchedWindowCount: number;
  warnings: string[];
  /** Catalog scene time correlation alone is not confirmation of instrument imaging intent. */
  acquisitionProved: false;
}
export interface AccessCatalogOptions {
  expectedPlatform?: string;
  toleranceSeconds?: number;
}

/**
 * Correlates catalog acquisitions with modeled swath access in a time window.
 * STAC items MUST come from a spatially filtered query for the target AOI.
 * Only a time/platform match is established; not exact pixel coverage.
 */
export function reconcileAccessWithScenes(
  windows: readonly SensorAccessWindow[],
  scenes: readonly StacItem[],
  options: AccessCatalogOptions = {},
): AccessCatalogReport {
  const toleranceMs = (options.toleranceSeconds ?? 90) * 1_000;
  if (!(Number.isFinite(toleranceMs) && toleranceMs >= 0 && toleranceMs <= 3_600_000)) {
    throw new RangeError("toleranceSeconds must be in [0, 3600]");
  }
  const platform = options.expectedPlatform?.trim().toLowerCase();
  const matches: AccessCatalogMatch[] = [];
  const unmatchedSceneIds: string[] = [];
  const usedWindows = new Set<number>();

  for (const scene of scenes) {
    const time = sceneDatetime(scene);
    if (!time) { unmatchedSceneIds.push(scene.id); continue; }
    const rawPlatform = scene.properties.platform;
    const scenePlatform = typeof rawPlatform === "string" ? rawPlatform.trim().toLowerCase() : undefined;
    const platformMatchesRequest = platform === undefined || scenePlatform === undefined
      ? null : platform === scenePlatform;
    // A conflicting platform must not be attributed to the modeled satellite.
    if (platformMatchesRequest === false) { unmatchedSceneIds.push(scene.id); continue; }

    let bestIndex = -1;
    let bestOffset = Infinity;
    windows.forEach((window, i) => {
      const left = window.start.getTime() - toleranceMs;
      const right = window.end.getTime() + toleranceMs;
      if (time.getTime() < left || time.getTime() > right) return;
      const dt = Math.abs(time.getTime() - window.closest.getTime());
      if (dt < bestOffset) { bestOffset=dt; bestIndex=i; }
    });
    if (bestIndex < 0) { unmatchedSceneIds.push(scene.id); continue; }
    const window = windows[bestIndex]!;
    usedWindows.add(bestIndex);
    matches.push({
      sceneId: scene.id,
      sceneTime: new Date(time),
      accessWindowStart: window.start,
      accessWindowEnd: window.end,
      closestTime: window.closest,
      temporalOffsetSeconds: (time.getTime() - window.closest.getTime()) / 1000,
      ...(scenePlatform ? { platformMetadata: scenePlatform } : {}),
      platformMatchesRequest,
      confidence: platformMatchesRequest === true ? "time-and-platform" : "time-only",
      acquisitionProvedForExactAoi: false,
    });
  }
  return {
    matches, unmatchedSceneIds, unmatchedWindowCount: windows.length - usedWindows.size,
    acquisitionProved: false,
    warnings: [
      "STAC scene datetime and modeled swath access can correlate without confirming exact target pixels or imaging command.",
      "An exact satellite platform check requires scene.properties.platform metadata and caller-provided expectedPlatform.",
      "No atmospheric quality check, cloud-mask sampling, footprint intersection refinement, or target tasking data is applied.",
    ],
  };
}
