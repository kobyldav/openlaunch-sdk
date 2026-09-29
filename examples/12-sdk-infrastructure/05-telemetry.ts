/**
 * Collect HTTP telemetry
 *
 * Observe requests, cache hits, retries and errors without modifying provider code.
 *
 * Uses: OpenLaunch, HttpTelemetryEvent
 * Network: yes
 */
import { OpenLaunch, type HttpTelemetryEvent } from "../../src/index.js";

const events: HttpTelemetryEvent[] = [];
const space = new OpenLaunch({ onTelemetry: (event) => events.push(event) });
await space.launches.next();
await space.launches.next(); // normally served from cache
console.table(events.map((event) => ({ type: event.type, url: "url" in event ? event.url : undefined })));
