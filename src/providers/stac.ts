import type { CacheAdapter } from "../cache.js";
import { MemoryCache } from "../cache.js";
import { HttpClient, type HttpTelemetryEvent } from "../http.js";
import type { BBox, Geometry } from "../geo/types.js";

export interface StacAsset {
  href: string;
  type?: string;
  title?: string;
  roles?: string[];
  "eo:bands"?: unknown[];
  [key: string]: unknown;
}

export interface StacLink {
  href: string;
  rel: string;
  type?: string;
  title?: string;
}

export interface StacItem {
  type: "Feature";
  stac_version?: string;
  id: string;
  collection?: string;
  bbox?: number[];
  geometry: Geometry | null;
  properties: Record<string, unknown> & {
    datetime?: string | null;
    start_datetime?: string;
    end_datetime?: string;
    "eo:cloud_cover"?: number;
  };
  assets: Record<string, StacAsset>;
  links?: StacLink[];
}

export interface StacFeatureCollection {
  type: "FeatureCollection";
  features: StacItem[];
  links?: StacLink[];
  context?: Record<string, unknown>;
  numberMatched?: number;
  numberReturned?: number;
}

export interface StacCollection {
  id: string;
  title?: string;
  description?: string;
  extent?: Record<string, unknown>;
  links?: StacLink[];
  license?: string;
  [key: string]: unknown;
}

export interface StacCollections {
  collections: StacCollection[];
  links?: StacLink[];
}

export interface StacSort {
  field: string;
  direction: "asc" | "desc";
}

export interface StacSearch {
  collections?: readonly string[];
  ids?: readonly string[];
  bbox?: BBox;
  intersects?: Geometry;
  datetime?: string | { from: Date | string; to: Date | string };
  limit?: number;
  query?: Record<string, unknown>;
  filter?: unknown;
  filterLang?: "cql2-json" | "cql2-text";
  sortby?: readonly StacSort[];
  fields?: { include?: readonly string[]; exclude?: readonly string[] };
}

export interface StacClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  cache?: CacheAdapter | false;
  cacheTtlMs?: number;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  onTelemetry?: (event: HttpTelemetryEvent) => void;
}

export class StacClient {
  private readonly http: HttpClient;

  constructor(options: StacClientOptions) {
    const fetchImpl = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    if (!fetchImpl) throw new Error("No fetch implementation available");
    const cache = options.cache === false ? undefined : options.cache ?? new MemoryCache(300);
    this.http = new HttpClient({
      baseUrl: options.baseUrl,
      fetchImpl,
      ...(cache ? { cache } : {}),
      cacheTtlMs: options.cacheTtlMs ?? 15 * 60_000,
      retries: options.retries ?? 2,
      retryDelayMs: 500,
      timeoutMs: options.timeoutMs ?? 30_000,
      headers: options.headers ?? {},
      maxConcurrency: 4,
      minRequestIntervalMs: 0,
      deduplicate: true,
      circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 },
      ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}),
    });
  }

  landing<T = Record<string, unknown>>(): Promise<T> {
    return this.http.get<T>("");
  }

  collections(): Promise<StacCollections> {
    return this.http.get<StacCollections>("collections");
  }

  collection(id: string): Promise<StacCollection> {
    return this.http.get<StacCollection>(`collections/${encodeURIComponent(id)}`);
  }

  item(collectionId: string, itemId: string): Promise<StacItem> {
    return this.http.get<StacItem>(`collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`);
  }

  async search(search: StacSearch): Promise<StacFeatureCollection> {
    const body: Record<string, unknown> = {};
    if (search.collections) body.collections = [...search.collections];
    if (search.ids) body.ids = [...search.ids];
    if (search.bbox) body.bbox = [...search.bbox];
    if (search.intersects) body.intersects = search.intersects;
    if (search.datetime !== undefined) body.datetime = formatDatetime(search.datetime);
    if (search.limit !== undefined) body.limit = search.limit;
    if (search.query !== undefined) body.query = search.query;
    if (search.filter !== undefined) body.filter = search.filter;
    if (search.filterLang !== undefined) body["filter-lang"] = search.filterLang;
    if (search.sortby) body.sortby = search.sortby.map((sort) => ({ field: sort.field, direction: sort.direction }));
    if (search.fields) body.fields = {
      ...(search.fields.include ? { include: [...search.fields.include] } : {}),
      ...(search.fields.exclude ? { exclude: [...search.fields.exclude] } : {}),
    };

    return this.http.request<StacFeatureCollection>(
      "POST",
      "search",
      { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      { bypassCache: true },
    );
  }

  async *searchPages(search: StacSearch, maxPages = 10): AsyncGenerator<StacFeatureCollection> {
    let page = await this.search(search);
    yield page;
    for (let index = 1; index < maxPages; index++) {
      const next = page.links?.find((link) => link.rel === "next");
      if (!next) return;
      page = await this.http.get<StacFeatureCollection>(next.href);
      yield page;
    }
  }

  async searchAll(search: StacSearch, maxItems = 500): Promise<StacItem[]> {
    const items: StacItem[] = [];
    for await (const page of this.searchPages(search, Math.max(1, Math.ceil(maxItems / Math.max(1, search.limit ?? 100)) + 1))) {
      for (const item of page.features) {
        items.push(item);
        if (items.length >= maxItems) return items;
      }
    }
    return items;
  }
}

export const STAC_ENDPOINTS = Object.freeze({
  copernicus: "https://stac.dataspace.copernicus.eu/v1/",
  planetaryComputer: "https://planetarycomputer.microsoft.com/api/stac/v1/",
});

export const COPERNICUS_COLLECTIONS = Object.freeze({
  sentinel1Grd: "sentinel-1-grd",
  sentinel2L2a: "sentinel-2-l2a",
});

export function createCopernicusStac(options: Omit<StacClientOptions, "baseUrl"> = {}): StacClient {
  return new StacClient({ baseUrl: STAC_ENDPOINTS.copernicus, ...options });
}

export function createPlanetaryComputerStac(options: Omit<StacClientOptions, "baseUrl"> = {}): StacClient {
  return new StacClient({ baseUrl: STAC_ENDPOINTS.planetaryComputer, ...options });
}

function formatDatetime(value: string | { from: Date | string; to: Date | string }): string {
  if (typeof value === "string") return value;
  return `${iso(value.from)}/${iso(value.to)}`;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
