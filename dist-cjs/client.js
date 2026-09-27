"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpaceClient = exports.OpenLaunch = exports.DEVELOPMENT_BASE_URL = exports.PRODUCTION_BASE_URL = void 0;
const cache_js_1 = require("./cache.js");
const http_js_1 = require("./http.js");
const utils_js_1 = require("./utils.js");
const agencies_js_1 = require("./resources/agencies.js");
const astronauts_js_1 = require("./resources/astronauts.js");
const events_js_1 = require("./resources/events.js");
const generic_js_1 = require("./resources/generic.js");
const launches_js_1 = require("./resources/launches.js");
const pads_js_1 = require("./resources/pads.js");
const rockets_js_1 = require("./resources/rockets.js");
const raw_js_1 = require("./resources/raw.js");
const celestrak_js_1 = require("./providers/celestrak.js");
const nasa_js_1 = require("./providers/nasa.js");
const ll2_js_1 = require("./providers/ll2.js");
exports.PRODUCTION_BASE_URL = ll2_js_1.LL2_PRODUCTION_BASE_URL;
exports.DEVELOPMENT_BASE_URL = ll2_js_1.LL2_DEVELOPMENT_BASE_URL;
class OpenLaunch {
    launches;
    rockets;
    agencies;
    astronauts;
    events;
    pads;
    /** Backwards-compatible normalized generic resources. */
    spacecraft;
    spaceStations;
    celestialBodies;
    dockingEvents;
    expeditions;
    payloads;
    programs;
    /** Complete LL2 raw surface, including every primary 2.3.0 collection. */
    ll2;
    /** Complete LL2 configuration/reference tables. */
    config;
    nasa;
    celestrak;
    http;
    constructor(options = {}) {
        const fetchImpl = options.fetch ?? globalThis.fetch;
        if (!fetchImpl)
            throw new Error("No fetch implementation available. Pass { fetch } to OpenLaunch().");
        const headers = { ...(options.headers ?? {}) };
        if (options.apiKey)
            headers.Authorization = `Token ${options.apiKey}`;
        const cache = options.cache === false ? undefined : (options.cache ?? new cache_js_1.MemoryCache(2_000));
        this.http = new http_js_1.HttpClient({
            baseUrl: options.baseUrl ?? exports.PRODUCTION_BASE_URL,
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
        this.launches = new launches_js_1.LaunchesResource(this.http);
        this.rockets = new rockets_js_1.RocketsResource(this.http);
        this.agencies = new agencies_js_1.AgenciesResource(this.http);
        this.astronauts = new astronauts_js_1.AstronautsResource(this.http);
        this.events = new events_js_1.EventsResource(this.http);
        this.pads = new pads_js_1.PadsResource(this.http);
        this.spacecraft = new generic_js_1.GenericResource(this.http, "spacecraft");
        this.spaceStations = new generic_js_1.GenericResource(this.http, "space_stations");
        this.celestialBodies = new generic_js_1.GenericResource(this.http, "celestial_bodies");
        this.dockingEvents = new generic_js_1.GenericResource(this.http, "docking_events");
        this.expeditions = new generic_js_1.GenericResource(this.http, "expeditions");
        this.payloads = new generic_js_1.GenericResource(this.http, "payloads");
        this.programs = new generic_js_1.GenericResource(this.http, "programs");
        this.ll2 = Object.fromEntries(Object.entries(ll2_js_1.LL2_ENDPOINTS).map(([key, endpoint]) => [key, new raw_js_1.RawResource(this.http, endpoint)]));
        this.config = Object.fromEntries(Object.entries(ll2_js_1.LL2_CONFIG_ENDPOINTS).map(([key, endpoint]) => [key, new raw_js_1.ConfigResource(this.http, endpoint)]));
        const sharedProviderOptions = { fetch: fetchImpl, ...(options.cache === false ? { cache: false } : cache ? { cache } : {}), ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}), ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}) };
        this.nasa = new nasa_js_1.NasaClient({ ...sharedProviderOptions, ...(options.nasaApiKey ? { apiKey: options.nasaApiKey } : {}) });
        this.celestrak = new celestrak_js_1.CelesTrakClient(sharedProviderOptions);
    }
    raw(path, query = {}) { return this.http.get(path, query); }
    resource(endpoint) { return new raw_js_1.RawResource(this.http, endpoint.replace(/^\/+|\/+$/g, "")); }
    root() { return this.http.get(""); }
    starshipDashboard() { return this.http.get("dashboard/starship/"); }
    async throttle() {
        const raw = await this.http.get("api-throttle/");
        const entry = Array.isArray(raw) ? raw[0] : raw;
        if (!(0, utils_js_1.isRecord)(entry))
            return null;
        const requestLimit = (0, utils_js_1.num)(entry.your_request_limit);
        const frequencySeconds = (0, utils_js_1.num)(entry.limit_frequency_secs);
        const currentUse = (0, utils_js_1.num)(entry.current_use);
        const nextUseSeconds = (0, utils_js_1.num)(entry.next_use_secs);
        const identity = (0, utils_js_1.str)(entry.ident);
        if ([requestLimit, frequencySeconds, currentUse, nextUseSeconds].some((v) => v === undefined) || !identity)
            return null;
        return { requestLimit: requestLimit, frequencySeconds: frequencySeconds, currentUse: currentUse, nextUseSeconds: nextUseSeconds, identity };
    }
}
exports.OpenLaunch = OpenLaunch;
exports.SpaceClient = OpenLaunch;
//# sourceMappingURL=client.js.map