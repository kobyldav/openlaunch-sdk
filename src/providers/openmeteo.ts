import type { CacheAdapter } from "../cache.js";
import { MemoryCache } from "../cache.js";
import { HttpClient, type HttpTelemetryEvent } from "../http.js";

export interface OpenMeteoOptions {
  fetch?: typeof fetch;
  cache?: CacheAdapter | false;
  cacheTtlMs?: number;
  timeoutMs?: number;
  onTelemetry?: (event: HttpTelemetryEvent) => void;
}

export interface WeatherForecastOptions {
  forecastDays?: number;
  pastDays?: number;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  models?: string | readonly string[];
}

export interface OpenMeteoHourly {
  time: string[];
  cloud_cover?: number[];
  cloud_cover_low?: number[];
  cloud_cover_mid?: number[];
  cloud_cover_high?: number[];
  visibility?: number[];
  precipitation_probability?: number[];
  precipitation?: number[];
  is_day?: number[];
  sunshine_duration?: number[];
  temperature_2m?: number[];
  relative_humidity_2m?: number[];
  [key: string]: unknown;
}

export interface OpenMeteoForecast {
  latitude: number;
  longitude: number;
  elevation?: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  hourly_units?: Record<string, string>;
  hourly: OpenMeteoHourly;
}

export interface ObservationWeather {
  time: Date;
  cloudCoverPercent?: number;
  cloudCoverLowPercent?: number;
  cloudCoverMidPercent?: number;
  cloudCoverHighPercent?: number;
  visibilityM?: number;
  precipitationProbabilityPercent?: number;
  precipitationMm?: number;
  isDay?: boolean;
  sunshineDurationSeconds?: number;
  temperatureC?: number;
  relativeHumidityPercent?: number;
}

export interface ObservationWeatherScore {
  score: number;
  conditions: ObservationWeather;
  reasons: string[];
}

const DEFAULT_HOURLY = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "visibility",
  "precipitation_probability",
  "precipitation",
  "is_day",
  "sunshine_duration",
  "temperature_2m",
  "relative_humidity_2m",
] as const;

export class OpenMeteoClient {
  private readonly http: HttpClient;

  constructor(options: OpenMeteoOptions = {}) {
    const fetchImpl = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    if (!fetchImpl) throw new Error("No fetch implementation available");
    const cache = options.cache === false ? undefined : options.cache ?? new MemoryCache(200);
    this.http = new HttpClient({
      baseUrl: "https://api.open-meteo.com/v1/",
      fetchImpl,
      ...(cache ? { cache } : {}),
      cacheTtlMs: options.cacheTtlMs ?? 10 * 60_000,
      retries: 2,
      retryDelayMs: 500,
      timeoutMs: options.timeoutMs ?? 20_000,
      headers: {},
      maxConcurrency: 3,
      minRequestIntervalMs: 0,
      deduplicate: true,
      circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 },
      ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}),
    });
  }

  forecast(latitude: number, longitude: number, options: WeatherForecastOptions = {}): Promise<OpenMeteoForecast> {
    assertLatLon(latitude, longitude);
    const query: Record<string, string | number | readonly string[]> = {
      latitude,
      longitude,
      hourly: DEFAULT_HOURLY,
      timezone: options.timezone ?? "UTC",
    };
    if (options.forecastDays !== undefined) query.forecast_days = clamp(Math.trunc(options.forecastDays), 1, 16);
    if (options.pastDays !== undefined) query.past_days = Math.max(0, Math.trunc(options.pastDays));
    if (options.startDate) query.start_date = options.startDate;
    if (options.endDate) query.end_date = options.endDate;
    if (options.models) query.models = typeof options.models === "string" ? options.models : [...options.models];
    return this.http.get<OpenMeteoForecast>("forecast", query);
  }

  async conditionsAt(latitude: number, longitude: number, when: Date, options: WeatherForecastOptions = {}): Promise<ObservationWeather | null> {
    const forecast = await this.forecast(latitude, longitude, options);
    return nearestObservation(forecast, when);
  }

  async bestOpticalWindows(
    latitude: number,
    longitude: number,
    options: WeatherForecastOptions & { maxCloudCoverPercent?: number; daylightOnly?: boolean; limit?: number } = {},
  ): Promise<ObservationWeatherScore[]> {
    const forecast = await this.forecast(latitude, longitude, options);
    const maxCloud = options.maxCloudCoverPercent ?? 30;
    const daylightOnly = options.daylightOnly ?? true;
    const results: ObservationWeatherScore[] = [];
    for (let i = 0; i < forecast.hourly.time.length; i++) {
      const conditions = observationAtIndex(forecast, i);
      const cloud = conditions.cloudCoverPercent ?? 100;
      if (cloud > maxCloud) continue;
      if (daylightOnly && conditions.isDay === false) continue;
      results.push(scoreOpticalWeather(conditions));
    }
    return results.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 24);
  }
}

export function nearestObservation(forecast: OpenMeteoForecast, when: Date): ObservationWeather | null {
  const times = forecast.hourly.time;
  if (!times.length) return null;
  let bestIndex = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < times.length; i++) {
    const parsed = parseOpenMeteoTime(times[i]!, forecast.timezone);
    const delta = Math.abs(parsed.getTime() - when.getTime());
    if (delta < bestDelta) { bestDelta = delta; bestIndex = i; }
  }
  return observationAtIndex(forecast, bestIndex);
}

export function scoreOpticalWeather(conditions: ObservationWeather): ObservationWeatherScore {
  const reasons: string[] = [];
  let score = 100;
  const cloud = conditions.cloudCoverPercent ?? 100;
  score -= cloud * 0.75;
  if (cloud <= 10) reasons.push("very low cloud cover");
  else if (cloud <= 30) reasons.push("usable cloud cover");
  else reasons.push("cloud cover may obstruct optical imagery");

  const visibilityKm = (conditions.visibilityM ?? 0) / 1000;
  if (visibilityKm >= 20) reasons.push("good surface visibility");
  else if (visibilityKm > 0) score -= Math.min(20, (20 - visibilityKm));

  const precip = conditions.precipitationProbabilityPercent ?? 0;
  score -= precip * 0.15;
  if (precip >= 40) reasons.push("precipitation risk");

  if (conditions.isDay === false) {
    score -= 50;
    reasons.push("nighttime is unsuitable for passive optical imaging");
  }
  return { score: clamp(score, 0, 100), conditions, reasons };
}

function observationAtIndex(forecast: OpenMeteoForecast, index: number): ObservationWeather {
  const h = forecast.hourly;
  const result: ObservationWeather = { time: parseOpenMeteoTime(h.time[index]!, forecast.timezone) };
  assignNumber(result, "cloudCoverPercent", h.cloud_cover?.[index]);
  assignNumber(result, "cloudCoverLowPercent", h.cloud_cover_low?.[index]);
  assignNumber(result, "cloudCoverMidPercent", h.cloud_cover_mid?.[index]);
  assignNumber(result, "cloudCoverHighPercent", h.cloud_cover_high?.[index]);
  assignNumber(result, "visibilityM", h.visibility?.[index]);
  assignNumber(result, "precipitationProbabilityPercent", h.precipitation_probability?.[index]);
  assignNumber(result, "precipitationMm", h.precipitation?.[index]);
  assignNumber(result, "sunshineDurationSeconds", h.sunshine_duration?.[index]);
  assignNumber(result, "temperatureC", h.temperature_2m?.[index]);
  assignNumber(result, "relativeHumidityPercent", h.relative_humidity_2m?.[index]);
  const isDay = h.is_day?.[index];
  if (typeof isDay === "number") result.isDay = isDay === 1;
  return result;
}

function assignNumber<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) target[key] = value as T[K];
}

function parseOpenMeteoTime(value: string, timezone?: string): Date {
  if (timezone === "UTC" && !/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return new Date(`${value}Z`);
  return new Date(value);
}

function assertLatLon(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RangeError("latitude must be within [-90, 90]");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RangeError("longitude must be within [-180, 180]");
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
