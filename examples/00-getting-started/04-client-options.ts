/**
 * Configure the client
 *
 * Configure caching, retry, timeouts, concurrency and telemetry. Keys are intentionally omitted from the example.
 *
 * Uses: OpenLaunch, MemoryCache, HttpTelemetryEvent
 * Network: no
 */
import { MemoryCache, OpenLaunch, type HttpTelemetryEvent } from "../../src/index.js";

const telemetry: HttpTelemetryEvent[] = [];
const space = new OpenLaunch({
  cache: new MemoryCache(1_000),
  cacheTtlMs: 5 * 60_000,
  retries: 3,
  retryDelayMs: 500,
  timeoutMs: 20_000,
  maxConcurrency: 4,
  minRequestIntervalMs: 100,
  onTelemetry(event) {
    telemetry.push(event);
  },
});

console.log("Configured OpenLaunch client", space.constructor.name, telemetry.length);
