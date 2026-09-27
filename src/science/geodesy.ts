import { PHYSICS } from "./constants.js";
import { add3, rotateZ3, sub3, type Vec3 } from "./vector.js";
import { gmstRadians } from "./time.js";
import { toDegrees, toRadians } from "./units.js";

export const WGS84 = Object.freeze({ a: 6_378_137, f: 1 / 298.257223563, b: 6_356_752.314245, e2: 6.69437999014e-3 });
export interface GeodeticPosition { latitudeDeg: number; longitudeDeg: number; altitudeM: number; }
export interface LookAngles { azimuthDeg: number; elevationDeg: number; rangeM: number; }

export function geodeticToEcef(position: GeodeticPosition): Vec3 {
  const lat = toRadians(position.latitudeDeg), lon = toRadians(position.longitudeDeg);
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
  const x = (n + position.altitudeM) * cosLat * Math.cos(lon);
  const y = (n + position.altitudeM) * cosLat * Math.sin(lon);
  const z = (n * (1 - WGS84.e2) + position.altitudeM) * sinLat;
  return [x, y, z];
}

export function ecefToGeodetic(ecef: Vec3): GeodeticPosition {
  const [x, y, z] = ecef;
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - WGS84.e2));
  let alt = 0;
  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat);
    const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
    alt = p / Math.max(1e-12, Math.cos(lat)) - n;
    const next = Math.atan2(z, p * (1 - WGS84.e2 * n / (n + alt)));
    if (Math.abs(next - lat) < 1e-12) { lat = next; break; }
    lat = next;
  }
  return { latitudeDeg: toDegrees(lat), longitudeDeg: toDegrees(lon), altitudeM: alt };
}

export function haversineDistanceM(a: Pick<GeodeticPosition, "latitudeDeg" | "longitudeDeg">, b: Pick<GeodeticPosition, "latitudeDeg" | "longitudeDeg">, radiusM = WGS84.a): number {
  const p1 = toRadians(a.latitudeDeg), p2 = toRadians(b.latitudeDeg);
  const dp = p2 - p1, dl = toRadians(b.longitudeDeg - a.longitudeDeg);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function initialBearingDeg(a: Pick<GeodeticPosition, "latitudeDeg" | "longitudeDeg">, b: Pick<GeodeticPosition, "latitudeDeg" | "longitudeDeg">): number {
  const p1 = toRadians(a.latitudeDeg), p2 = toRadians(b.latitudeDeg), dl = toRadians(b.longitudeDeg - a.longitudeDeg);
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}
export function destinationPoint(origin: Pick<GeodeticPosition, "latitudeDeg" | "longitudeDeg">, bearingDeg: number, distanceM: number, radiusM = WGS84.a): GeodeticPosition {
  const p1 = toRadians(origin.latitudeDeg), l1 = toRadians(origin.longitudeDeg), br = toRadians(bearingDeg), d = distanceM / radiusM;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { latitudeDeg: toDegrees(p2), longitudeDeg: ((toDegrees(l2) + 540) % 360) - 180, altitudeM: 0 };
}
export function horizonDistanceM(altitudeM: number, radiusM = WGS84.a): number { return Math.sqrt(Math.max(0, 2 * radiusM * altitudeM + altitudeM * altitudeM)); }
export function eciToEcef(eci: Vec3, date: Date): Vec3 { return rotateZ3(eci, -gmstRadians(date)); }
export function ecefToEci(ecef: Vec3, date: Date): Vec3 { return rotateZ3(ecef, gmstRadians(date)); }
export function earthRotationSurfaceSpeed(latitudeDeg: number): number { return PHYSICS.earthRotationRate * WGS84.a * Math.cos(toRadians(latitudeDeg)); }
export function lookAngles(observer: GeodeticPosition, targetEcef: Vec3): LookAngles {
  const obs = geodeticToEcef(observer);
  const d = sub3(targetEcef, obs);
  const lat = toRadians(observer.latitudeDeg), lon = toRadians(observer.longitudeDeg);
  const east = -Math.sin(lon) * d[0] + Math.cos(lon) * d[1];
  const north = -Math.sin(lat) * Math.cos(lon) * d[0] - Math.sin(lat) * Math.sin(lon) * d[1] + Math.cos(lat) * d[2];
  const up = Math.cos(lat) * Math.cos(lon) * d[0] + Math.cos(lat) * Math.sin(lon) * d[1] + Math.sin(lat) * d[2];
  const range = Math.hypot(east, north, up);
  const az = (toDegrees(Math.atan2(east, north)) + 360) % 360;
  const el = toDegrees(Math.asin(up / Math.max(range, 1e-12)));
  return { azimuthDeg: az, elevationDeg: el, rangeM: range };
}
export function relativeEcef(a: GeodeticPosition, b: GeodeticPosition): Vec3 { return sub3(geodeticToEcef(b), geodeticToEcef(a)); }
export function midpointEcef(a: GeodeticPosition, b: GeodeticPosition): GeodeticPosition { const ea = geodeticToEcef(a), eb = geodeticToEcef(b); return ecefToGeodetic(add3(ea, eb).map((v) => v / 2) as unknown as Vec3); }
