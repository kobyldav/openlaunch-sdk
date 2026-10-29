# OpenLaunch SDK v1.12 — Satellite footprint coverage estimates

**Status:** development PR based on merged v1.11. Scoped package publication is not implied.

## What it does

STAC item `geometry` is a footprint polygon / multipolygon. `SpaceMapClient.exploreObservations()` estimates its geometric overlap with the AOI (rectangle or center-and-radius polygon) and publishes `footprintCoveragePercent: number | null`, `footprintCoverageBasis`, and `pixelCoverageVerified:false`.

The computation clips STAC polygon rings against the convex AOI, subtracts holes and uses local longitude/latitude planar area ratios. This is appropriate as an approximate filter for small geographic areas, not an exact geodesic or raster pixel coverage product. Multiple overlapping footprints in a MultiPolygon could overcount; output is capped at 100%. Invalid rings, excessive geometry and antimeridian-crossing edges return `null` rather than inventing a percentage.

```ts
import { SpaceMapClient } from "@openlaunchsdk/earth";
const sdk = new SpaceMapClient({previewAllowedHosts:["<trusted image host>"]});
const archive = await sdk.exploreObservations({
  area:{center:[14.42,50.08],radiusKm:10},
  from:"2026-10-01",to:"2026-10-15",
  minFootprintCoveragePercent:80,
});
console.log(archive.observations.map(x=>[x.sourceId,x.footprintCoveragePercent]));

const best = await sdk.bestAvailablePreview({
  area:{center:[14.42,50.08],radiusKm:10},
  from:"2026-10-01",to:"2026-10-15",
  minFootprintCoveragePercent:80,maxAttempts:3
});
```

A strict minimum >0 excludes missing/unsupported geometry. Default minimum 0 preserves backwards compatibility and does not silently exclude older STAC responses.

## Important limitations

- Catalog polygon coverage is not actual raster pixel coverage. Even a reported 100% does not guarantee a usable RGB preview, that a target is cloud-free, or that a TIFF contains unmasked data.
- Quality still comes from scene-wide cloud metadata and declared resolution, not AOI-specific cloud or pixel QA. No calibrated image inspection is performed in this release.
- Preview availability still requires SDK's bounded HTTPS JPEG/PNG download. The previously introduced trusted host allowlist and no signed URL leakage remain enforced.
- The intersection uses a planar approximation over small AOIs; coastal/dateline/polar/extremely complex geometry accuracy needs geodesic algorithms and raster sampling in a later update.
- User-provided and remote geometries are bounded to avoid excessive CPU/memory. Invalid STAC geometry yields unknown, not fake coverage.
- Tests are deterministic offline fixtures, not live Copernicus observation verification.

## Fedora local test

```bash
git fetch origin
git switch feature/footprint-coverage-v1.12.0
git pull --ff-only origin feature/footprint-coverage-v1.12.0
npm ci
npm run example:footprint-coverage
```

Expected: `PASS OpenLaunch v1.12 STAC Footprint Coverage`, selected `S2-FULL`, estimated coverage `100%`, one image download and `Pixel coverage verified: false`.
