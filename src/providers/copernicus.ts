import type { CacheAdapter } from "../cache.js";
import type { AreaOfInterest } from "../geo/types.js";
import {
  COPERNICUS_COLLECTIONS,
  createCopernicusStac,
  type StacClient,
  type StacFeatureCollection,
} from "./stac.js";

export interface CopernicusOptions {
  fetch?: typeof fetch;
  cache?: CacheAdapter | false;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface CopernicusProcessOptions {
  area: AreaOfInterest;
  dataType: "sentinel-2-l2a" | "sentinel-1-grd" | string;
  from: Date | string;
  to: Date | string;
  evalscript: string;
  width?: number;
  height?: number;
  format?: "image/png" | "image/jpeg" | "image/tiff";
  mosaickingOrder?: "mostRecent" | "leastRecent" | "leastCC";
  maxCloudCoverage?: number;
}

export interface ProcessedRaster {
  data: ArrayBuffer;
  contentType: string;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

export const COPERNICUS_ENDPOINTS = Object.freeze({
  token: "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
  process: "https://sh.dataspace.copernicus.eu/process/v1",
});

export class CopernicusClient {
  readonly stac: StacClient;
  private readonly fetchImpl: typeof fetch;
  private readonly staticToken?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private tokenCache?: { value: string; expiresAt: number };

  constructor(options: CopernicusOptions = {}) {
    const fetchImpl = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    if (!fetchImpl) throw new Error("No fetch implementation available");
    this.fetchImpl = fetchImpl;
    if (options.accessToken) this.staticToken = options.accessToken;
    if (options.clientId) this.clientId = options.clientId;
    if (options.clientSecret) this.clientSecret = options.clientSecret;
    this.stac = createCopernicusStac({
      fetch: fetchImpl,
      ...(options.cache === false ? { cache: false as const } : options.cache ? { cache: options.cache } : {}),
    });
  }

  searchSentinel2(area: AreaOfInterest, from: Date | string, to: Date | string, maxCloudCoverPercent = 30, limit = 20): Promise<StacFeatureCollection> {
    return this.stac.search({
      collections: [COPERNICUS_COLLECTIONS.sentinel2L2a],
      intersects: area.geometry,
      datetime: { from, to },
      limit,
      query: { "eo:cloud_cover": { lte: maxCloudCoverPercent } },
      sortby: [{ field: "properties.datetime", direction: "desc" }],
    });
  }

  searchSentinel1(area: AreaOfInterest, from: Date | string, to: Date | string, limit = 20): Promise<StacFeatureCollection> {
    return this.stac.search({
      collections: [COPERNICUS_COLLECTIONS.sentinel1Grd],
      intersects: area.geometry,
      datetime: { from, to },
      limit,
      sortby: [{ field: "properties.datetime", direction: "desc" }],
    });
  }

  async process(options: CopernicusProcessOptions): Promise<ProcessedRaster> {
    const token = await this.accessToken();
    const request = buildProcessRequest(options);
    const response = await this.fetchImpl(COPERNICUS_ENDPOINTS.process, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: options.format ?? "image/png",
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Copernicus Process API ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
    }
    return {
      data: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") ?? (options.format ?? "application/octet-stream"),
    };
  }

  trueColor(area: AreaOfInterest, from: Date | string, to: Date | string, options: { width?: number; height?: number; maxCloudCoverage?: number; format?: "image/png" | "image/jpeg" | "image/tiff" } = {}): Promise<ProcessedRaster> {
    return this.process({
      area,
      dataType: "sentinel-2-l2a",
      from,
      to,
      evalscript: TRUE_COLOR_EVALSCRIPT,
      width: options.width ?? 1024,
      height: options.height ?? 1024,
      mosaickingOrder: "leastCC",
      ...(options.maxCloudCoverage !== undefined ? { maxCloudCoverage: options.maxCloudCoverage } : {}),
      ...(options.format ? { format: options.format } : {}),
    });
  }

  ndvi(area: AreaOfInterest, from: Date | string, to: Date | string, options: { width?: number; height?: number; maxCloudCoverage?: number; format?: "image/png" | "image/tiff" } = {}): Promise<ProcessedRaster> {
    return this.process({
      area,
      dataType: "sentinel-2-l2a",
      from,
      to,
      evalscript: NDVI_EVALSCRIPT,
      width: options.width ?? 1024,
      height: options.height ?? 1024,
      mosaickingOrder: "leastCC",
      ...(options.maxCloudCoverage !== undefined ? { maxCloudCoverage: options.maxCloudCoverage } : {}),
      ...(options.format ? { format: options.format } : {}),
    });
  }

  private async accessToken(): Promise<string> {
    if (this.staticToken) return this.staticToken;
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) return this.tokenCache.value;
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Copernicus Process API requires accessToken or clientId + clientSecret. STAC search does not require these credentials.");
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const response = await this.fetchImpl(COPERNICUS_ENDPOINTS.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
    });
    if (!response.ok) throw new Error(`Copernicus OAuth ${response.status} ${response.statusText}: ${(await response.text()).slice(0, 500)}`);
    const token = await response.json() as TokenResponse;
    if (!token.access_token) throw new Error("Copernicus OAuth response did not include access_token");
    const ttlMs = Math.max(60_000, (token.expires_in ?? 3600) * 1000 - 60_000);
    this.tokenCache = { value: token.access_token, expiresAt: Date.now() + ttlMs };
    return token.access_token;
  }
}

export const TRUE_COLOR_EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: ["B02", "B03", "B04", "dataMask"], output: { bands: 4 } };
}
function evaluatePixel(sample) {
  return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02, sample.dataMask];
}`;

export const NDVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: ["B04", "B08", "dataMask"], output: { bands: 4 } };
}
function evaluatePixel(sample) {
  const ndvi = index(sample.B08, sample.B04);
  const value = Math.max(-1, Math.min(1, ndvi));
  const red = value < 0 ? 0.7 : Math.max(0, 0.8 - value);
  const green = value < 0 ? 0.2 : Math.min(1, 0.2 + value);
  const blue = value < 0 ? 0.2 : 0.1;
  return [red, green, blue, sample.dataMask];
}`;

export function buildProcessRequest(options: CopernicusProcessOptions): Record<string, unknown> {
  const dataFilter: Record<string, unknown> = {
    timeRange: { from: iso(options.from), to: iso(options.to) },
  };
  if (options.mosaickingOrder) dataFilter.mosaickingOrder = options.mosaickingOrder;
  if (options.maxCloudCoverage !== undefined) dataFilter.maxCloudCoverage = options.maxCloudCoverage;

  return {
    input: {
      bounds: {
        bbox: [...options.area.bbox],
        geometry: options.area.geometry,
        properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
      },
      data: [{ type: options.dataType, dataFilter }],
    },
    output: {
      width: options.width ?? 1024,
      height: options.height ?? 1024,
      responses: [{ identifier: "default", format: { type: options.format ?? "image/png" } }],
    },
    evalscript: options.evalscript,
  };
}

function iso(value: Date | string): string { return value instanceof Date ? value.toISOString() : value; }
