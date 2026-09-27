import { MemoryCache, type CacheAdapter } from "./cache.js";
import { HttpClient, type HttpTelemetryEvent } from "./http.js";
import type { Query, ThrottleStatus } from "./types.js";
import { isRecord, num, str } from "./utils.js";
import { AgenciesResource } from "./resources/agencies.js";
import { AstronautsResource } from "./resources/astronauts.js";
import { EventsResource } from "./resources/events.js";
import { GenericResource } from "./resources/generic.js";
import { LaunchesResource } from "./resources/launches.js";
import { PadsResource } from "./resources/pads.js";
import { RocketsResource } from "./resources/rockets.js";
import { ConfigResource, RawResource } from "./resources/raw.js";
import { CelesTrakClient } from "./providers/celestrak.js";
import { NasaClient } from "./providers/nasa.js";
import { LL2_CONFIG_ENDPOINTS, LL2_DEVELOPMENT_BASE_URL, LL2_ENDPOINTS, LL2_PRODUCTION_BASE_URL } from "./providers/ll2.js";

export const PRODUCTION_BASE_URL = LL2_PRODUCTION_BASE_URL;
export const DEVELOPMENT_BASE_URL = LL2_DEVELOPMENT_BASE_URL;

export interface OpenLaunchOptions {
  baseUrl?: string;
  apiKey?: string;
  nasaApiKey?: string;
  fetch?: typeof fetch;
  cache?: CacheAdapter | false;
  cacheTtlMs?: number;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  maxConcurrency?: number;
  minRequestIntervalMs?: number;
  headers?: Record<string, string>;
  onTelemetry?: (event: HttpTelemetryEvent) => void;
}

export class OpenLaunch {
  readonly launches: LaunchesResource;
  readonly rockets: RocketsResource;
  readonly agencies: AgenciesResource;
  readonly astronauts: AstronautsResource;
  readonly events: EventsResource;
  readonly pads: PadsResource;

  /** Backwards-compatible normalized generic resources. */
  readonly spacecraft: GenericResource;
  readonly spaceStations: GenericResource;
  readonly celestialBodies: GenericResource;
  readonly dockingEvents: GenericResource;
  readonly expeditions: GenericResource;
  readonly payloads: GenericResource;
  readonly programs: GenericResource;

  /** Complete LL2 raw surface, including every primary 2.3.0 collection. */
  readonly ll2: Record<keyof typeof LL2_ENDPOINTS, RawResource>;
  /** Complete LL2 configuration/reference tables. */
  readonly config: Record<keyof typeof LL2_CONFIG_ENDPOINTS, ConfigResource>;

  readonly nasa: NasaClient;
  readonly celestrak: CelesTrakClient;

  private readonly http: HttpClient;

  constructor(options: OpenLaunchOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error("No fetch implementation available. Pass { fetch } to OpenLaunch().");
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.apiKey) headers.Authorization = `Token ${options.apiKey}`;
    const cache = options.cache === false ? undefined : (options.cache ?? new MemoryCache(2_000));
    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? PRODUCTION_BASE_URL,
      fetchImpl,
      ...(cache ? { cache } : {}),
      cacheTtlMs: options.cacheTtlMs ?? 5 * 60_000,
      retries: options.retries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 500,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxConcurrency: options.maxConcurrency ?? 6,
      minRequestIntervalMs: options.minRequestIntervalMs ?? 0,
      deduplicate: true,
      circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 },
      headers,
      ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}),
    });

    this.launches = new LaunchesResource(this.http);
    this.rockets = new RocketsResource(this.http);
    this.agencies = new AgenciesResource(this.http);
    this.astronauts = new AstronautsResource(this.http);
    this.events = new EventsResource(this.http);
    this.pads = new PadsResource(this.http);
    this.spacecraft = new GenericResource(this.http, "spacecraft");
    this.spaceStations = new GenericResource(this.http, "space_stations");
    this.celestialBodies = new GenericResource(this.http, "celestial_bodies");
    this.dockingEvents = new GenericResource(this.http, "docking_events");
    this.expeditions = new GenericResource(this.http, "expeditions");
    this.payloads = new GenericResource(this.http, "payloads");
    this.programs = new GenericResource(this.http, "programs");

    this.ll2 = Object.fromEntries(Object.entries(LL2_ENDPOINTS).map(([key, endpoint]) => [key, new RawResource(this.http, endpoint)])) as Record<keyof typeof LL2_ENDPOINTS, RawResource>;
    this.config = Object.fromEntries(Object.entries(LL2_CONFIG_ENDPOINTS).map(([key, endpoint]) => [key, new ConfigResource(this.http, endpoint)])) as Record<keyof typeof LL2_CONFIG_ENDPOINTS, ConfigResource>;

    const sharedProviderOptions = { fetch: fetchImpl, ...(options.cache === false ? { cache: false as const } : cache ? { cache } : {}), ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}), ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}) };
    this.nasa = new NasaClient({ ...sharedProviderOptions, ...(options.nasaApiKey ? { apiKey: options.nasaApiKey } : {}) });
    this.celestrak = new CelesTrakClient(sharedProviderOptions);
  }

  raw<T = unknown>(path: string, query: Query = {}): Promise<T> { return this.http.get<T>(path, query); }
  resource<T = Record<string, unknown>>(endpoint: string): RawResource<T> { return new RawResource<T>(this.http, endpoint.replace(/^\/+|\/+$/g, "")); }
  root(): Promise<Record<string, string>> { return this.http.get<Record<string, string>>(""); }
  starshipDashboard(): Promise<unknown> { return this.http.get("dashboard/starship/"); }

  async throttle(): Promise<ThrottleStatus | null> {
    const raw = await this.http.get<unknown>("api-throttle/");
    const entry = Array.isArray(raw) ? raw[0] : raw;
    if (!isRecord(entry)) return null;
    const requestLimit = num(entry.your_request_limit);
    const frequencySeconds = num(entry.limit_frequency_secs);
    const currentUse = num(entry.current_use);
    const nextUseSeconds = num(entry.next_use_secs);
    const identity = str(entry.ident);
    if ([requestLimit, frequencySeconds, currentUse, nextUseSeconds].some((v) => v === undefined) || !identity) return null;
    return { requestLimit: requestLimit!, frequencySeconds: frequencySeconds!, currentUse: currentUse!, nextUseSeconds: nextUseSeconds!, identity };
  }
}

export { OpenLaunch as SpaceClient };
