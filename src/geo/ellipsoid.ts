export const WGS84 = Object.freeze({ a: 6_378_137, f: 1 / 298.257223563, b: 6_356_752.314245, e2: 6.69437999014e-3 });
export interface GeodeticPosition { latitudeDeg: number; longitudeDeg: number; altitudeM: number; }
export function geodeticToEcef(position: GeodeticPosition): readonly [number,number,number] {
  const lat = position.latitudeDeg * Math.PI / 180, lon = position.longitudeDeg * Math.PI / 180;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
  const x = (n + position.altitudeM) * cosLat * Math.cos(lon);
  const y = (n + position.altitudeM) * cosLat * Math.sin(lon);
  const z = (n * (1 - WGS84.e2) + position.altitudeM) * sinLat;
  return [x, y, z];
}

