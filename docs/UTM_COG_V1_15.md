# OpenLaunch SDK v1.15 — WGS84 UTM GeoTIFF and COG

**Status:** development branch, not published on npm or deployed to production.

## Added

- `EPSG:32601`–`EPSG:32660` for northern WGS84 UTM and `EPSG:32701`–`EPSG:32760` for southern WGS84 UTM.
- WGS84 ellipsoidal Transverse Mercator forward and inverse formulas, with zone/hemisphere/latitude bounds.
- GeoTIFF `ProjectedCSTypeGeoKey` 3072 handling for UTM, preserving EPSG:4326/3857 compatibility.
- `clipRasterToAoi()` and remote COG `pixelBounds()` project a sampled bounding envelope for curved geographic edges; pixel-center polygon masks remain the final AOI filter.
- Applies transparently to `SpaceMapClient.analyzeRemoteAoiPixelQuality()` and `analyzeObservationQa()` where the STAC QA asset is a supported single-band COG.

```ts
import {lonLatToGridCrs,gridCrsToLonLat,readCogWindowUrl} from "@openlaunch/raster";
const [x,y]=lonLatToGridCrs(14.4208,50.088,"EPSG:32633");
const [lon,lat]=gridCrsToLonLat(x,y,"EPSG:32633");
const clipped=await readCogWindowUrl("https://reviewed-provider.example/QA.tif",area,{
 allowedHosts:["reviewed-provider.example"]
});
```

## What is *not* added

This is not generic PROJ, not a JP2/JPEG2000 decoder, nor native COG reprojection to EPSG:4326. WGS84 UTM conversion is accurate within its normal zone of use and should not be used for distant areas outside that zone. EPSG:258xx/other datums, arbitrary local grids, multi-band image and LZW/JPEG TIFF compression still return explicit errors. Tests use real generated TIFF bytes and simulated range servers; no live provider access is implied. STAC-to-asset identity is based on provider metadata, not independent cryptographic proof.

## Fedora quick smoke

```bash
git fetch origin
git switch feature/utm-cog-support-v1.15.0
git pull --ff-only origin feature/utm-cog-support-v1.15.0
npm ci
npm run example:utm-cog
```

Expected output starts with Prague EPSG:32633, Cape Town EPSG:32734 and Sydney EPSG:32756 coordinates, and ends with `PASS OpenLaunch v1.15 WGS84 UTM + raster transforms`. The full `npm test` includes binary TIFF/COG and QA UTM tests.
