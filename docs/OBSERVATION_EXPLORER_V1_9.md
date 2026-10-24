# OpenLaunch SDK v1.9 – Location-first Observation Explorer

**Status:** development branch, not a published npm release. Built on v1.8 historical map playback in `main`.

## Purpose

Expose discovery in the OpenLaunch SDK, not frontend-specific Copernicus or Microsoft APIs. Users choose a Czech or worldwide location, date interval and optional layer preferences, without needing to know satellite missions. The SDK uses existing `ObservationDiscoveryClient` and provider STAC clients for optical (Sentinel-2), radar (Sentinel-1), and thermal (Landsat Collection 2 Level 2); static elevation (Copernicus DEM) is an opt-in fourth source.

```ts
import { SpaceMapClient } from "@openlaunch/earth";
const maps = new SpaceMapClient();
const result = await maps.exploreObservations({
  area: { center:[14.42,50.08], radiusKm:10 },
  from:"2026-09-01",to:"2026-10-01",
  maxResults:20,perSourceLimit:15,sort:"newest"
});
console.log(result.status,result.countsByLayer,result.observations);
```

Alternatively use `area:{bounds:[west,south,east,north]}`; lon/lat order is strictly maintained. Radius is limited to 200 km per search. Dateline-spanning polygons are currently rejected to prevent misleading AOI representation.

## Guarantees and limits

- `acquiredAt` is a STAC-declared acquisition time and does **not** prove that its asset URL currently works.
- `previewUrl` is HTTPS-only and nullable. A non-null value is still an **unverified catalog pointer** and may require SAS signing / authentication; `previewVerified:false` is always returned.
- `resolutionMetres` lists only provider-declared ground sample distances; it does not imply delivered pixel detail.
- `cloudCoverPercent` is scene-wide and may differ for the selected area. Filtering applies to optical only; unknown values are explicitly null.
- This SDK reads metadata and does not download or decode pixels. For actual imagery, use existing OpenLaunch raster or provider clients.
- All queries have bounded per-source limits (max 50); displayed list capped at 100. `truncated` only means trimming locally returned candidates, not exhaustive remote pagination.
- Provider failures are isolated. `status:"partial"` prevents a failed source from being interpreted as a confirmed empty catalogue.
- Default layers exclude static DEM because it is not a dated historic capture; `layers:["elevation"]` can be requested.
- The simple circle AOI helper excludes antimeridian-crossing requests. This is a documented limitation, not an invented search fallback.
- Tests use deterministic STAC mock responses; no live external API availability is claimed.

## Fedora quick test

```bash
git fetch origin
git switch feature/observation-explorer-v1.9.0
git pull --ff-only origin feature/observation-explorer-v1.9.0
npm ci
npm run example:observation-explorer
```

Expected: `PASS OpenLaunch v1.9 Location-first Observation Explorer`, three collections queried and three results, with zero image downloads.

The next incremental milestone is to retrieve a chosen scene's real preview via its SDK provider client, preserve provider authentication and validate content type without claiming physical acquisition verification.
