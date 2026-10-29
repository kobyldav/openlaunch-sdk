# OpenLaunch SDK v1.21 — Verified Daily NASA GIBS Tiles

**Status:** development feature branch; not published or deployed.

## Purpose

`webMapDaily()` (v1.20) returns an official XYZ URL template for MapLibre/Leaflet, but does not verify any actual tile. `webMapDailyTile()` now makes one real bounded HTTPS request against the official NASA GIBS endpoint and checks that bytes match the claimed image type. This lets a web backend distinguish a valid tile, missing day/tile, provider failure and an invalid XML/HTML error page.

```ts
import {SpaceMapClient} from "@openlaunchsdk/earth";
const maps=new SpaceMapClient({
 webMapTileMaxBytes:512*1024,
 webMapTileTimeoutMs:8000,
});
const result=await maps.webMapDailyTile({
 layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:17,y:11
});
if(result.status==="available"){
 // Serve result.image (Uint8Array) to the browser, with result.contentType.
}
```

`status`: `available` means a JPEG/PNG was delivered; `missing` means NASA HTTP 404/410; `unavailable` means a network, timeout or upstream failure; `invalid` means wrong MIME, bad signature or exceeded byte limit. The **requested date is not a verified satellite acquisition time**. Likewise, a valid JPEG might contain a no-data placeholder, so pixel coverage is not asserted. Never label these layers “live cameras”.

## Security boundaries

Exact official HTTPS host `gibs.earthdata.nasa.gov` and WMTS path required, layer and XYZ bounded, redirects refused. Hard maximum download is 2 MiB per tile and configurable request deadline up to 30 seconds. Errors are sanitized: return enums, not provider messages or URLs. Byte bodies are provided only for validated images. The caller's Cloudflare/Next.js backend still needs rate limiting and caching to prevent abusive image fetches.

## Fedora

```bash
git fetch origin
git switch feature/web-gibs-verified-tiles-v1.21.0
git pull --ff-only origin feature/web-gibs-verified-tiles-v1.21.0
npm ci
npm run example:web-map-tile
npm test
```

Smoke uses mocked HTTPS response bytes for deterministic verification. CI tests Node 18/20/22 and existing real OpenJPEG/WASM integration. No live NASA service or Cloudflare production API access is implied.
