# OpenLaunch SDK v1.19 — bounded JP2 reduced-resolution decoding

**Status:** development PR, not npm publication or real provider availability verification.

JPEG2000 supports wavelet decomposition. The optional OpenJPEG WASM adapter now calls `decodeSubResolution(level,0)` when a positive decomposition level is selected, instead of `decode()` at full resolution. Level 0 is unchanged. Level 1 corresponds approximately to 1/2 resolution in each dimension, level 2 to 1/4, level 3 to 1/8 and level 4 to 1/16. Actual decoded samples remain QA/SCL categories returned from the JPEG2000 decoder, not a nearest-neighbor downsample of already materialized full pixels.

```ts
const maps=new SpaceMapClient({
 jp2AllowedHosts:["<trusted storage host>"],
 jp2Decoder:yourRealOpenJpegBackend,
 jp2DecompositionLevel:2,
 jp2MaxPixels:1_048_576,
 jp2MaxSourcePixels:16_777_216,
});
const output=await maps.analyzeObservationJp2Qa({
 itemId:verifiedSceneId,area:yourAoi
});
console.log(output.effectivePixelScale,output.decodedWidth,output.decodedHeight);
```

## Strict limitations

- JP2 still downloads the **entire compressed file** over HTTPS. The default 2 MiB and hard 8 MiB byte budgets are unchanged. No AOI-selective range or tile fetches.
- Original source dimensions are bounded by `maxSourcePixels` (default/hard 16,777,216); output pixel count is independently bounded (default 1,048,576, hard 4,194,304). This reduces decoded buffer size, but does not guarantee WebAssembly intermediate memory use and execution time; always isolate untrusted decode.
- Coarser output uses enlarged pixel footprints and alters cloud-class statistics. It is not an exact full-resolution cloud analysis or a proof of cloud-free pixels at native resolution.
- Affine georeference is derived from the STAC asset's exact `proj:*` and transformed for the selected resolution factor. Scene association remains based on provider STAC metadata, not cryptographic validation.
- Real wasm test uses a genuine independently encoded 32×32 uniform-class SCL JP2. It does **not** prove support for huge operational Sentinel-2 scenes or production endpoints.
- Only one unsigned 8-bit component, JPEG2000 JP2 box format and supported CRS continue to be accepted.

## Fedora

```bash
git fetch origin
git switch feature/jp2-reduced-resolution-v1.19.0
git pull --ff-only origin feature/jp2-reduced-resolution-v1.19.0
npm ci
npm run example:jp2-reduced
# Real WASM integration, requires optional npm codec:
npm install --no-save --package-lock=false --ignore-scripts @cornerstonejs/codec-openjpeg@1.3.6
npm run example:jp2-reduced-real
```

The offline test runs a deterministic decoder to verify geometry and budgets. The second uses the actual pinned OpenJPEG WebAssembly codec and checks exact sample values and AOI geometry.
