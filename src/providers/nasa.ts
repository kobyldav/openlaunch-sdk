import type { CacheAdapter } from "../cache.js";
import { MemoryCache } from "../cache.js";
import { HttpClient, type HttpTelemetryEvent } from "../http.js";
import type { Query } from "../types.js";

export interface NasaOptions { apiKey?: string; fetch?: typeof fetch; cache?: CacheAdapter | false; cacheTtlMs?: number; timeoutMs?: number; onTelemetry?: (event: HttpTelemetryEvent) => void; }
export class NasaClient {
  private readonly http: HttpClient;
  private readonly scienceHttp: HttpClient;
  readonly apiKey: string;
  constructor(options: NasaOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error("No fetch implementation available");
    this.apiKey = options.apiKey ?? "DEMO_KEY";
    const cache = options.cache === false ? undefined : options.cache ?? new MemoryCache(500);
    const common = { fetchImpl, ...(cache ? { cache } : {}), cacheTtlMs: options.cacheTtlMs ?? 10 * 60_000, retries: 2, retryDelayMs: 500, timeoutMs: options.timeoutMs ?? 30_000, headers: {}, maxConcurrency: 4, deduplicate: true, circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 } as const, ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}) };
    this.http = new HttpClient({ baseUrl: "https://api.nasa.gov/", ...common });
    this.scienceHttp = new HttpClient({ baseUrl: "https://science.nasa.gov/wp-json/wp/v2/", ...common });
  }
  raw<T = unknown>(path: string, query: Query = {}): Promise<T> { return this.http.get<T>(path, { ...query, api_key: query.api_key ?? this.apiKey }); }
  neoFeed(startDate: string, endDate?: string): Promise<unknown> { return this.raw("neo/rest/v1/feed", { start_date: startDate, end_date: endDate }); }
  neoLookup(id: string | number): Promise<unknown> { return this.raw(`neo/rest/v1/neo/${encodeURIComponent(String(id))}`); }
  neoBrowse(page = 0, size = 20): Promise<unknown> { return this.raw("neo/rest/v1/neo/browse", { page, size }); }
  donki(type: "CME" | "GST" | "IPS" | "FLR" | "SEP" | "MPC" | "RBE" | "HSS" | "WSAEnlilSimulations" | string, startDate?: string, endDate?: string): Promise<unknown> { return this.raw(`DONKI/${type}`, { startDate, endDate }); }
  epicNatural(date?: string): Promise<unknown> { return this.raw(date ? `EPIC/api/natural/date/${date}` : "EPIC/api/natural"); }
  epicEnhanced(date?: string): Promise<unknown> { return this.raw(date ? `EPIC/api/enhanced/date/${date}` : "EPIC/api/enhanced"); }
  techTransfer(query: string): Promise<unknown> { return this.raw("techtransfer/patent/", { q: query }); }
  apodCurrent(query: Query = {}): Promise<unknown> { return this.scienceHttp.get("apod-basic", query); }
}
