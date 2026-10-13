import type { StacItem } from "../providers/stac.js";
import { inspectEoProduct, selectEoAssets, type EoAssetInfo } from "./products.js";

export interface EoDownloadOptions {
  fetch?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  /** Restrict egress to explicit trusted hosts when processing external STAC data. */
  allowedHosts?: readonly string[];
}
export interface EoAssetDownload {
  sourceItemId?: string;
  assetKey: string;
  /** Original remote binary: PNG/JPEG/TIFF/etc. Not decoded pixels. */
  bytes: Uint8Array;
  byteLength: number;
  contentType: string;
  decodedPixels: false;
}

/**
 * Fetch the bytes of a selected STAC asset with explicit transfer limits.
 * Does not sign URLs, decrypt, or decode COGs/GeoTIFF. A signed link must be
 * obtained via provider SDK before calling it if authorization is required.
 *
 * Redirects are rejected to avoid silently following arbitrary STAC origins.
 */
export async function downloadEoAsset(asset: EoAssetInfo, options: EoDownloadOptions = {}): Promise<EoAssetDownload> {
  const maxBytes = options.maxBytes ?? 12 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024)
    throw new RangeError("maxBytes must be in [1, 67108864]");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
    throw new RangeError("timeoutMs must be in [1, 120000]");
  const url = new URL(asset.href);
  if (url.protocol !== "https:") throw new TypeError("Only HTTPS asset downloads are supported");
  if (url.username || url.password) throw new TypeError("Embedded URL credentials are not allowed");
  if (isPrivateHostname(url.hostname)) throw new TypeError("Loopback/private IP asset hosts are not permitted");
  if (options.allowedHosts && !options.allowedHosts.includes(url.hostname)) {
    throw new TypeError("Asset host is not in allowedHosts");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error("No fetch implementation provided");
    const response = await fetchImpl(url.toString(), {
      method: "GET", redirect: "error", signal: controller.signal,
      headers: { Accept: "image/*,application/octet-stream;q=0.9" },
    });
    if (!response.ok) throw new Error("Asset HTTP request failed with status " + response.status);
    const declared = response.headers.get("content-length");
    if (declared && Number(declared) > maxBytes) throw new RangeError("Asset exceeds maxBytes based on Content-Length");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Asset response has no readable body");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        length += value.byteLength;
        if (length > maxBytes) {
          await reader.cancel("maxBytes exceeded");
          throw new RangeError("Asset download exceeds maxBytes");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return {
      assetKey: asset.key, bytes, byteLength: bytes.byteLength,
      contentType: response.headers.get("content-type") ?? asset.mediaType ?? "application/octet-stream",
      decodedPixels: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadEoPreview(item: StacItem, options: EoDownloadOptions = {}): Promise<EoAssetDownload> {
  const product = inspectEoProduct(item);
  const preview = selectEoAssets(product,"preview")[0];
  if (!preview) throw new Error("STAC item has no preview/visual asset; no image bytes were downloaded");
  const downloaded = await downloadEoAsset(preview, options);
  return { ...downloaded, sourceItemId: item.id };
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.includes(":")) return host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some(x=>!Number.isInteger(x) || x<0 || x>255)) return false;
  const a = parts[0]!, b = parts[1]!;
  return a===0 || a===10 || a===127 || a===169 && b===254 ||
    a===172 && b>=16 && b<=31 || a===192 && b===168 ||
    a===100 && b>=64 && b<=127 || a>=224;
}
