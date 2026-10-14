import { HttpClient, MemoryCache, query } from "@openlaunch/core";
import { EarthCatalogClient, SpaceMapClient, bbox, StacClient } from "@openlaunch/earth";
import { decodeGeoTiff, readCogWindowUrl, ndviRaster, type RasterGrid } from "@openlaunch/raster";
import { LaunchDataClient, LaunchesResource } from "@openlaunch/launches";
import { Sgp4Satellite, OrbitEngine, TrafficEngine } from "@openlaunch/orbit";
import { matrixMul, vec3, LinearKalmanFilter } from "@openlaunch/math";
import { simulateLaunch, sweepLaunchGuidance, type LaunchModel, type OrbitTarget } from "@openlaunch/engineering";

// Static TypeScript consumer smoke: every public entry resolves to matching
// declarations with no missing internal package subpaths or duplicate APIs.
const cache = new MemoryCache(10);
const http: HttpClient | undefined = undefined;
const builder = query().limit(2);
const earth = new EarthCatalogClient();
const maps = new SpaceMapClient();
const earthLayers = maps.layers("observations");
const area = bbox(14, 49.9, 14.1, 50);
const raster: RasterGrid = {
  width: 1, height: 1, crs: "EPSG:4326",
  transform: [14, 0.01, 0, 50, 0, -0.01],
  values: new Float64Array([1]),
};
const launches = new LaunchDataClient();
const orbit = OrbitEngine;
const traffic = TrafficEngine;
const target: OrbitTarget = { perigeeAltitudeKm: 250, apogeeAltitudeKm: 250 };
const check: Array<unknown> = [
  cache,http,builder,earth,maps,earthLayers,area,raster,launches,orbit,traffic,target,
  decodeGeoTiff,readCogWindowUrl,ndviRaster,StacClient,LaunchesResource,
  Sgp4Satellite,simulateLaunch,sweepLaunchGuidance,matrixMul,vec3,LinearKalmanFilter,
];
void check;
