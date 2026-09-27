import { normalizeDegrees } from "./units.js";

export const J2000_JULIAN_DATE = 2451545.0;
export function toJulianDate(date: Date): number { return date.getTime() / 86_400_000 + 2440587.5; }
export function fromJulianDate(jd: number): Date { return new Date((jd - 2440587.5) * 86_400_000); }
export function julianCenturiesSinceJ2000(date: Date): number { return (toJulianDate(date) - J2000_JULIAN_DATE) / 36525; }
export function gmstDegrees(date: Date): number {
  const jd = toJulianDate(date);
  const t = (jd - 2451545.0) / 36525.0;
  return normalizeDegrees(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - t * t * t / 38710000);
}
export function gmstRadians(date: Date): number { return gmstDegrees(date) * Math.PI / 180; }
export function localSiderealDegrees(date: Date, longitudeDegrees: number): number { return normalizeDegrees(gmstDegrees(date) + longitudeDegrees); }
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000) + 1;
}
export function addSeconds(date: Date, seconds: number): Date { return new Date(date.getTime() + seconds * 1000); }
export function secondsBetween(a: Date, b: Date): number { return (b.getTime() - a.getTime()) / 1000; }
export function unixSeconds(date: Date): number { return date.getTime() / 1000; }
export function fromUnixSeconds(seconds: number): Date { return new Date(seconds * 1000); }
export function durationParts(totalSeconds: number): { days: number; hours: number; minutes: number; seconds: number } {
  let s = Math.floor(Math.abs(totalSeconds));
  const days = Math.floor(s / 86400); s %= 86400;
  const hours = Math.floor(s / 3600); s %= 3600;
  const minutes = Math.floor(s / 60); s %= 60;
  return { days, hours, minutes, seconds: s };
}
