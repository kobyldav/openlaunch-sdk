import type { StacAsset, StacItem } from "../providers/stac.js";

export interface SceneScore {
  item: StacItem;
  score: number;
  cloudCoverPercent?: number;
  datetime?: Date;
  reasons: string[];
}

export function sceneDatetime(item: StacItem): Date | undefined {
  const raw = item.properties.datetime ?? item.properties.start_datetime;
  if (typeof raw !== "string") return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function sceneCloudCover(item: StacItem): number | undefined {
  const raw = item.properties["eo:cloud_cover"];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function rankScenes(items: readonly StacItem[], options: { preferRecent?: boolean; maxCloudCoverPercent?: number; now?: Date } = {}): SceneScore[] {
  const preferRecent = options.preferRecent ?? true;
  const now = options.now ?? new Date();
  const maxCloud = options.maxCloudCoverPercent ?? 100;
  const scored: SceneScore[] = [];

  for (const item of items) {
    const cloud = sceneCloudCover(item);
    if (cloud !== undefined && cloud > maxCloud) continue;
    const datetime = sceneDatetime(item);
    const reasons: string[] = [];
    let score = 100;

    if (cloud !== undefined) {
      score -= Math.min(80, cloud * 0.8);
      if (cloud <= 10) reasons.push("very low catalog cloud cover");
      else if (cloud <= 30) reasons.push("moderate catalog cloud cover");
      else reasons.push("high catalog cloud cover");
    } else {
      score -= 15;
      reasons.push("catalog does not expose eo:cloud_cover");
    }

    if (preferRecent && datetime) {
      const ageDays = Math.max(0, (now.getTime() - datetime.getTime()) / 86_400_000);
      score -= Math.min(20, ageDays / 30);
      if (ageDays <= 7) reasons.push("recent acquisition");
    }

    const entry: SceneScore = { item, score: Math.max(0, Math.min(100, score)), reasons };
    if (cloud !== undefined) entry.cloudCoverPercent = cloud;
    if (datetime) entry.datetime = datetime;
    scored.push(entry);
  }

  return scored.sort((a, b) => b.score - a.score);
}

export function latestClearScene(items: readonly StacItem[], maxCloudCoverPercent = 20): StacItem | undefined {
  return rankScenes(items, { maxCloudCoverPercent, preferRecent: true })[0]?.item;
}

export function assetByRole(item: StacItem, role: string): StacAsset | undefined {
  return Object.values(item.assets).find((asset) => asset.roles?.includes(role));
}

export function assetByMediaType(item: StacItem, mediaType: string): StacAsset | undefined {
  return Object.values(item.assets).find((asset) => asset.type === mediaType);
}

export function commonVisualAsset(item: StacItem): StacAsset | undefined {
  return item.assets.visual ?? item.assets.rendered_preview ?? item.assets.thumbnail ??
    assetByRole(item, "visual") ?? assetByRole(item, "overview");
}
