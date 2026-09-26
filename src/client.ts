import { MemoryCache, type CacheAdapter } from "./cache.js";
import { HttpClient } from "./http.js";
import type { Query, ThrottleStatus } from "./types.js";
import { isRecord, num, str } from "./utils.js";
import { AgenciesResource } from "./resources/agencies.js";
import { AstronautsResource } from "./resources/astronauts.js";
import { EventsResource } from "./resources/events.js";
import { GenericResource } from "./resources/generic.js";
import { LaunchesResource } from "./resources/launches.js";
import { PadsResource } from "./resources/pads.js";
import { RocketsResource } from "./resources/rockets.js";

export const PRODUCTION_BASE_URL = "https://ll.thespacedevs.com/2.3.0/";
export const DEVELOPMENT_BASE_URL = "https://lldev.thespacedevs.com/2.3.0/";

export interface OpenLaunchOptions {
  baseUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
  cache?: CacheAdapter | false;
  cacheTtlMs?: number;
  retries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
}

export class OpenLaunch {
  readonly launches: LaunchesResource;
  readonly rockets: RocketsResource;
  readonly agencies: AgenciesResource;
  readonly astronauts: AstronautsResource;
  readonly events: EventsResource;
  readonly pads: PadsResource;
  readonly spacecraft: GenericResource;
  readonly spaceStations: GenericResource;
  readonly celestialBodies: GenericResource;
  readonly dockingEvents: GenericResource;
  readonly expeditions: GenericResource;
  readonly payloads: GenericResource;
  readonly programs: GenericResource;

  private readonly http: HttpClient;

  constructor(options: OpenLaunchOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error("No fetch implementation available. Pass { fetch } to OpenLaunch().");
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.apiKey) headers.Authorization = `Token ${options.apiKey}`;
    const cache = options.cache === false ? undefined : (options.cache ?? new MemoryCache());
    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? PRODUCTION_BASE_URL,
      fetchImpl,
      ...(cache ? { cache } : {}),
      cacheTtlMs: options.cacheTtlMs ?? 5 * 60_000,
      retries: options.retries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 500,
      headers,
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
  }

  raw<T = unknown>(path: string, query: Query = {}): Promise<T> { return this.http.get<T>(path, query); }

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
