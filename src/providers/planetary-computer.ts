import type { CacheAdapter } from "../cache.js";
import { MemoryCache } from "../cache.js";
import { HttpClient, type HttpTelemetryEvent } from "../http.js";
import { createPlanetaryComputerStac, type StacAsset, type StacClient, type StacItem } from "./stac.js";

export interface PlanetaryComputerOptions {
  fetch?: typeof fetch;
  cache?: CacheAdapter | false;
  cacheTtlMs?: number;
  subscriptionKey?: string;
  timeoutMs?: number;
  onTelemetry?: (event: HttpTelemetryEvent) => void;
}

export interface PlanetarySignedLink {
  href: string;
  "msft:expiry"?: string;
}

export interface PlanetarySasToken {
  token: string;
  "msft:expiry"?: string;
}

export const PLANETARY_COMPUTER_COLLECTIONS = Object.freeze({
  sentinel2L2a: "sentinel-2-l2a",
  sentinel1Rtc: "sentinel-1-rtc",
  landsatC2L2: "landsat-c2-l2",
  modis09A1: "modis-09A1-061",
});

export class PlanetaryComputerClient {
  readonly stac: StacClient;
  private readonly http: HttpClient;

  constructor(options: PlanetaryComputerOptions = {}) {
    const fetchImpl = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    if (!fetchImpl) throw new Error("No fetch implementation available");
    const cache = options.cache === false ? undefined : options.cache ?? new MemoryCache(300);
    const headers: Record<string, string> = {};
    if (options.subscriptionKey) headers["Ocp-Apim-Subscription-Key"] = options.subscriptionKey;

    this.stac = createPlanetaryComputerStac({
      fetch: fetchImpl,
      ...(options.cache === false ? { cache: false as const } : cache ? { cache } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}),
    });

    this.http = new HttpClient({
      baseUrl: "https://planetarycomputer.microsoft.com/api/sas/v1/",
      fetchImpl,
      ...(cache ? { cache } : {}),
      cacheTtlMs: options.cacheTtlMs ?? 20 * 60_000,
      retries: 2,
      retryDelayMs: 500,
      timeoutMs: options.timeoutMs ?? 20_000,
      headers,
      maxConcurrency: 4,
      minRequestIntervalMs: 0,
      deduplicate: true,
      circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 },
      ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}),
    });
  }

  signHref(href: string): Promise<PlanetarySignedLink> {
    return this.http.get<PlanetarySignedLink>("sign", { href });
  }

  tokenForCollection(collectionId: string): Promise<PlanetarySasToken> {
    return this.http.get<PlanetarySasToken>(`token/${encodeURIComponent(collectionId)}`);
  }

  async signAsset(asset: StacAsset): Promise<StacAsset> {
    const signed = await this.signHref(asset.href);
    return { ...asset, href: signed.href };
  }

  async signItem(item: StacItem): Promise<StacItem> {
    const assets: Record<string, StacAsset> = {};
    for (const [name, asset] of Object.entries(item.assets)) assets[name] = await this.signAsset(asset);
    return { ...item, assets };
  }

  async signItems(items: readonly StacItem[], maxConcurrency = 6): Promise<StacItem[]> {
    const output = new Array<StacItem>(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(maxConcurrency, items.length || 1)) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        output[index] = await this.signItem(items[index]!);
      }
    });
    await Promise.all(workers);
    return output;
  }
}
