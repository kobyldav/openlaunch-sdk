export type Position = readonly [longitude: number, latitude: number];
export type BBox = readonly [west: number, south: number, east: number, north: number];

export interface GeoPoint {
  type: "Point";
  coordinates: Position;
}

export interface GeoPolygon {
  type: "Polygon";
  coordinates: readonly (readonly Position[])[];
}

export interface GeoMultiPolygon {
  type: "MultiPolygon";
  coordinates: readonly (readonly (readonly Position[])[])[];
}

export type Geometry = GeoPoint | GeoPolygon | GeoMultiPolygon;

export interface AreaOfInterest {
  geometry: Geometry;
  bbox: BBox;
}

const EARTH_RADIUS_M = 6_378_137;

export function point(longitude: number, latitude: number): AreaOfInterest {
  assertLongitude(longitude);
  assertLatitude(latitude);
  return { geometry: { type: "Point", coordinates: [longitude, latitude] }, bbox: [longitude, latitude, longitude, latitude] };
}

export function bbox(west: number, south: number, east: number, north: number): AreaOfInterest {
  assertLongitude(west); assertLongitude(east); assertLatitude(south); assertLatitude(north);
  if (south > north) throw new RangeError("south must be <= north");
  if (west > east) throw new RangeError("antimeridian-spanning bbox is not supported by bbox(); use polygon() instead");
  const ring: Position[] = [[west,south],[east,south],[east,north],[west,north],[west,south]];
  return { geometry: { type: "Polygon", coordinates: [ring] }, bbox: [west, south, east, north] };
}

export function polygon(ring: readonly Position[]): AreaOfInterest {
  if (ring.length < 3) throw new RangeError("polygon requires at least three positions");
  const closed = samePosition(ring[0]!, ring[ring.length - 1]!) ? [...ring] : [...ring, ring[0]!];
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lon, lat] of closed) {
    assertLongitude(lon); assertLatitude(lat);
    west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return { geometry: { type: "Polygon", coordinates: [closed] }, bbox: [west, south, east, north] };
}

export function circle(center: Position, radiusKm: number, vertices = 64): AreaOfInterest {
  const [lon, lat] = center;
  assertLongitude(lon); assertLatitude(lat);
  if (!(radiusKm > 0)) throw new RangeError("radiusKm must be > 0");
  if (!Number.isInteger(vertices) || vertices < 12) throw new RangeError("vertices must be an integer >= 12");
  const angular = radiusKm * 1000 / EARTH_RADIUS_M;
  const lat1 = radians(lat), lon1 = radians(lon);
  const ring: Position[] = [];
  for (let i = 0; i <= vertices; i++) {
    const bearing = 2 * Math.PI * i / vertices;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([normalizeLongitude(degrees(lon2)), degrees(lat2)]);
  }
  return polygon(ring);
}

export function centerOf(aoi: AreaOfInterest): Position {
  const [west, south, east, north] = aoi.bbox;
  return [(west + east) / 2, (south + north) / 2];
}

export function toGeoJson(aoi: AreaOfInterest): Geometry { return aoi.geometry; }

export function areaKm2Approx(aoi: AreaOfInterest): number {
  const [west, south, east, north] = aoi.bbox;
  const midLat = radians((south + north) / 2);
  const width = radians(east - west) * EARTH_RADIUS_M * Math.cos(midLat);
  const height = radians(north - south) * EARTH_RADIUS_M;
  return Math.abs(width * height) / 1_000_000;
}

function samePosition(a: Position, b: Position): boolean { return a[0] === b[0] && a[1] === b[1]; }
function normalizeLongitude(value: number): number { return ((value + 540) % 360) - 180; }
function assertLatitude(value: number): void { if (!Number.isFinite(value) || value < -90 || value > 90) throw new RangeError("latitude must be within [-90, 90]"); }
function assertLongitude(value: number): void { if (!Number.isFinite(value) || value < -180 || value > 180) throw new RangeError("longitude must be within [-180, 180]"); }
const radians = (deg: number): number => deg * Math.PI / 180;
const degrees = (rad: number): number => rad * 180 / Math.PI;
