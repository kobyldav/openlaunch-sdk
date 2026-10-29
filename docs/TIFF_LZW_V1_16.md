# OpenLaunch SDK v1.16 — TIFF LZW support

**Status:** development PR. Not yet published or deployed.

The raster SDK now decodes single-band TIFF Compression=5 lossless LZW blocks in addition to none/Deflate. The decoder uses TIFF 6.0 MSB-first bit packing, 256 clear / 257 end codes, 9–12-bit dictionary entries and TIFF EarlyChange=1. Decoding fails if streams are truncated, malformed, have a bad expansion, or produce a different number of bytes than the TIFF block geometry permits.

## Reused functions

- `decodeGeoTiff(bytes)` accepts classic TIFF/BigTIFF LZW strips and tiles.
- `readCogWindowUrl(url,area,{allowedHosts})` reads only selected LZW-compressed remote blocks using HTTPS, HTTP Range, 206 Content-Range, and the existing byte/time/tile/pixel budgets.
- `analyzeRemoteAoiPixelQuality()` / `analyzeObservationQa()` can classify SCL and Landsat QA masks when their scene-specific asset is a supported TIFF.
- WGS84 EPSG:4326, Web Mercator EPSG:3857, and WGS84 UTM EPSG:326xx/327xx remain available from v1.15.

```ts
import {readCogWindowUrl,bbox} from "@openlaunchsdk/raster";
const output=await readCogWindowUrl("https://reviewed-provider.example/SCL.tif",
  bbox(14,50.9,14.1,51),{allowedHosts:["reviewed-provider.example"]});
```

**Limitations:** JP2/JPEG2000 is a different codec and is NOT supported. Common Sentinel-2 native SCL JP2 needs a separate codec. Multi-band/JPEG TIFF, projections beyond those named, full-resolution remote source licensing, source-to-scene cryptographic verification and live-provider availability are also NOT guaranteed. No generic internet proxy or arbitrary URL from browser input. The only new verified capability is handling LZW-compressed TIFF bytes supplied by trusted servers.

## Verification on Fedora

```bash
git fetch origin
git switch feature/lzw-geotiff-v1.16.0
git pull --ff-only origin feature/lzw-geotiff-v1.16.0
npm ci
npm run example:lzw-geotiff
```

Expected last section: `PASS OpenLaunch v1.16 TIFF LZW GeoTIFF and COG` with 6 decoded SCL samples. Run `npm test` for a real independently LZW-compressed 32×32 TIFF regression, security constraints, QA and HTTP range tests. CI validates Node.js 18,20,22.
