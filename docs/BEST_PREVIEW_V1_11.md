# OpenLaunch SDK v1.11 — Best Available Satellite Preview

**Status:** development PR, not an npm release.

## Purpose

Given only a geographic area and historical time interval, the SDK discovers official satellite catalog scenes and fetches the best *actually delivered image preview* under a bounded request budget. The host website uses the OpenLaunch SDK exclusively; it does not implement direct provider integrations.

```ts
import { SpaceMapClient } from "@openlaunchsdk/earth";
const maps=new SpaceMapClient({
  previewAllowedHosts:["<your explicitly reviewed HTTPS image storage host>"],
  previewMaxBytes:3*1024*1024,
});
const result=await maps.bestAvailablePreview({
  area:{center:[14.42,50.08],radiusKm:10},
  from:"2026-10-01",to:"2026-10-15",
  layers:["optical"],strategy:"balanced",maxAttempts:3,
});
if(result.selected){
  // Respond from an authenticated, throttled backend endpoint:
  // bytes = result.selected.preview.image
  // MIME = result.selected.preview.contentType
}
```

## Selection logic

- Reuses `exploreObservations()` on Copernicus Sentinel-2/Sentinel-1 and Planetary Computer Landsat. Static DEM only if explicitly requested.
- Catalog-only preview pointers are screened; candidates with no declared HTTPS preview are skipped without image requests.
- `balanced` favors declared cloud coverage, date, nominal source resolution and optical suitability; `recent` favors later dates. Missing cloud metadata receives a neutral penalty, not a fabricated cloud-free score.
- Rank values in `catalogScore` are heuristics, **not** ground-truth image quality, actual spatial resolution of thumbnail, or precise clear sky conditions over the requested AOI.
- The server must configure an explicit hostname allowlist; no host is trusted by default. Downloads follow the existing fixed collection/provider STAC lookup, bounded HTTP and image signature verification.
- On a failed candidate, a generic per-candidate status is recorded and the next candidate is attempted. Errors never expose source URLs, access tokens or signed links.
- `maxAttempts` defaults to 3 and must be 1–5; each attempt may include a STAC item lookup and actual image download. Additional STAC search requests can occur per layer. Add application-level quotas and caching.
- If nothing can be delivered, `status:"not-delivered"` or `"no-preview-candidates"` makes the limitation explicit rather than showing a fake stock image.
- `catalogStatus:"partial"` communicates outages in other discovery sources even when the chosen preview is available.

## Important limitations

- Verified means only JPEG/PNG binary header and MIME matched under the network transfer budget. It is not a full image decode, product QA, geospatial pixel verification, or independent satellite acquisition validation.
- An image preview is not a calibrated COG/GeoTIFF analysis product. Do not infer native resolution from the downloaded preview.
- NASA GIBS WMS/WMTS timeline and Meteosat are separate SDK image providers; this feature ranks STAC observations only, not all worldwide historical imagery.
- External STAC catalogs can return incomplete or expired assets. Provider availability, allowable domain list and licensing require production validation.
- A browser should never supply `previewAllowedHosts`, untrusted URLs or secret keys. Configure these in the server and return only allowed imagery.

## Fedora offline smoke

```bash
git fetch origin
git switch feature/best-available-preview-v1.11.0
git pull --ff-only origin feature/best-available-preview-v1.11.0
npm ci
npm run example:best-preview
```

Expected: `PASS OpenLaunch v1.11 Best Available Satellite Preview`, two candidate attempts, fallback true and validated image bytes greater than zero. Uses a fully simulated provider so it does not claim live availability.
