# OpenLaunch SDK

**Open-source TypeScript SDK for spaceflight data, Earth observation, GeoTIFF/COG raster processing, satellite orbits and engineering simulations.**

OpenLaunch **v1.22.1** is a TypeScript SDK comprising seven independent npm modules and the backward-compatible `openlaunch-sdk` umbrella package. Install only the capabilities your application needs.

[Space Archive v1.8](#space-archive--playback-v18-development) · [Live Earth v1.2](#live-earth--satellite-map-layers-v120) · [Modules](#modular-packages) · [Quick start](#quick-start) · [Earth & raster example](#earth-observation--raster-example) · [Launch example](#launch-data-example) · [Validation](#build-and-test) · [Documentation](#documentation) · [Limits](#accuracy-security-and-known-limitations)

> **Release 1.22.1:** this is a metadata-and-documentation correction to the published v1.22.0 APIs. All eight package names are available on npm; check the registry for the currently published version. Install `openlaunch-sdk` or individual `@openlaunchsdk/*` modules.

## Fedora full SDK verification (v1.22)

Run **one command** to validate source, every published cookbook example type signature, all offline executable examples, unit/regression tests, package consumer installation, and every offline SDK smoke (without calling provider APIs):

```bash
bash scripts/fedora-full-test.sh
```

Add `--all` for a small set of live provider smoke probes plus real OpenJPEG/WASM, or `--live-cookbook` only when explicitly willing to exercise all live cookbook scripts and upstream quotas. The script writes individual PASS/FAIL/SKIP logs and JSON/text summaries to `test-results/` (Git ignored). See [Fedora full verification](docs/FEDORA_FULL_SUITE.md).

## Bounded NASA tile caching & batch maps (v1.22 development)

The **OpenLaunch SDK** (not the web) now offers `SpaceMapClient.webMapDailyTileCached()`, `webMapDailyTilesBatch()`, `webMapTileCacheStats()`, and `clearWebMapTileCache()` on top of the verified NASA GIBS JPEG/PNG downloader introduced in v1.21.

```ts
import {SpaceMapClient} from "@openlaunchsdk/earth";
const maps=new SpaceMapClient({
  webMapTileCache:{ttlMs:300000,maxEntries:32,maxTotalBytes:8*1024*1024},
  webMapTileMaxBytes:512*1024,webMapTileTimeoutMs:8000,
});
const tiles=[{layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:17,y:11}];
const batch=await maps.webMapDailyTilesBatch({tiles,concurrency:3});
for(const result of batch.results){
  if(result.status==="available")console.log(result.cacheStatus,result.image);
}
console.log(maps.webMapTileCacheStats());
```

Only **verified delivered image bytes** enter the cache; missing/error/invalid responses are never cached. Identical concurrent requests use one in-flight download. The LRU stores exact canonical layer/day/XYZ keys; external consumers receive their own copies of bytes. Hard bounds: 16 tiles/batch, up to 4 unique concurrent network requests per batch, 128 cache entries, 32 MiB cache, 1-hour TTL, and existing max 2 MiB per image. Defaults are intentionally lower. Validation happens for the **entire batch before first network request**.

**Cloudflare Workers note:** the cache is local to a single long-lived `SpaceMapClient` instance within one worker isolate. It is not distributed storage and cannot eliminate requests between independent isolates. The website must still enforce authentication/rate limits, attribution and durable caching if needed. This SDK change does not deploy or modify MyWeb.

[Cache and batch v1.22 guide](docs/WEB_GIBS_CACHE_V1_22.md). Fedora smoke: `npm run example:web-map-tile-cache`.

## Verified NASA GIBS daily map tiles (v1.21 development)

`SpaceMapClient.webMapDailyTile({layer,date,z,x,y})` fetches exactly **one** trusted NASA daily map tile via HTTP GET with redirects disabled. Layer is restricted to the two curated MODIS/VIIRS presets already accepted by `webMapDaily()`. The SDK validates integer XYZ bounds, Content-Length and streamed size limits, exact MIME and JPEG/PNG file signature.

Results distinguish `available`, `missing` (NASA 404/410), `unavailable` (upstream / timeout), and `invalid` (HTML/XML masquerading as image, MIME error or too many bytes). A verified tile is **verified binary delivery only**, never independent confirmation of satellite capture or a guarantee of cloud-free imagery.

```ts
const maps=new SpaceMapClient({webMapTileMaxBytes:512*1024,webMapTileTimeoutMs:8000});
const result=await maps.webMapDailyTile({
  layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:17,y:11
});
if(result.status==="available"&&result.image){
  // Backend emits result.image with result.contentType.
}
```

Return verified bytes from a rate-limited, cache-aware backend. For interactive zoom/pan maps, keep existing NASA direct XYZ descriptors in `webMapDaily()` and use the new tile method to confirm a selected tile/date or build a hardened image proxy. This is **not** a background downloader and does not query all map tiles. The endpoint's availability is not checked live by CI (network fixtures only).

[Full v1.21 guide](docs/WEB_GIBS_TILES_V1_21.md). Fedora smoke: `npm run example:web-map-tile`.

## Web map integration API (v1.20 development)

`SpaceMapClient.webMapSearch()` transforms the existing STAC discovery into compact, **JSON-safe** scene cards for a web map. Clients select a curated layer and AOI/date window; the SDK returns scene ID, source, actual STAC acquisition metadata, scene-wide cloud estimate, approximate footprint overlap and a **provider/collection/itemId selector** for a declared preview. All raw STAC asset URLs (potentially signed) and provider error strings stay out of the result. A declared preview is `declared-unverified`, **never** a guarantee that imagery can be delivered.

```ts
const maps=new SpaceMapClient({previewAllowedHosts:["<reviewed actual HTTPS storage hostname>"]});
const result=await maps.webMapSearch({
 layer:"sentinel2-optical",
 area:{center:[14.42,50.08],radiusKm:10},
 from:"2026-10-01",to:"2026-10-20",maxResults:20
});
// JSON metadata for your map, no signed STAC links:
const card=result.scenes[0];
if(card?.preview.request){
 const binary=await maps.fetchObservationPreview(card.preview.request);
 // Your authenticated/rate-limited backend serves binary.image with binary.contentType.
}
```

`SpaceMapClient.webMapDaily({layer:"nasa-modis-terra",date:"2026-10-17"})` returns the official NASA GIBS MapLibre/Leaflet WMTS-compatible XYZ template with `delivery:"unchecked"`. Also supports `nasa-viirs-noaa20`. This is a metadata descriptor, not evidence that all XYZ tiles exist or were captured on the requested day.

Use these two SDK APIs to implement the first production-friendly UI path: **location → satellite layer → date → scene list → verified preview**. Configure all provider secrets and reviewed storage hosts exclusively on the backend. Add authentication, throttling, attribution and caching in Cloudflare; never expose provider credentials in Next.js client bundles.

[Full integration guide](docs/WEB_MAP_V1_20.md). Offline Fedora smoke: `npm run example:web-map`.

## OpenJPEG reduced-resolution JP2 (v1.19 development)

Use `jp2DecompositionLevel:2` in `SpaceMapClient` to decode supported single-band 8-bit JPEG2000 SCL masks at quarter width and height (approximately 1/16 the native pixel count). The real OpenJPEG WASM backend uses `decodeSubResolution()`; the SDK validates decoded dimensions and **scales the georeferencing transform** for the coarser pixel grid. Original dimensions and decoded pixels have separate limits; attempts to decode a very large original image or fetch a JP2 exceeding the byte cap are rejected.

```ts
const maps = new SpaceMapClient({
  jp2AllowedHosts:["<reviewed JP2 asset host>"],
  jp2Decoder:configuredOpenJpegWasmDecoder,
  jp2DecompositionLevel:2,
  jp2MaxPixels:1_048_576,
  jp2MaxSourcePixels:16_777_216
});
const report=await maps.analyzeObservationJp2Qa({itemId:stacItemId,area:yourAoi});
console.log(report.effectivePixelScale,report.decodedWidth,report.quality.usablePercentOfAoi);
```

**Not a JP2 range or tile reader:** the bounded original file still downloads completely. Native-image decompression can still consume more memory than final decoded pixel count; isolate codec execution server-side. Subresolution changes sampling and cloud classification accuracy. Actual WASM reduction is exercised by independent 32×32 JP2 CI on Node 20/22. Details: [v1.19 guide](docs/JP2_REDUCED_V1_19.md).

## Real OpenJPEG WASM validation (v1.18 development)

The v1.17 optional JPEG2000 adapter is now tested with the **actual** pinned OpenJPEG WASM package in a separate GitHub Actions workflow, not only against a mock. The test decodes the independently OpenJPEG-encoded 3×2 grayscale JP2 and asserts all six raw SCL values as well as STAC-linkage and cloud-classification semantics. `createOpenJpegWasmBackend()` now checks codec-reported channel count, bit depth, signedness and pixel-buffer size and copies output before releasing WASM memory.

```bash
npm ci
npm install --no-save --package-lock=false --ignore-scripts @cornerstonejs/codec-openjpeg@1.3.6
npm run example:openjpeg-real
```

The external codec remains **optional**, not added to the default SDK dependencies. Full-size native Sentinel-2 JP2 downloads, spatial window decoding and production-provider signing are not solved in this release. Run decoding on isolated backend workers with request, memory and CPU limits. See [OpenJPEG WASM verification](docs/OPENJPEG_WASM_V1_18.md).

## Optional JPEG2000 / Sentinel-2 SCL JP2 (v1.17 development)

`SpaceMapClient.analyzeObservationJp2Qa()` can resolve a Sentinel-2 SCL JP2 from the matching official STAC item, require exact asset `proj:epsg`, `proj:shape`, `proj:transform`, securely fetch bounded JP2 bytes and classify decoded grayscale mask pixels within the AOI. Codec integration is **optional and explicitly injected**, so no WASM bundle is automatically downloaded.

```ts
import {SpaceMapClient} from "@openlaunchsdk/earth";
import {createOpenJpegWasmBackend} from "@openlaunchsdk/raster";
// Install @cornerstonejs/codec-openjpeg separately in your secure backend.
import {OpenJPEGWASM} from "@cornerstonejs/codec-openjpeg";
const maps=new SpaceMapClient({
  jp2AllowedHosts:["<reviewed JP2 storage host>"],
  jp2Decoder:createOpenJpegWasmBackend(async()=>await OpenJPEGWASM),
  jp2MaxBytes:2*1024*1024,
  jp2MaxPixels:1_048_576,
});
const result=await maps.analyzeObservationJp2Qa({itemId:"<exact STAC ID>",area});
```

**Important:** test fixtures include a real independently OpenJPEG-encoded 8-bit JP2 but mock the codec implementation; production OpenJPEG WASM decoding has **not** been proven by CI. Only single-band 8-bit images, bounded full downloads and exact asset-level georeference are supported. Full-size Sentinel-2 JP2 exceeds these conservative defaults; windowed/reduced-resolution JP2 decoding and production validation remain future work. See [JP2 v1.17](docs/JP2_QA_V1_17.md). Fedora smoke: `npm run example:jp2-qa`.

## LZW GeoTIFF/COG decoding (v1.16 development)

TIFF Compression=5 (LZW) now works through `decodeGeoTiff()` and `readCogWindowUrl()`, on top of existing WGS84 UTM support. This uses a bounded TIFF-specific 9–12-bit MSB-first LZW decoder, including dictionary reset, TIFF early-change and strict exact block-size checks. It works for supported single-band GeoTIFF and COG data and can feed existing QA/SCL analysis.

```ts
import {readCogWindowUrl,bbox} from "@openlaunchsdk/raster";
const window = await readCogWindowUrl("https://reviewed-provider.example/QA.tif",bbox(14,50.9,14.1,51),{
  allowedHosts:["reviewed-provider.example"]
});
console.log(window.raster.values);
```

**JP2/JPEG2000 has not been implemented**: it requires a separate decoder and many native Sentinel-2 products are JP2. Multi-band/JPEG TIFF, generic projections and real-provider authorization quirks remain separate work. Offline smoke: `npm run example:lzw-geotiff`. See [v1.16 guide](docs/TIFF_LZW_V1_16.md).

## Native WGS84 UTM GeoTIFF/COG coordinates (v1.15 development)

Raster helpers now understand **EPSG:32601..32660** (WGS84 UTM north) and **EPSG:32701..32760** (WGS84 UTM south), in addition to EPSG:4326 and EPSG:3857. The same projection transformations apply in `decodeGeoTiff()`, `readCogWindowUrl()`, `analyzeAoiPixelQuality()`, `analyzeRemoteAoiPixelQuality()`, and the existing STAC-linked QA workflow. Projection is an ellipsoidal Transverse Mercator conversion, not a generic arbitrary CRS engine.

```ts
import {lonLatToGridCrs,gridCrsToLonLat} from "@openlaunchsdk/raster";
const utm=lonLatToGridCrs(14.4208,50.088,"EPSG:32633");
const geodetic=gridCrsToLonLat(...utm,"EPSG:32633");
```

UTM zone geometry is validated and outside-zone/invalid-hemisphere inputs are rejected. Byte-range COG cropping now samples geographic edges to bound projected windows. This **does not add JP2, LZW or multiband raster decoding**. Many Sentinel-2 SCL assets are JP2, so UTM alone does not complete all real-scene support. See [v1.15 guide](docs/UTM_COG_V1_15.md).

Fedora smoke: `npm run example:utm-cog`.

## STAC-linked scene QA analysis (v1.14 development)

`SpaceMapClient.analyzeObservationQa()` securely resolves a Sentinel-2 SCL or Landsat 8/9 QA_PIXEL asset from **the same official STAC scene ID** and analyzes actual raster mask pixels over the requested area. It uses the existing OpenLaunch bounded ranged COG reader; no arbitrary image URLs from a browser.

```ts
const maps=new SpaceMapClient({
 qaAllowedHosts:["<backend-reviewed image storage hostname>"],
 qaSignPlanetary:true // optional, for signed Landsat assets
});
const outcome=await maps.analyzeObservationQa({
 provider:"copernicus",collection:"sentinel-2-l2a",
 itemId:"<STAC ID from exploreObservations()>",
 area:yourAoi,
});
console.log(outcome.quality.usablePercentOfAoi);
```

The backend sets trusted storage hostnames. Supported TIFF formats are limited to single-band EPSG:4326/3857 and uncompressed/Deflate. Many real Sentinel-2 masks use UTM/JP2 and therefore explicitly fail pending decoder support. Scene association is established **by STAC item's asset reference**, not independent cryptographic proof (`independentlyVerifiedSceneAssociation:false`). No SAS URL is returned. Read [v1.14 guide](docs/STAC_LINKED_QA_V1_14.md). Offline Fedora smoke: `npm run example:linked-qa`.

## AOI Pixel Quality from real masks (v1.13 development)

`SpaceMapClient.analyzeAoiPixelQuality()` analyzes decoded, georeferenced Sentinel-2 L2A SCL or Landsat 8/9 C2 QA_PIXEL mask values **inside the user's actual polygon AOI**. It distinguishes clear/cloud/shadow/snow/unknown/nodata with null-safe percentages and optional science-pixel validity; no scene-cloud estimate is substituted for missing QA pixels.

`SpaceMapClient.analyzeRemoteAoiPixelQuality()` optionally reads a REAL single-band QA COG via trusted HTTPS host and HTTP range requests, then classifies its decoded pixels. This is a provider-neutral SDK capability, not a website implementation. Native UTM-only/JP2/unsupported compression remains a documented limitation. Scene association/acquisition are not independently verified. See [Pixel Quality v1.13](docs/AOI_PIXEL_QUALITY_V1_13.md).

Fedora smoke: `npm run example:aoi-pixel-quality`.

## Satellite Footprint Coverage (v1.12 development)

`SpaceMapClient.exploreObservations()` now returns `footprintCoveragePercent` for **approximate geometric overlap** of a satellite STAC footprint and the selected AOI polygon (including bbox, circle, Polygon and MultiPolygon with holes). Bad or missing footprint means `null`, never fabricated coverage. The backend can require `minFootprintCoveragePercent` to avoid selecting partial/unknown catalog footprint scenes.

```ts
const result = await maps.bestAvailablePreview({
  area:{center:[14.42,50.08],radiusKm:10},
  from:"2026-10-01",to:"2026-10-15",
  layers:["optical"],strategy:"balanced",
  minFootprintCoveragePercent:80,
  maxAttempts:3
});
console.log(result.selected?.observation.footprintCoveragePercent);
```

The score considers estimated STAC footprint overlap in addition to cloud/age/source resolution. **This does NOT verify that any actual delivered pixel covers the chosen AOI or that the AOI itself is cloud free.** It is not a geodesic-certified area calculation; complex geometries / dateline crossing may return `null`. The existing secure preview byte-delivery API remains unchanged. Fedora smoke: `npm run example:footprint-coverage`. See [v1.12 guide](docs/FOOTPRINT_COVERAGE_V1_12.md).

## Best Available Satellite Preview (v1.11 development)

Find a real STAC observation by location and obtain the highest-ranked *deliverable* preview without manually choosing a specific satellite. Uses existing `exploreObservations()` and `fetchObservationPreview()` SDK functions. Tries candidates **sequentially**, defaults to three attempts, hard maximum five.

```ts
import { SpaceMapClient } from "@openlaunchsdk/earth";
const maps = new SpaceMapClient({
  previewAllowedHosts:["<real reviewed preview storage hostname>"],
});
const result = await maps.bestAvailablePreview({
  area:{center:[14.42,50.08],radiusKm:10},
  from:"2026-10-01",to:"2026-10-15",
  layers:["optical"],strategy:"balanced",maxAttempts:3,
});
if (result.selected) console.log(result.selected.preview.contentType,result.selected.preview.image);
```

Ranking weighs declared scene-wide cloud percentage, provider acquisition metadata, the declared source resolution and optical suitability; `strategy:"recent"` emphasizes time. This heuristic does **not** compute AOI cloud cover or independently verify sensor capture. Each candidate must pass server-trusted HTTPS hostname restrictions, MIME and binary checks before being selected. Errors trigger bounded fallback and are sanitized. No raw/signed asset URLs are returned in the selected result. See [v1.11 Best Preview](docs/BEST_PREVIEW_V1_11.md). Offline Fedora smoke: `npm run example:best-preview`.

## Verified Satellite Previews (v1.10 development)

A user can now choose a **specific historical STAC observation** and obtain actual binary PNG/JPEG preview data from OpenLaunch. The provider STAC item is queried by ID; the image is streamed with strict size/time limits and checked for MIME and PNG/JPEG signatures. No raw catalog URL is accepted from a user request, and returned metadata does not include provider tokens or SAS signatures.

```ts
const maps = new SpaceMapClient({
  // Backend-only, static and reviewed. Check actual preview storage domains first.
  previewAllowedHosts: ["images.example.org"],
});
const preview = await maps.fetchObservationPreview({
  provider:"copernicus", collection:"sentinel-2-l2a", itemId:"real-provider-item-id",
});
// Send preview.image bytes with preview.contentType from a throttled backend endpoint.
```

The example uses placeholder storage host and item ID; configure actual verified provider hosts in your deployment. **Empty trusted hosts means no download.** Planetary Computer preview signing can be enabled with `previewSignPlanetary:true` and a trusted host for the resulting URL. This is only verified *image byte delivery*, not full-resolution pixels or independently verified satellite acquisition.

Offline test: `npm run example:observation-preview`. See [Preview Delivery v1.10](docs/OBSERVATION_PREVIEW_V1_10.md).

## Location-first Observation Explorer (v1.9 development)

A web visitor selects a location and date window without first knowing which satellite to use. `SpaceMapClient.exploreObservations()` searches the existing OpenLaunch Copernicus/Planetary Computer STAC adapters for optical Sentinel-2, SAR Sentinel-1, thermal Landsat C2 L2 scenes. Static DEM is opt-in.

```ts
import { SpaceMapClient } from "@openlaunchsdk/earth";
const maps = new SpaceMapClient();
const scenes = await maps.exploreObservations({
  area: { center: [14.42, 50.08], radiusKm: 10 },
  from: "2026-09-01", to: "2026-10-01",
  maxResults: 20, sort: "newest"
});
console.log(scenes.status,scenes.observations);
```

Bounded search, optional scene-level cloud filtering, provider isolation, normalized acquisition dates, declared resolution and unverified previews. **STAC results are catalog records, not actual downloaded images or verified pixel availability.** `status:"partial"` warns of provider failures; thumbnails may require signing. Use this metadata for discovery and route selected products through existing SDK imagery clients.

Test without internet or provider keys after `npm ci`: `npm run example:observation-explorer`. See [Observation Explorer v1.9](docs/OBSERVATION_EXPLORER_V1_9.md).

## Space Archive & Playback (v1.8 development)

`SpaceMapClient.archivePlayback()` exposes one chronological, backend-friendly frame format for **NASA GIBS daily WMTS** and **EUMETView Meteosat WMS**. The SDK never fabricates capture timestamps or presents a checked single NASA tile as a verified entire scene.

```ts
import { SpaceMapClient } from "@openlaunchsdk/earth";
const sdk = new SpaceMapClient();
const archive = await sdk.archivePlayback({
  source:"nasa-gibs",
  layer:"MODIS_Terra_CorrectedReflectance_TrueColor",
  from:"2026-10-01",to:"2026-10-05",maxFrames:5,
  verifyLast:2,sampleTile:{z:2,x:1,y:1},
});
console.log(archive.frames.map(f=>({time:f.time,delivery:f.delivery,url:f.mapUrl})));
```

For Meteosat, use `{source:"meteosat",layer,bounds3857,width,height,maxFrames,verifyLast}`. Only provider-advertised times are listed; actual WMS image verification is opt-in, bounded to eight most recent frames. This is an SDK data API, not a frontend player or permanent archive.

Offline Fedora test: `npm run example:space-archive`. Details: [Space Archive v1.8](docs/SPACE_ARCHIVE_V1_8.md).

## Shared Meteosat image cache (v1.7 development)

New optional shared cache contract `MeteosatSharedImageStore` and `MeteosatCloudflareKvStore` enable validated binary WMS images to survive separate backend SDK instances. Default behavior remains purely in-memory.

```ts
import { SpaceMapClient, MeteosatCloudflareKvStore } from "@openlaunchsdk/earth";
// Cloudflare Worker: env.SPACE_IMAGES is a KV namespace binding.
const store = new MeteosatCloudflareKvStore(env.SPACE_IMAGES);
const maps = new SpaceMapClient({meteosatCache:{sharedStore:store}});
const result = await maps.meteosatImage({
 layer:"provider:real-layer",bounds3857:[1300000,6200000,1900000,6900000],
 width:256,height:256,time:"2026-10-19T10:00:00Z"
});
console.log(result.cacheState); // miss / hit / shared-hit / coalesced / bypass
```

Requires explicit TIME, validated JPEG/PNG bytes and an expiration envelope. The adapter uses SHA-256 keys via Web Crypto and binary KV values, no extra npm dependency. KV is eventually consistent: it does **not** guarantee atomic cross-region deduplication. If KV is down, satellite downloads still work. See [Shared Cache v1.7](docs/METEOSAT_SHARED_CACHE_V1_7.md).

## Meteosat image cache (v1.6 development)

`SpaceMapClient` now owns a bounded per-process cache for **validated image bytes** with explicit Meteosat WMS TIME, short TTL (5 minutes), default 24 entries and 32 MiB budget. Errors, invalid imagery and default/latest WMS images are never cached. Concurrent identical requests share a single upstream request; returned byte buffers are defensively copied.

```ts
const maps = new SpaceMapClient({meteosatCache:{ttlMs:300000,maxEntries:24,maxBytes:32*1024*1024}});
const image = await maps.meteosatImage({
  layer: "provider:actual-layer", bounds3857:[1300000,6200000,1900000,6900000],
  width:256,height:256,time:"2026-10-19T10:00:00Z"
});
console.log(image.cacheState, image.image.byteLength, maps.meteosatCacheStats());
```

The image URL is an official EUMETView WMS GetMap URL, **not** a confirmation of the acquisition timestamp. Memory cache is local to one SDK/backend instance; Cloudflare Workers may have different instance lifecycles. Cache image handling is not a public proxy endpoint.

Offline Fedora test: `npm run example:meteosat-cache`. See [Meteosat Cache v1.6](docs/METEOSAT_CACHE_V1_6.md).

## Meteosat provider-time timeline (v1.4 development)

EUMETView WMS GetCapabilities now supplies actual advertised Time dimensions, inherited across nested WMS layers. `SpaceMapClient.meteosatTimeline()` converts explicit timestamps and fixed-cadence ISO8601 intervals into a bounded animation list, with WMS URLs for each advertised time. This **is not proof of acquisition, image availability or video**.

```ts
const maps = new SpaceMapClient();
const capabilities = await maps.meteosatCapabilities();
const layer = capabilities.layers.find(x=>x.timeDimension);
if (!layer) throw new Error("No time-aware Meteosat layer advertised");
const frames = await maps.meteosatTimeline({
  layer: layer.id, bounds3857:[1300000,6200000,1900000,6900000],
  width:256,height:256,maxFrames:12
});
console.log(frames.frames.map(x=>x.advertisedTime));
```

Offline local Fedora smoke: `npm run example:meteosat-timeline`. Opt-in live provider capability check: `METEOSAT_LIVE=1 npm run example:meteosat-timeline` (requires EUMETView access; no guarantee a public timestamp is available). Technical guide: [METEOSAT_TIMELINE_V1_4.md](docs/METEOSAT_TIMELINE_V1_4.md).

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
import { SpaceMapClient } from "@openlaunchsdk/earth";

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

**Release note:** Live Earth first appeared in v1.2; its layers and provider adapters are included in the published `@openlaunchsdk/earth` and `openlaunch-sdk` packages.

Details and security/integration examples: [Live Earth v1.2 architecture](docs/LIVE_EARTH_V1_2.md). Try offline: `npm run example:live-earth`.

---

Read [Space Data Foundation v1.3](docs/SPACE_DATA_FOUNDATION_V1_3.md) for the 18-layer Earth registry, availability probes and math extraction.

## Why OpenLaunch?

OpenLaunch started as a typed client for Launch Library 2, NASA and CelesTrak. It now includes STAC observation catalogs, real georeferenced TIFF pixel processing, SGP4/SDP4 satellite tracking, space-traffic geometry and generic launch-simulation tools.

**Modular packages separate data products from aerospace engineering.** A map application that needs Sentinel/Landsat catalogs and NDVI can use Earth and Raster without pulling in the trajectory engine or `satellite.js`.

## Modular packages

| Package | Purpose | Runtime dependencies |
| --- | --- | --- |
| `@openlaunchsdk/core` | Typed HTTP requests, caching, rate limits, retries, telemetry, normalized models | None |
| `@openlaunchsdk/earth` | STAC search, Copernicus, Planetary Computer, weather, AOI discovery | `@openlaunchsdk/core` |
| `@openlaunchsdk/raster` | GeoTIFF/COG reads, spatial clips, NDVI / NDWI / NDMI / NBR, quality masks, change analysis, DEM mesh | `@openlaunchsdk/core` |
| `@openlaunchsdk/launches` | Launch Library 2, NASA, launch resources and normalization | `@openlaunchsdk/core` |
| `@openlaunchsdk/orbit` | TLE/OMM, SGP4/SDP4, ground passes, space-traffic checks, swath/CZML | `@openlaunchsdk/core`, `satellite.js` |
| `@openlaunchsdk/math` | Independent vector/matrix/quaternion algebra, numerics, statistics and control | `@openlaunchsdk/core` |
| `@openlaunchsdk/engineering` | Optional rocket and mission engineering and trajectory simulations | `@openlaunchsdk/core`, `@openlaunchsdk/orbit`, `@openlaunchsdk/math` |
| `openlaunch-sdk` | Backward-compatible **umbrella** API with all functions | `satellite.js` |

Every scoped package has separate **ESM, CommonJS and TypeScript declaration** entrypoints. The monorepo uses npm workspaces and a build step that copies only the reachable, compiled modules into each package. The original TypeScript source remains under `src/` for now; it has **not** yet been physically moved to `packages/*/src`.

### Package size

Package archive sizes vary by release. Measure the current version with `npm run pack:check:packages` and `npm pack --dry-run --workspaces=false`. These are **not** browser bundle sizes, network download times or installed disk usage.

## Quick start

### Run from GitHub source

Requirements: **Node.js 18+**, npm and network access for `npm ci`.

```bash
git clone https://github.com/kobyldav/openlaunch-sdk.git
cd openlaunch-sdk
npm ci
npm run check
npm run example:raster
```

The workspaces are linked locally by npm, so the scoped imports work immediately **inside the checked-out repository**.

### Install selected npm packages

```bash
npm install @openlaunchsdk/earth @openlaunchsdk/raster
# Or just launch information:
npm install @openlaunchsdk/launches
# Orbital tracking requires satellite.js:
npm install @openlaunchsdk/orbit
```

**Do not assume these installation commands work from the public npm registry yet.** Publishing requires verified access to the `@openlaunch` scope and a separate release process. An existing older `openlaunch-sdk` version from npm is not automatically the v1.1.0 code on GitHub.

## Earth observation & raster example

This is the practical combination for a map application over the Czech Republic. It separates **catalog metadata** from **actual pixel data**:

```ts
import { EarthCatalogClient, bbox } from "@openlaunchsdk/earth";
import {
  readCogWindowUrl,
  rasterStatistics,
  ndviRaster,
  alignRasterTo,
  calibrateRasterFromStac,
} from "@openlaunchsdk/raster";

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
import { LaunchDataClient } from "@openlaunchsdk/launches";

const data = new LaunchDataClient(); // optional LL2 API key, custom fetch/cache
const next = await data.launches.next();
if (next) console.log(next.name, next.net);
```

The `launches` workspace includes typed LL2 launch/rocket/agency/astronaut/event/pad resources and NASA provider helpers. API rate limits, access restrictions and upstream availability still apply.

## Orbital tracking and engineering

```ts
import { Sgp4Satellite } from "@openlaunchsdk/orbit";
import { simulateLaunch } from "@openlaunchsdk/engineering";
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
