/**
 * Date and duration helpers
 *
 * Work with mission durations using Date objects and second-based helpers.
 *
 * Uses: durationParts, addSeconds, secondsBetween, dayOfYear
 * Network: no
 */
import { addSeconds, dayOfYear, durationParts, secondsBetween } from "../../src/index.js";

const start = new Date("2026-01-01T00:00:00Z");
const end = addSeconds(start, 123_456);
console.log({ end: end.toISOString(), elapsed: secondsBetween(start, end), parts: durationParts(123_456), dayOfYear: dayOfYear(end) });
