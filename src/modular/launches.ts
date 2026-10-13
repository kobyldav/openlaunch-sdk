import { HttpClient, type HttpTelemetryEvent } from "../http.js";
import { MemoryCache, type CacheAdapter } from "../cache.js";
import { LaunchesResource } from "../resources/launches.js";
import { RocketsResource } from "../resources/rockets.js";
import { AgenciesResource } from "../resources/agencies.js";
import { AstronautsResource } from "../resources/astronauts.js";
import { EventsResource } from "../resources/events.js";
import { PadsResource } from "../resources/pads.js";
import { RawResource, ConfigResource } from "../resources/raw.js";
import { NasaClient } from "../providers/nasa.js";
import {
  LL2_CONFIG_ENDPOINTS, LL2_ENDPOINTS,
  LL2_PRODUCTION_BASE_URL, LL2_DEVELOPMENT_BASE_URL,
} from "../providers/ll2.js";

export interface LaunchDataClientOptions {
  baseUrl?:string;
  apiKey?:string;
  nasaApiKey?:string;
  fetch?: typeof fetch;
  cache?: CacheAdapter | false;
  cacheTtlMs?:number;
  timeoutMs?:number;
  retries?:number;
  headers?: Record<string,string>;
  onTelemetry?: (event:HttpTelemetryEvent)=>void;
}

/** Minimal LL2 + NASA public-data client. No science/orbit imports or dependencies. */
export class LaunchDataClient {
  readonly launches:LaunchesResource;
  readonly rockets:RocketsResource;
  readonly agencies:AgenciesResource;
  readonly astronauts:AstronautsResource;
  readonly events:EventsResource;
  readonly pads:PadsResource;
  readonly nasa:NasaClient;
  readonly ll2:Record<keyof typeof LL2_ENDPOINTS,RawResource>;
  readonly config:Record<keyof typeof LL2_CONFIG_ENDPOINTS,ConfigResource>;
  readonly http:HttpClient;
  static readonly PRODUCTION_BASE_URL=LL2_PRODUCTION_BASE_URL;
  static readonly DEVELOPMENT_BASE_URL=LL2_DEVELOPMENT_BASE_URL;
  constructor(options:LaunchDataClientOptions={}){
    const fetchImpl=options.fetch??globalThis.fetch;
    if(!fetchImpl)throw new Error("A Fetch API implementation is required");
    const cache=options.cache===false?undefined:options.cache??new MemoryCache(300);
    this.http=new HttpClient({
      baseUrl:options.baseUrl??LL2_PRODUCTION_BASE_URL,
      fetchImpl, ...(cache?{cache}:{}),
      cacheTtlMs:options.cacheTtlMs??300_000,
      timeoutMs:options.timeoutMs??30_000,
      retries:options.retries??2,retryDelayMs:500,
      headers:{
        ...(options.headers??{}),
        ...(options.apiKey?{Authorization:`Token ${options.apiKey}`}:{}),
      },
      maxConcurrency:4,deduplicate:true,
      circuitBreaker:{failureThreshold:5,cooldownMs:30_000},
      ...(options.onTelemetry?{onTelemetry:options.onTelemetry}:{}),
    });
    this.launches=new LaunchesResource(this.http);
    this.rockets=new RocketsResource(this.http);
    this.agencies=new AgenciesResource(this.http);
    this.astronauts=new AstronautsResource(this.http);
    this.events=new EventsResource(this.http);
    this.pads=new PadsResource(this.http);
    this.ll2=Object.fromEntries(Object.entries(LL2_ENDPOINTS).map(([key,p])=>[key,new RawResource(this.http,p)])) as Record<keyof typeof LL2_ENDPOINTS,RawResource>;
    this.config=Object.fromEntries(Object.entries(LL2_CONFIG_ENDPOINTS).map(([key,p])=>[key,new ConfigResource(this.http,p)])) as Record<keyof typeof LL2_CONFIG_ENDPOINTS,ConfigResource>;
    this.nasa=new NasaClient({
      fetch:fetchImpl,...(cache?{cache}:options.cache===false?{cache:false as const}:{}),
      ...(options.nasaApiKey?{apiKey:options.nasaApiKey}:{}),
    });
  }
}
