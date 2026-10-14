# OpenLaunch SDK

**Open-source TypeScript SDK for spaceflight data, Earth observation, GeoTIFF/COG raster processing, satellite orbits and engineering simulations.**

OpenLaunch v1.2.0 builds on six independent npm workspaces and keeps the original `openlaunch-sdk` API for existing projects. Install only the domains your application needs once the scoped packages have been published.

[Live Earth v1.2](#live-earth--satellite-map-layers-v120) · [Modules](#modular-packages) · [Quick start](#quick-start) · [Earth & raster example](#earth-observation--raster-example) · [Launch example](#launch-data-example) · [Validation](#build-and-test) · [Documentation](#documentation) · [Limits](#accuracy-security-and-known-limitations)

> **Release status:** v1.2.0 is under development on a separate feature branch; v1.1.0 remains in main. The `@openlaunch/*` scoped packages are **not yet published to the npm registry**. The GitHub integration and offline tests passed on Node 18, 20 and 22. A successful SDK test does not certify satellite acquisitions, collision probability or flight safety.

## Live Earth & Satellite Map layers (v1.2.0)

**One SDK for all space-related map data:** `SpaceMapClient` exposes 18 typed layers grouped into Observations, Analyses, Terrain/History and Live Video. Your frontend only renders SDK results. Satellite imagery and streams still originate from official NASA, EUMETSAT and Copernicus services.

| Added capability | SDK endpoint | Data type |
| --- | --- | --- |
| Meteosat weather/clouds | `maps.meteosatCapabilities()`, `maps.meteosat.fetchMap()` | EUMETView WMS |
| MODIS Terra/Aqua and VIIRS imagery | `maps.nasaDailyTiles()`, `maps.nasaDailyTimeline()`, `maps.gibs.fetchTile()` | NASA GIBS WMTS/XYZ |
| NO₂, SO₂, CO, CH₄, ozone, HCHO and aerosols | `maps.airQuality()` | Sentinel-5P Copernicus PNG |
| Near-real-time fire detections | `maps.activeFires()` | NASA FIRMS VIIRS/MODIS points |
| Official ISS and Meteosat video | `maps.videoStream()` | Third-party video embed descriptors |
| True metadata for scene detail cards | `maps.sceneMetadata()`, `maps.sceneFreshness()` | STAC pixel size, UTC time, cloud %, freshness |

```ts
import { SpaceMapClient } from "@openlaunch/earth";

const maps = new SpaceMapClient();
// All four of the planned selector categories are filled by the SDK:
const menu = maps.layers();
const current = maps.layers("observations");
const daily = maps.nasaDailyTimeline(
  "MODIS_Terra_CorrectedReflectance_TrueColor", "2026-10-10", "2026-10-14"
);
const iss = maps.videoStream("iss-earth-live"); // official watch + iframe URL
console.log(menu, current, daily, iss);
```

Or with the backward-compatible umbrella API: `new OpenLaunch().earth.maps.layers()`.

**Important:** `LIVE VIDEO` is an external provider stream, never a geo-aligned map raster. Meteosat near-real-time frames have provider delay; NOAA/NASA daily tiles are not continuous. The SDK reports `observedAt:null` and `liveVerified:false` until source-specific evidence exists — no fabricated live status. NASA FIRMS MAP_KEY and Copernicus OAuth credentials must stay on your **backend**, not in public web code.

**Source release:** v1.2.0 is on `feature/live-earth-layers-v1.2.0`, with a draft PR. The `main` release remains v1.1.0 until explicit merge. The six scoped `@openlaunch/*` npm packages are still not published to the registry.

Details and security/integration examples: [Live Earth v1.2 architecture](docs/LIVE_EARTH_V1_2.md). Try offline: `npm run example:live-earth`.

---

## Why OpenLaunch?

OpenLaunch started as a typed client for Launch Library 2, NASA and CelesTrak. It now includes STAC observation catalogs, real georeferenced TIFF pixel processing, SGP4/SDP4 satellite tracking, space-traffic geometry and generic launch-simulation tools.

**v1.1 separates data products from aerospace engineering.** A map application that needs Sentinel/Landsat catalogs and NDVI can use Earth and Raster without pulling in the trajectory engine or `satellite.js`.

## Modular packages

| Package | Purpose | Runtime dependencies |
| --- | --- | --- |
| `@openlaunch/core` | Typed HTTP requests, caching, rate limits, retries, telemetry, normalized models | None |
| `@openlaunch/earth` | STAC search, Copernicus, Planetary Computer, weather, AOI discovery | `@openlaunch/core` |
| `@openlaunch/raster` | GeoTIFF/COG reads, spatial clips, NDVI / NDWI / NDMI / NBR, quality masks, change analysis, DEM mesh | `@openlaunch/core` |
| `@openlaunch/launches` | Launch Library 2, NASA, launch resources and normalization | `@openlaunch/core` |
| `@openlaunch/orbit` | TLE/OMM, SGP4/SDP4, ground passes, space-traffic checks, swath/CZML | `@openlaunch/core`, `satellite.js` |
| `@openlaunch/engineering` | Rocket and trajectory simulations, mission targeting, spacecraft math | `@openlaunch/core`, `@openlaunch/orbit` |
| `openlaunch-sdk` | Backward-compatible **umbrella** API with all functions | `satellite.js` |

Every scoped package has separate **ESM, CommonJS and TypeScript declaration** entrypoints. The monorepo uses npm workspaces and a build step that copies only the reachable, compiled modules into each package. The original TypeScript source remains under `src/` for now; it has **not** yet been physically moved to `packages/*/src`.

### Compressed npm archive sizes

Measured with `npm pack --dry-run` in GitHub Actions (Node 22):

| What you install | Compressed OpenLaunch archive total |
| --- | ---: |
| Entire umbrella `openlaunch-sdk` | **361.5 kB** |
| `@openlaunch/earth` + `@openlaunch/core` | **35.7 kB** |
| `@openlaunch/raster` + `@openlaunch/core` | **46.0 kB** |
| `@openlaunch/launches` + `@openlaunch/core` | **22.8 kB** |
| `@openlaunch/orbit` + `@openlaunch/core` | **52.9 kB** excluding `satellite.js` |
| `@openlaunch/engineering` + `@openlaunch/orbit` + `@openlaunch/core` | **109.6 kB** excluding `satellite.js` |

These are **npm archive sizes, not browser bundle sizes, network download times or installed disk usage**. Minified/gzipped browser bundle measurements are still needed.

## Quick start

### Run from GitHub source (available now)

Requirements: **Node.js 18+**, npm and network access for `npm ci`.

```bash
git clone https://github.com/kobyldav/openlaunch-sdk.git
cd openlaunch-sdk
npm ci
npm run check
npm run example:raster
```

The workspaces are linked locally by npm, so the scoped imports work immediately **inside the checked-out repository**.

### Install selected npm packages (after publication)

```bash
npm install @openlaunch/earth @openlaunch/raster
# Or just launch information:
npm install @openlaunch/launches
# Orbital tracking requires satellite.js:
npm install @openlaunch/orbit
```

**Do not assume these installation commands work from the public npm registry yet.** Publishing requires verified access to the `@openlaunch` scope and a separate release process. An existing older `openlaunch-sdk` version from npm is not automatically the v1.1.0 code on GitHub.

## Earth observation & raster example

This is the practical combination for a map application over the Czech Republic. It separates **catalog metadata** from **actual pixel data**:

```ts
import { EarthCatalogClient, bbox } from "@openlaunch/earth";
import {
  readCogWindowUrl,
  rasterStatistics,
  ndviRaster,
  alignRasterTo,
  calibrateRasterFromStac,
} from "@openlaunch/raster";

const earth = new EarthCatalogClient();
const aoi = bbox(14.39, 50.06, 14.45, 50.11); // Prague sample AOI
const now = new Date();

const report = await earth.discoverObservations({
  area: aoi,
  from: new Date(now.getTime() - 30 * 86_400_000),
  to: now,
  layers: ["optical", "radar", "thermal", "elevation"],
});
console.table(report.queryStatuses);

const scene = report.newestByLayer.optical?.item;
if (!scene) throw new Error("No optical STAC scene found");

// Asset keys, formats, authorization and CRS vary across providers.
// B04/B08 are illustrative; use actual available, supported TIFF assets.
const red = scene.assets.B04;
const nir = scene.assets.B08;
if (!red || !nir) throw new Error("Required spectral bands unavailable");

// Only allow pre-approved asset hostnames in a production application.
// Signed provider URLs may be required before reading.
const trustedHosts = ["your-approved-imagery-host.example"];
const opts = { allowedHosts: trustedHosts, maxPixels: 300_000 };

const redGrid = (await readCogWindowUrl(red.href, aoi, opts)).raster;
const nirGrid = (await readCogWindowUrl(nir.href, aoi, opts)).raster;

// STAC raster:bands MUST provide a real scale and offset:
const calibratedRed = calibrateRasterFromStac(redGrid, red).grid;
const calibratedNir = calibrateRasterFromStac(nirGrid, nir).grid;
const alignedNir = alignRasterTo(calibratedNir, calibratedRed);
const vegetation = ndviRaster(calibratedRed, alignedNir);
console.log(rasterStatistics(vegetation));
```

This example is a **template for compatible real assets**, not a guarantee that a provider exposes the `B04`/`B08` names, supported TIFF codec/CRS or radiometric metadata. It does not add a cloud mask automatically; align and apply actual SCL/QA pixels for a usable vegetation map. For access-controlled Planetary Computer assets, sign the real links first using provider credentials.

**Raster capabilities in v1.0+:** single-band classic TIFF/BigTIFF, uncompressed or Deflate strips/tiles, HTTP 206 byte-range window reads, EPSG:4326/3857 affine grids, polygon/bbox clips, nearest/bilinear alignment within the same CRS, DN calibration, Sentinel-2 SCL filtering, NDVI, time comparisons, RGBA bytes and a **local projected DEM triangle mesh**.

See [GeoTIFF and COG technical details](docs/RASTER_V1.md).

## Launch data example

Use only launch information, without satellite dynamics or rocket-engineering dependencies:

```ts
import { LaunchDataClient } from "@openlaunch/launches";

const data = new LaunchDataClient(); // optional LL2 API key, custom fetch/cache
const next = await data.launches.next();
if (next) console.log(next.name, next.net);
```

The `launches` workspace includes typed LL2 launch/rocket/agency/astronaut/event/pad resources and NASA provider helpers. API rate limits, access restrictions and upstream availability still apply.

## Orbital tracking and engineering

```ts
import { Sgp4Satellite } from "@openlaunch/orbit";
import { simulateLaunch } from "@openlaunch/engineering";
```

The orbit module models trajectories from TLE/OMM element sets via `satellite.js`, calculates passes and relative geometry and supports space-traffic screening. The engineering module provides research-grade 3DOF multistage launch simulation, Monte Carlo studies, rocket controls and target-orbit diagnostics.

**Accuracy matters:** modeled proximity is not collision probability, and a generic rocket model is not actual SpaceX flight telemetry. Propagation quality depends on element freshness, frame approximations and model assumptions.

## Backward compatibility

Existing projects **do not have to switch imports**. The all-in-one API remains available:

```ts
import { OpenLaunch, bbox, ndviRaster, simulateLaunch } from "openlaunch-sdk";

const sdk = new OpenLaunch();
const report = await sdk.earth.discoverObservations({
  area: bbox(12.1, 48.6, 18.9, 51.1),
  from: new Date("2026-09-01"),
  to: new Date("2026-10-13"),
});
const launches = await sdk.launches.upcoming({ limit: 5 });
```

The legacy `sdk.earth`, `sdk.orbit`, `sdk.traffic`, `sdk.trajectory` and `sdk.mission` APIs are preserved. The separate workspaces introduce lightweight facades `EarthCatalogClient` and `LaunchDataClient`.

## Build and test

```bash
npm ci
npm run check                # source/examples TS + regression tests + offline demos
npm run test:packages        # public ESM/CommonJS and TypeScript workspace tests
npm run test:packed          # isolated installs from real locally built npm archives
npm run pack:check:packages  # validate all six npm package tarballs
npm run example:raster       # actual TIFF byte decoder, NDVI, AOI and DEM demo\nnpm run example:live-earth   # offline satellite map selector, sources and streams
npm run example:mission      # synthetic EO catalog + mission diagnostic
npm run example:launch       # generic staged launch/Max-Q simulation
```

The CI matrix covers **Node 18, 20 and 22**. The verified v1.1 branch ran **95 unique regression tests**, additional workspace smoke checks and **five isolated package installation tests**, all passing on those Node versions. ESM, CommonJS, TypeScript declarations and npm packaging are checked.

Live Copernicus/Planetary Computer/NASA/CelesTrak data and authenticated raster endpoints require **separate live integration checks**. The offline demos explicitly identify synthetic imagery or historical orbital data; they are not proof of live acquisition.

## Project structure

```text
src/                       Original SDK implementation and compatibility API
src/modular/               Standalone EarthCatalogClient and LaunchDataClient
packages/
  core/                    Independent domain npm package
  earth/
  raster/
  launches/
  orbit/
  engineering/
scripts/build-workspaces.mjs
scripts/test-packed-consumers.mjs
scripts/pack-workspaces.mjs
tests/
examples/
docs/
.github/workflows/ci.yml
```

Generated `dist/`, `dist-cjs/` and `packages/*/dist/` outputs are build artifacts; do not hand-edit them. Build output and optional CZML example exports should not be committed as source changes.

## Accuracy, security and known limitations

- **Raster formats:** no universal JPEG2000, LZW/JPEG TIFF, multi-band TIFF or arbitrary CRS reprojection yet. Byte-range COG downloads require supported TIFF layout/encoding and a server honoring HTTP 206.
- **Untrusted URLs:** the downloader requires a trusted HTTPS hostname allowlist and rejects redirects; for server-side untrusted sources, also enforce destination-IP/egress policy to prevent SSRF and DNS rebinding.
- **Scene quality:** catalog cloud coverage is not cloud coverage over a particular pixel. For valid NDVI, apply real per-pixel quality masks and calibration before comparing aligned acquisitions.
- **3D:** the DEM mesh is local and requires separate georeferencing, texture mapping and rendering; it is not a complete Cesium 3D tile.
- **Spaceflight:** no flight-qualified GNC, no guaranteed satellite acquisition, no operational collision clearance or validated collision probability.
- **Architecture:** package splitting currently occurs in the compiled distribution. Physical TypeScript source migration and browser bundle size benchmarking remain future work.

## Documentation

| Guide | Contents |
| --- | --- |
| [Modular workspaces v1.1](docs/MONOREPO_V1_1.md) | Package graph, build/release process, install isolation and migration risks |
| [Raster processing v1.0](docs/RASTER_V1.md) | TIFF formats, COG windows, pixel calibration, NDVI and DEM limitations |
| [Earth Intelligence](docs/EARTH_INTELLIGENCE.md) | STAC providers, catalog search, Copernicus/Planetary Computer and weather |
| [Orbit & Space Traffic](docs/ORBIT_TRAFFIC.md) | SGP4/SDP4, satellite passes, sensor geometry and geometric screening |
| [Launch Trajectory](docs/LAUNCH_TRAJECTORY.md) | Generic 3DOF ascent, stages, throttle/Max-Q, Monte Carlo and CZML |
| [Mission Intelligence](docs/MISSION_INTELLIGENCE.md) | Mission targets, acquisition correlation and model limitations |
| [Public exports](docs/EXPORTS.md) | Export inventory and TypeScript API |
| [Examples](examples/README.md) | Typed cookbook and demos |
| [Changelog](CHANGELOG.md) | Version history |

The live Earth source-provider extension is documented in [docs/LIVE_EARTH_V1_2.md](docs/LIVE_EARTH_V1_2.md).\n\n## License and contribution

**MIT** — see [LICENSE](LICENSE). Issues and pull requests are welcome. Keep tests green on the supported Node versions, avoid breaking legacy `openlaunch-sdk` imports and clearly label simulated vs provider-observed data. The `@openlaunch` npm scope must be verified and intentionally published before independent consumers can install these packages from the registry.
