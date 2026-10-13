# OpenLaunch v1.1 — Modular npm Workspaces

This document covers the incremental split of the **v1.0** OpenLaunch SDK into **six independently installable npm packages**, while keeping the existing `openlaunch-sdk` public exports and their behavior unchanged.

## Repository layout and package ownership

```text
openlaunch-sdk/
  src/                        # Existing v1.0 source and compatibility API
    modular/                   # Lean no-monolith convenience clients
  packages/
    core/                      # Shared HTTP, caching, query types/mappers
    earth/                     # STAC, Copernicus, Planetary Computer, Open-Meteo
    raster/                    # COG TIFF windows, geospatial pixels, NDVI, DEM
    launches/                  # Launch Library 2 data, NASA and resources
    orbit/                     # SGP4/SDP4, passes, traffic, sensors, CZML
    engineering/               # Science, 3DOF trajectory, mission planning
  scripts/build-workspaces.mjs # Domain-specific dependency graph compiler/copier
  scripts/pack-workspaces.mjs  # Independently checks tarball contents
  tests/packages.test.mjs      # ESM/CJS, independence, API and file-size tests
```

The six package source boundaries are **not implemented by re-exporting** `openlaunch-sdk`. Doing that would defeat installation size and the dependency isolation. Instead, `build-workspaces.mjs` runs *after* the existing TS ESM/CJS build, walks the ESM/CJS/TypeScript declaration relative-import graphs, and copies only reachable compiled modules into each workspace's `dist`. It replaces shared core imports with imports from the separately packed `@openlaunch/core`. Engineering references to orbit/traffic/sensor/scenario modules are externalized to `@openlaunch/orbit`. It fails when an expected module is not compiled.

The source of truth stays the v1.0 `src/` implementation: this avoids maintaining duplicate algorithms while the physical source-tree migration is underway. This is a **transitional architecture**, not a claim that source files were already physically moved into six clean bounded contexts.

Each package exposes a top-level ESM/CJS entry and TypeScript declarations. `/internal/*` is used to resolve cross-package imports in the generated build, but is **not a stable public API**.

## Dependency graph

```text
@openlaunch/core          (no runtime dependencies)
       ↑
       ├── @openlaunch/earth            (STAC metadata, provider APIs)
       ├── @openlaunch/launches         (LL2 + NASA)
       ├── @openlaunch/raster           (COG + pixel analysis)
       └── @openlaunch/orbit            (+ satellite.js 6.0.2)
                    ↑
                    └── @openlaunch/engineering
                        (also depends on @openlaunch/core)

openlaunch-sdk             (legacy umbrella; unchanged root imports)
```

**Critical invariant:** installing `@openlaunch/earth`, `@openlaunch/raster` or `@openlaunch/launches` must **never** require `satellite.js`, `@openlaunch/orbit`, or `@openlaunch/engineering`. This is asserted by tests and package manifests. Browser bundles of these packages no longer pull in the monolithic OpenLaunch class.

### Earth-only web application

```bash
npm install @openlaunch/earth @openlaunch/raster
```

```ts
import { EarthCatalogClient, bbox } from "@openlaunch/earth";
import { readCogWindowUrl, rasterStatistics } from "@openlaunch/raster";

const catalog = new EarthCatalogClient();
const aoi = bbox(14.40, 50.07, 14.45, 50.11);
const now = new Date();
const report = await catalog.discoverObservations({
  area: aoi,
  from: new Date(now.getTime() - 30 * 86_400_000),
  to: now,
  layers: ["optical", "radar", "thermal", "elevation"],
});
console.table(report.queryStatuses);

// Choose a real, supported, signed one-band TIFF asset from the STAC item.
// Use only a deliberately audited provider domain in your allowlist.
const item = report.newestByLayer.optical?.item;
const asset = item?.assets.B04;
if (asset) {
  const url = new URL(asset.href);
  const raster = await readCogWindowUrl(asset.href, aoi, {
    allowedHosts: [url.hostname],
    maxPixels: 300_000,
  });
  console.log(rasterStatistics(raster.raster));
}
```

This example requires an actual provider TIFF with a supported codec and CRS; STAC search alone never guarantees this. Many Landsat/Sentinel assets require a SAS token/provider signing. `readCogWindowUrl` is a bounded HTTP-range reader, not a complete browser visualization. Remote TIFF limitations: [Raster v1.0](RASTER_V1.md).

### Launch data without any engineering physics

```bash
npm install @openlaunch/launches
```

```ts
import { LaunchDataClient } from "@openlaunch/launches";

const sdk = new LaunchDataClient({ apiKey: process.env.LL2_API_KEY });
const next = await sdk.launches.next();
console.log(next?.name, next?.net, next?.rocket?.name);
```

`LaunchDataClient` encapsulates the shared HTTP/cache library. For finer control, `LaunchesResource` can be constructed with `HttpClient` from `@openlaunch/core`.

### Orbit and engineering only when needed

```bash
npm install @openlaunch/orbit
npm install @openlaunch/engineering
```

```ts
import { Sgp4Satellite } from "@openlaunch/orbit";
import { simulateLaunch } from "@openlaunch/engineering";
```

Only the orbit package installs `satellite.js` directly. `@openlaunch/engineering` depends on orbit for modeled satellite interaction.

## Backwards compatibility

```ts
// Existing v0.6–v1.0 consumer imports continue to work:
import { OpenLaunch, ndviRaster, simulateLaunch, Sgp4Satellite } from "openlaunch-sdk";

// Prefer these narrower installs for new projects:
import { EarthCatalogClient } from "@openlaunch/earth";
import { readCogWindowUrl } from "@openlaunch/raster";
```

Do not delete or rewrite the old `OpenLaunch` class. It stays in the umbrella release and retains `space.earth`, `space.orbit`, `space.trajectory`, and `space.mission`.

## Reproducible build, tests and package sizes

```bash
npm ci
npm run check
npm run test:packages
npm run pack:check:packages
npm run test:packed
npm run build:packages
```

- `npm run build`: compiles unchanged ESM and CJS roots then generates all workspace bundles
- `tests/packages.test.mjs`: ESM and CJS imports for all six installed workspaces, functional mocked Earth STAC and LL2 requests, absence of orbit/engineering modules and `satellite.js` in web-only manifests, preserve legacy API
- `scripts/pack-workspaces.mjs`: checks independently packed tarballs contain ESM, CJS and declarations and no raw source or node_modules
- `packages/build-report.json`: prints raw compiled module count and uncompressed byte count per workspace for direct, auditable comparison
- `npm ci` in CI: ensures package-lock has valid workspace links for reproducible installations
- `npm run test:packed`: builds real scoped npm tarballs and installs Earth, Raster, Launches, Orbit and Engineering in **separate temporary consumer projects**, then checks ESM/CJS imports and dependency isolation
- CI matrix: Node 18 / 20 / 22

**Bundle-size distinction:** raw tarball size is **not the same** as browser bundle size; bundled size also depends on your bundler and tree-shaking. A follow-up real bundler benchmark should measure minified+gzip browser output and actual cold install size separately.

### Verified npm archive sizes (Node 22 CI)

| Install | Tarballs (compressed) | Compared with umbrella tarball |
| --- | ---: | ---: |
| Full `openlaunch-sdk@1.1.0` | 361.5 kB | Baseline |
| `@openlaunch/earth` + `@openlaunch/core` | 35.7 kB | ~90% smaller |
| `@openlaunch/raster` + `@openlaunch/core` | 46.0 kB | ~87% smaller |
| `@openlaunch/launches` + `@openlaunch/core` | 22.8 kB | ~94% smaller |
| `@openlaunch/orbit` (+ core, excluding satellite.js tarball) | 52.9 kB | Not an isolated web-data scenario |
| `@openlaunch/engineering` (+ core + orbit; excluding satellite.js) | 109.6 kB | Research/engineering bundle |

Measurements use `npm pack --dry-run` from CI. They exclude external npm dependencies and do **not** equal minified/gzip browser JS bundles or real network install times. The domain packages have separate, tested ESM and CJS entrypoints.

**CI proof:** 95 passing unique Node regression/package tests, plus 12 independent workspace tests rerun after offline demos, and five separately isolated npm tarball installation smoke checks (Earth, Raster, Launches, Orbit, Engineering). All succeeded on Node 18, 20 and 22.

## Publication prerequisites and dependency order

This PR **does not create or publish packages in the npm registry**. Publication requires authenticated ownership of the `@openlaunch` organization/scope, explicit authorization, and a release tag.

After that, the dependency-safe publish order is:

```sh
npm publish --access public --workspace @openlaunch/core
npm publish --access public --workspace @openlaunch/earth
npm publish --access public --workspace @openlaunch/raster
npm publish --access public --workspace @openlaunch/launches
npm publish --access public --workspace @openlaunch/orbit
npm publish --access public --workspace @openlaunch/engineering
```

Build + validate before publishing: `npm ci && npm run check && npm run pack:check:packages && npm run test:packed`. Verify exact version/source hashes, npm publishing permissions and release provenance before running any publish command.

## Trade-offs and risks

| Choice | Benefit | Cost / risk |
|---|---|---|
| Six npm workspaces | Small domain installs and clearer public entrypoints | Six semver/publish artifacts to test |
| Shared `@openlaunch/core` | No HTTP/cache duplicate source in each publish package | Shared core becomes cross-package dependency |
| Sparse compiled outputs | Smaller packages without changing physics internals | Domain boundaries are generated, not yet source-level folders |
| Generated internal subpaths | Preserves existing TS declarations and relative imports | Keep internal paths private and maintain import contracts |
| Legacy `openlaunch-sdk` wrapper | No breaking migration for current users | Monolith remains for users who choose it |
| Orbit isolated | Earth users do not receive SGP4 dependency | Engineering indirectly installs orbit for traffic integration |

Versioning: v1.1 is a synchronized six-package release. Before publishing to npm, **verify ownership/access to the `@openlaunch` scope**, check license/provider terms and CI. Nothing is published automatically by creating the branch or PR.

### Future clean-source migration

After the independently installable distributions are proven, migrate physical TypeScript files into `packages/*/src` without changing public APIs, replacing generated relative-import remaps with intentional TypeScript package imports. Keep package-level smoke tests passing throughout. This avoids a risky full rewrite while preserving the immediate benefit of independent installation.
