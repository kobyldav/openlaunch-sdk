# OpenLaunch SDK v1.18 — real OpenJPEG WebAssembly integration

This development version builds directly on merged v1.17 and keeps all earlier OpenLaunch APIs.

## What is validated

A dedicated GitHub Actions job on Node 20/22 runs the real `@cornerstonejs/codec-openjpeg@1.3.6` wasm decoder against a self-contained independent 3×2 lossless JP2 fixture. Unlike the earlier v1.17 dummy adapter, the emitted pixel values **must** match six known samples `[4,8,9,3,11,6]` from an original Sentinel-2-style SCL mask fixture. The job checks header, georeference, pixel validity, STAC item association, signed-link redaction and AOI classification.

No third-party WASM package is installed in ordinary `npm ci`. Only the dedicated integration workflow installs the version-pinned test codec. Runtime users opt in and explicitly provide the backend's decoder factory.

```ts
import {SpaceMapClient} from "@openlaunch/earth";
import {createOpenJpegWasmBackend} from "@openlaunch/raster";
import makeOpenJpegModule from "@cornerstonejs/codec-openjpeg/decodewasmjs";
const codec = await makeOpenJpegModule(); // configure local wasm path as needed
const maps = new SpaceMapClient({
 jp2AllowedHosts:["<backend reviewed storage hostname>"],
 jp2Decoder:createOpenJpegWasmBackend(async()=>codec)
});
const result=await maps.analyzeObservationJp2Qa({itemId:"<official STAC ID>",area});
```

## Fedora

```bash
git fetch origin
git switch feature/openjpeg-wasm-validation-v1.18.0
git pull --ff-only origin feature/openjpeg-wasm-validation-v1.18.0
npm ci
npm run example:jp2-qa
# Opt-in, requires network for npm install:
npm install --no-save --package-lock=false --ignore-scripts @cornerstonejs/codec-openjpeg@1.3.6
npm run example:openjpeg-real
```

The first smoke is offline and uses a deterministic adapter; the second executes actual wasm decoder code with the same JP2 fixture.

## Honest limitations and security

The test is **real codec decoding of a fixture**, not verification of arbitrary production Sentinel-2 JP2 availability or authorization. The existing 2 MiB maximum-by-default and 8 MiB hard byte budget, pixel limits, explicit asset-level `proj:*` metadata, HTTPS host allowlisting, no redirect and sanitized error messages remain in place. A full native JP2 file generally exceeds safe budgets; it is rejected, not silently downsampled. Exact AOI window decoding and decompression resource isolation require further work. Run untrusted JP2 decode in a worker/process with hard memory/CPU limits. Provider catalog item association is not independent cryptographic proof of capture time or product authenticity.
