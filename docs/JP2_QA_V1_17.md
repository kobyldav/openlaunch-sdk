# OpenLaunch SDK v1.17 — JPEG2000 / JP2 QA integration

**Status:** development branch only; previous TIFF support remains intact. No npm publication or web deployment.

## Scope

JP2 is not TIFF LZW. This feature adds an explicit, opt-in OpenJPEG/WASM decode adapter for **8-bit single-component Sentinel-2 SCL JP2 images**. `readJp2Header` checks the JP2 signature box and IHDR dimensions, component count and bit depth before invoking the codec. `decodeJp2Raster` requires the injected decoder to return matching samples and uses explicit `proj:shape`, `proj:transform`, `proj:epsg` from **the exact JP2 asset**, never borrowing a different resolution transform from its parent STAC scene.

Use the `@cornerstonejs/codec-openjpeg` package separately in a backend that supports its WASM requirements:

```bash
npm install @cornerstonejs/codec-openjpeg
```

```ts
import {OpenJPEGWASM} from "@cornerstonejs/codec-openjpeg";
import {createOpenJpegWasmBackend} from "@openlaunch/raster";
import {SpaceMapClient} from "@openlaunch/earth";
const maps=new SpaceMapClient({
 jp2AllowedHosts:["<trusted provider JP2 hostname>"],
 jp2Decoder:createOpenJpegWasmBackend(async()=>await OpenJPEGWASM),
 jp2MaxBytes:2*1024*1024,
 jp2MaxPixels:1_048_576,
});
const report=await maps.analyzeObservationJp2Qa({
 itemId:"<real Sentinel-2 L2A STAC scene ID>",area:yourAoi
});
console.log(report.quality.usablePercentOfAoi);
```

The SDK itself has **no direct WASM package dependency**; the integration is optional. Hostname allowlists must be set server-side; never take hosts or untrusted asset URLs from browser callers. Full byte retrieval is limited to 2 MiB by default and 8 MiB absolute maximum; decoded cells default to 1,048,576 and are capped at 4,194,304. Oversized native Sentinel-2 full granules explicitly fail rather than force a full 100+ MiB decode.

## Evidence boundaries

- Unit tests use a genuine 3×2 JP2 encoded with Pillow/OpenJPEG, but the decoder backend is a deterministic mock. **Actual WASM decoding is not CI verified.**
- JPEG2000 decoded image bytes are not enough to establish correct spatial alignment: asset-specific STAC projection metadata is mandatory and must match dimensions.
- `linkedFromStacItem:true` is catalog-based association; independent scene authenticity and satellite acquisition are not verified.
- Not a general-purpose JPEG2000 loader. No support for 16-bit/multiband, raw J2K codestream, partial-range JP2 retrieval, multi-resolution JP2 codestream cropping, or unsupported coordinate frames.
- Security-sensitive services should run the codec in an isolated worker/process with hard memory and CPU limits.

## Fedora check

```bash
git fetch origin
git switch feature/jp2-qa-v1.17.0
git pull --ff-only origin feature/jp2-qa-v1.17.0
npm ci
npm run example:jp2-qa
```

Expected `PASS OpenLaunch v1.17 JP2 STAC SCL Pipeline` and 2 clear/2 cloud pixels with the mocked decoder. To validate real OpenJPEG WASM and actual production Sentinel-2 data, configure the optional dependency and reviewed live storage endpoints in a separate integration test.
