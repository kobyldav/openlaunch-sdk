/**
 * Julian date and sidereal time
 *
 * Convert UTC Date to Julian date and compute Greenwich/local sidereal angle.
 *
 * Uses: toJulianDate, fromJulianDate, gmstDegrees, localSiderealDegrees
 * Network: no
 */
import { fromJulianDate, gmstDegrees, localSiderealDegrees, toJulianDate } from "../../src/index.js";

const date = new Date("2026-09-29T00:00:00Z");
const jd = toJulianDate(date);
console.log({ jd, restored: fromJulianDate(jd).toISOString(), gmstDeg: gmstDegrees(date), lstDeg: localSiderealDegrees(date, 15) });
