# OpenLaunch SDK v1.0.0 — Real Raster Analytics

**Release channel:** `feature/geospatial-raster-v1.0.0` until reviewed/merged. Version 1.0.0 is a source-tree milestone, **not automatically an npm-published release**.

v0.9 could find STAC scenes and download opaque image preview bytes. v1.0 introduces **actual georeferenced raster values**, explicit per-band calibration, pixel masking, NDVI/change analyses and a local terrain triangle mesh.

## End-to-end data flow

```text
STAC scene and its provider asset
       ↓ (real bytes, not fabricated pixels)
EarthIntelligenceClient.readRasterWindow(item, "B04", aoi, options)
       ↓ HTTP 206 Range + TIFF IFD + only necessary Deflate tiles
RasterGrid { width, height, crs, affine transform, Float64Array }
       ↓ apply native STAC raster:bands scale/offset and quality mask
calibrateRasterFromStac → maskRasterBySentinel2Scl
       ↓ align to a common georeferenced pixel grid
alignRasterTo → ndviRaster → rasterDifference → rasterStatistics
       ↓ user-facing image bytes / local 3D
renderRasterRgb (RGBA) / elevationToLocalMesh (local coordinates)
```

All real input URLs must be taken from trusted provider STAC responses, authorized when necessary and passed through an explicit allowed-hosts list.

## Remote COG, reading actual data without downloading entire raster

```ts
import {
  OpenLaunch, bbox, calibrateRasterFromStac, alignRasterTo,
  ndviRaster, rasterStatistics,
} from "openlaunch-sdk";

const space = new OpenLaunch();
const area = bbox(14.40, 50.07, 14.45, 50.11);
const result = await space.earth.searchImagery({
  area,
  from: new Date("2026-09-01T00:00:00Z"),
  to: new Date("2026-10-13T00:00:00Z"),
  source: "planetary-computer",
  sensor: "optical",
  limit: 5,
});
const scene = result.features[0];
if (!scene) throw new Error("No scene found");

// Inspect keys first: collection-specific naming conventions vary.
// Example assumes B04/B08 exist as single-band Deflate GeoTIFF assets.
const redAsset = scene.assets.B04;
const nirAsset = scene.assets.B08;
if (!redAsset || !nirAsset) throw new Error("Bands unavailable as requested GeoTIFF assets");

// Sign private assets with space.planetaryComputer.signAsset(redAsset)
// and use a matching STAC item containing the signed links when required.
const opts = {
  allowedHosts: ["trusted.provider.example.org"], // REPLACE using provider asset URL host
  maxPixels: 1_048_576, maxBlocks: 128,
};
const red = (await space.earth.readRasterWindow(scene, "B04", area, opts)).raster;
const nir = (await space.earth.readRasterWindow(scene, "B08", area, opts)).raster;

// STAC raster:bands calibration is only used when metadata exists.
const calibratedRed = calibrateRasterFromStac(red,redAsset).grid;
const calibratedNir = calibrateRasterFromStac(nir,nirAsset).grid;
const matchingNir = alignRasterTo(calibratedNir,calibratedRed);
console.log(rasterStatistics(ndviRaster(calibratedRed,matchingNir)));
```

**This is an integration pattern, not a claim that any specific live item exposes those exact asset names/encodings.** Verify the STAC item and URL before use. Some collections use common band names rather than B04/B08, may return multi-band images or JPEG2000 and may require SAS token signing. The range reader intentionally rejects unsupported encodings.

### Supported TIFF data (validated in offline fixtures)

| Feature | v1.0.0 |
|---|---|
| Classic TIFF and BigTIFF IFD | yes |
| GeoTIFF ModelPixelScale/ModelTiepoint, ModelTransformation | yes, affine |
| EPSG:4326, EPSG:3857 | yes |
| 8/16/32-bit integer, 32/64-bit float | yes, one band |
| Uncompressed or Deflate (TIFF compression 1/8/32946) | yes |
| Integer horizontal predictor 2 | yes |
| Standard strips and tiles | yes |
| Embedded GDAL nodata ASCII (42113) | yes |
| Remote selected strips/tiles | yes, HTTP 206 Content-Range required |
| Multi-band pixel-interleaved, JPEG/LZW/JP2 | **not supported** |
| Arbitrary UTM/geographic CRS transformation | **not supported** |
| Float predictor 3, large cloud image tiles beyond guard | **not supported** |
| Reproject nonmatching CRSs automatically | **not supported** |
| Full COG overviews or adaptive pyramid selection | **not supported** |

The simpler `decodeGeoTiff(bytes)` accepts bounded, already-downloaded TIFF bytes. `space.earth.downloadRaster(item,key,options)` fetches the entire single-band asset through the existing 64 MiB controlled downloader; for large COGs **prefer** `readRasterWindow`.

`readRasterWindow` validates trusted HTTPS origins, explicitly denies redirects, requires `206` and correct `Content-Range`, limits pixel allocations, compressed/uncompressed block sizes, block count, and request duration. It reads TIFF metadata at the front and fetches only intersecting tiles. Metadata too far from the start of the source or block layouts unsupported by the decoder fail explicitly; no silent full-file fallback.

**Security:** The URL allowlist is a caller-provided boundary. For untrusted catalog ingestion on a server, an enforcing egress proxy / DNS-resolved private-address block is still required to protect against DNS rebinding. Review providers' licensing and caching policies before redistributing downloaded pixels.

## Pixel grid model and spatial correctness

`RasterGrid` carries width/height, `EPSG:4326` or `EPSG:3857`, an affine *pixel-corner* geotransform `[a,b,c,d,e,f]`, row-major Float64 samples, `NaN` for missing pixels, and optional source/unit provenance.

- `clipRasterToAoi(grid,aoi)`: geographic AOI bbox or polygon crop with pixel-centre masking; input AOI is always longitude/latitude.
- `alignRasterTo(source,reference,method)`: resample source to the exact CRS/grid of reference using nearest or bilinear interpolation. **Does not reproject between CRS systems.**
- `rasterStatistics(grid)`: count, valid, min/max/mean/sum.
- `rasterDifference(before,after)`: follow-up minus baseline, only for aligned finite pixels.
- `ndviRaster(red,nir)`: (NIR-red)/(NIR+red) for valid, aligned numeric pixels. Invalid/zero-denominator pixels are `NaN`, not artificial NDVI=0.
- `calibrateRaster(grid,{scale,offset,noData,unit})`: explicit raw-to-physical calibration.
- `calibrateRasterFromStac(grid,asset)`: demands explicit STAC `raster:bands` scale **and** offset. Never guesses physical reflectance from raw DN.
- `maskRasterBySentinel2Scl(grid,scl)`: rejects clouds, shadows, snow, unknown and missing pixels by default; requires same pixel grid. A scene-level cloud percentage is not a substitute for this mask.
- `renderRasterRgb(red,green,blue,{ranges,gamma})`: returns `Uint8ClampedArray` of RGBA bytes with nodata transparency; not a PNG file.

Calibration and masks must be applied to real raster pixels supplied by a provider. `renderRasterRgb` expects calibrated, aligned bands — passing arbitrary DN with default [0,1] channel ranges will clip most values.

### Terrain mesh

`elevationToLocalMesh(dem,{verticalExaggeration})` converts *already decoded* EPSG:3857 elevation cells (assumed **metre** height samples) into local X/Y/Z vertices and triangles, omitting NoData triangle faces. This is not a glTF, not geographic/ECEF terrain and not a ready-to-render Cesium 3D tile. The caller must establish height units/datum from DEM metadata. To render, upload positions/indices to a 3D engine and separately handle geographic placement/texturing.

## Examples & verification

```bash
npm ci
npm run check
npm run example:raster
npm run example:mission
npm run example:launch
npm run pack:check
```

`scripts/geospatial-raster-demo.mjs` constructs deterministic **real TIFF binary bytes** and decodes them through the actual production functions. The test suite covers classic TIFF, BigTIFF, zlib Deflate+integer predictors, AOI boundary correctness, NaN masks, EPSG transforms, NDVI, change analysis, local mesh, HTTP Range responses, disallowed hosts and radiometric calibration.

Live multi-provider STAC and signed-asset integration requires external network credentials/availability and is **not asserted by offline CI**.

## Remaining work after v1.0

1. Robust multi-band COG/JP2/LZW and arbitrary EPSG support, ideally through a well-maintained geospatial decoding backend.
2. Full nonlocal terrain export and actual imagery draping with projected CRS and vertical reference.
3. Actual provider-specific image validation, STAC band naming conventions, signed links and pixel-grid co-registration.
4. Better large AOI range scheduling, byte-cache, cancellation and S3/CDN retry handling.
5. Radiometric provider presets validated per product version, not applied blindly.
6. Formal security review of remote-source data pipelines, especially untrusted DNS/redirect/IP egress.
