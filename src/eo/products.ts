import type { StacAsset, StacItem } from "../providers/stac.js";
import { sceneCloudCover, sceneDatetime } from "./scenes.js";

/** An asset is a catalog pointer, not downloaded/decoded image pixels. */
export type EoLayerKind = "rgb" | "optical-band" | "radar" | "thermal" | "quality-mask" | "elevation" | "preview" | "other";
export interface EoAssetInfo {
  key: string;
  href: string;
  mediaType?: string;
  roles: readonly string[];
  kind: EoLayerKind;
  bandNames: readonly string[];
  groundSampleDistanceM?: number;
  resolutionSource: "asset-gsd" | "item-gsd" | "unspecified";
  description?: string;
  requiresAuthenticationOrSigning: "unknown";
}
export interface EoProduct {
  id: string;
  collection?: string;
  acquiredAt?: Date;
  sceneCloudCoverPercent?: number;
  /** This is the catalog scene average, NOT cloud cover over user's AOI. */
  sceneCloudIsAoiSpecific: false;
  assets: EoAssetInfo[];
  availableResolutionsM: number[];
  availableKinds: EoLayerKind[];
  warnings: string[];
}
export type EoLayerSelection = "visible" | "thermal" | "radar" | "elevation" | "mask" | "preview";

export function inspectEoProduct(item: StacItem): EoProduct {
  const assets = Object.entries(item.assets ?? {}).map(([key, value]) => inspectEoAsset(key, value, item));
  const at = sceneDatetime(item);
  const cloud = sceneCloudCover(item);
  const warnings = [
    "Catalog asset links may expire, require authorization, or require a provider-specific signing request.",
    "Ground sample distance is catalog metadata, not an image returned at that resolution.",
    "Catalog scene cloud percentage does not establish cloud-free pixels in a requested location.",
  ];
  return {
    id: item.id,
    ...(item.collection ? { collection: item.collection } : {}),
    ...(at ? { acquiredAt: at } : {}),
    ...(cloud !== undefined ? { sceneCloudCoverPercent: cloud } : {}),
    sceneCloudIsAoiSpecific: false,
    assets,
    availableResolutionsM: [...new Set(assets.flatMap(a => a.groundSampleDistanceM === undefined ? [] : [a.groundSampleDistanceM]))].sort((a, b) => a - b),
    availableKinds: [...new Set(assets.map(a => a.kind))],
    warnings,
  };
}

/** Resolve existing assets only. Never invent a thermal layer or higher resolution. */
export function selectEoAssets(product: EoProduct, layer: EoLayerSelection): EoAssetInfo[] {
  const kinds: Record<EoLayerSelection, readonly EoLayerKind[]> = {
    visible: ["rgb", "optical-band"],
    thermal: ["thermal"],
    radar: ["radar"],
    elevation: ["elevation"],
    mask: ["quality-mask"],
    preview: ["preview", "rgb"],
  };
  const matches = product.assets.filter(asset => kinds[layer].includes(asset.kind));
  return layer === "preview"
    ? matches.sort((a, b) => (a.kind === "preview" ? -1 : 0) - (b.kind === "preview" ? -1 : 0))
    : matches;
}

export function inspectEoAsset(key: string, asset: StacAsset, item?: StacItem): EoAssetInfo {
  const bands = Array.isArray(asset["eo:bands"]) ? asset["eo:bands"] : [];
  const bandNames = bands.flatMap(b => {
    if (typeof b !== "object" || b === null) return [];
    const raw = b as Record<string, unknown>;
    return typeof raw.name === "string" ? [raw.name] : [];
  });
  const roles = asset.roles ?? [];
  const mediaType = typeof asset.type === "string" ? asset.type : undefined;
  const assetGsd = positive(asset.gsd);
  const itemGsd = positive(item?.properties?.gsd);
  const groundSampleDistanceM = assetGsd ?? itemGsd;
  const resolutionSource = assetGsd !== undefined ? "asset-gsd" : itemGsd !== undefined ? "item-gsd" : "unspecified";
  const text = [key, asset.title ?? "", ...bandNames].join(" ").toLowerCase();
  const kind: EoLayerKind =
    (item?.collection?.includes("dem") && roles.includes("data")) ? "elevation" :
    (item?.collection?.includes("sentinel-1") && roles.includes("data")) ? "radar" :
    /(^|[ _-])(scl|qa|mask|classification|cloud|fmask|data_mask)([ _-]|$)/i.test(text) || roles.includes("mask") ? "quality-mask" :
    /(^|[ _-])(thermal|tir|tirs|st_b1[01]|lst|brightness.temperature)([ _-]|$)/i.test(text) ? "thermal" :
    /(^|[ _-])(dem|dsm|dtm|elevation|terrain)([ _-]|$)/i.test(text) ? "elevation" :
    /(^|[ _-])(vv|vh|hh|hv|sigma0|gamma0)([ _-]|$)/i.test(text) ? "radar" :
    roles.includes("thumbnail") || /thumbnail|preview|overview/.test(text) ? "preview" :
    roles.includes("visual") || /(^|[ _-])(visual|rgb|true.color)([ _-]|$)/i.test(text) ? "rgb" :
    roles.includes("data") && bandNames.length > 0 ? "optical-band" : "other";
  return {
    key, href: asset.href, roles: [...roles], kind, bandNames,
    ...(mediaType ? { mediaType } : {}),
    ...(groundSampleDistanceM !== undefined ? { groundSampleDistanceM } : {}),
    resolutionSource,
    ...(asset.title ? { description: asset.title } : {}),
    requiresAuthenticationOrSigning: "unknown",
  };
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
