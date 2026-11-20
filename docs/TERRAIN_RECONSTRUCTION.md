# Experimental stereo terrain reconstruction

The new terrain engine estimates a digital **surface** model (DSM), not bare-earth DTM. No external elevation provider, DEM or remote reconstruction is used. Input imagery and calibration must be independent and correctly registered. The RPC camera uses RPC00B polynomial order; pixel centres are zero-based and heights are WGS84 ellipsoidal metres. Correct any vendor pixel-origin convention before use.

## Pipeline

- Use calibrated RPC, frame/pinhole or line-by-line pushbroom cameras (monotonic scan geometry). Supply grayscale samples; NaN marks invalid/cloud pixels. Radiometric normalization is implicit in zero-mean NCC.
- Project a ground patch at candidate heights into the original images. Compare using bilinear interpolation and normalized cross-correlation. This object-space approach does not require pre-rectification.
- Reject low texture, missing samples, ambiguous peaks, height-range edges and insufficient differential parallax. Refine the best height with a local parabolic fit.
- Return DSM and heuristic confidence rasters, source intensity texture, WGS84 ECEF point cloud and origin-relative ECEF mesh. Invalid cells are NaN and no faces cross holes. Confidence is not an uncertainty probability.
- Validate against independent ellipsoidal checkpoints with bias, MAE and RMSE. No automatic claim of centimetre or metre accuracy.

```ts
import { OpenLaunch, createTerrainRpcCamera } from "openlaunch-sdk";
// left/right are decoded intensity images with matching vendor calibration.
const space = new OpenLaunch();
const result = space.terrain.reconstruct({
  images: [
    { ...left, source: "left", camera: createTerrainRpcCamera(leftRpc) },
    { ...right, source: "right", camera: createTerrainRpcCamera(rightRpc) }
  ],
  grid: {width: 100, height: 100, crs: "EPSG:32633",
    transform: [460000, 15, 0, 5540000, 0, -15]},
  minHeightM: 100, maxHeightM: 1000, heightStepM: 15,
  maxWork: 40_000_000
});
```

ASTER catalog: `space.terrain.discoverAster({bounds:[14,49,15,50],from:new Date("2020-01-01"),to:new Date("2020-12-31")})`. NASA CMR AST_L1A v004: https://doi.org/10.5067/ASTER/AST_L1A.004. CMR search documentation: https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html. Discovery is not evidence of a usable stereo pair. Download HDF-EOS with Earthdata authorization, extract 3N/3B images and precise calibrated geometry. The SDK does not yet parse native ASTER HDF-EOS metadata or derive camera poses automatically; TLE is insufficient. Generic pushbroom accepts already calibrated per-line ECEF poses. GeoTIFF intensity extraction is possible using existing raster functions for supported files, with explicit vendor calibration. No live ASTER reconstruction or ICESat-2 validation is claimed.

## Limits and next validation

CPU height sweep is intentionally bounded; tile large AOIs. Local planar patch assumption can fail on steep slopes, water, vegetation motion, shadows, clouds and occlusion. RPC normalization is bounded and pushbroom assumes monotonic projection. Multi-view currently averages correlations against the first image, not robust bundle adjustment. Mesh is ECEF-relative, not ENU; retain origin for positioning. No automatic cloud classification, bare-earth filtering, texture UV atlas, native HDF reader, WebGPU, InSAR or LiDAR inversion. Use a real calibrated stereo pair and compare with independently surveyed/ICESat-2 checkpoints in the same datum before making accuracy claims. Synthetic tests exercise geometry and recovery, not operational satellite accuracy. No new runtime dependency.

Use `validateTerrainGeodetic` for lon/lat checkpoints and `terrainPointCloudPly` to export the ECEF point cloud (double precision). Run the offline synthetic example `examples/21-terrain/01-stereo-height.ts` after compiling examples; it requires no external data or key.

## Windows visual demo

From the feature branch, run `npm ci` and `npm run example:terrain`. Open `test-results/terrain-demo/terrain.html` in a browser. It is self-contained and supports rotation and zoom. Other outputs: OBJ (local Y-up metres), PLY (ECEF), CSV (WGS84 coordinates and reconstructed elevations), input PGM images, JSON report. The example renders three synthetic calibrated views of non-flat terrain, reconstructs using only their intensities and calibration, and compares to the known synthetic height surface. It is not a real ASTER scene. Run `node scripts/terrain-windows-demo.mjs another-output-folder` after building to change output directory.

## Real stereo experiment (Windows)

Run `npm run example:terrain-real` for the public ASTER archive from https://github.com/NeoGeographyToolkit/StereoPipelineSolvedExamples/releases/tag/ASTER (152 MB). Only Band3N/B TIFFs and camera RPC XML are extracted; supplied DEMs and stereo outputs are never read. Download caching is by archive size; not a cryptographic integrity guarantee. The demo selects a textured common AOI by image variance or accepts --lon --lat. Raw and refined height samples remain separate. The viewer has vertical exaggeration, intensity shading and explicit quality flags; interpolated samples are not measured heights. The OBJ is a local approximate grid, not a survey product.

For other sensor data: `npm run example:terrain-real -- --left left.tif --right right.tif --left-xml left.xml --right-xml right.xml --lon 15.73 --lat 50.74`. TIFF RPC tag 50844 can replace XML. Inputs must be original sensor images, not orthorectified images or DEMs. XML supports standard RPC00B/DigitalGlobe RPB zero-based offsets. Optional --size, --resolution, --min-height, --max-height and --height-step. Native ASTER HDF-EOS is still unsupported. `npm run example:terrain-real -- --snezka` discovers candidate ASTER granules, not stereo-ready images; no automated reconstruction from that catalog yet. No independent real-scene accuracy claim.

### Real-scene quality correction

The broad RPC validity range is not a terrain elevation estimate. The default demo now runs an image-only fine-step sparse pilot, identifies a coherent height cluster, then runs a dense finer sweep in that band. No DEM is used for the pilot or reconstruction. A Mapzen HGT reference is retrieved only after reconstruction for the bundled ASTER example; the quality gate checks centered RMSE (datum offset removed) and uncorrected mean difference. Reference source is a composite including SRTM, not survey truth. Explicit height bounds bypass the pilot; `--no-reference` skips independent comparison. The display and OBJ suppress triangles across implausibly large height jumps, without altering raw measurements. Viewer defaults to true vertical scale and fits vertical extent.

### Local stereo recovery

The optional `recoverMissing` pass revisits unmatched cells with smaller and larger patches, bounded by a robust neighborhood from the first-pass stereo heights. It requires new image correlation evidence and never inserts a neighbor height directly. The first-pass heights remain unchanged, and neither pass uses a DEM. `matchPass` records initial vs recovered stereo. The demo enables recovery by default; use `--no-recovery` for an A/B comparison. Quality view distinguishes recovered stereo (blue) from initial stereo (green) and interpolated points (orange). Large unsupported gaps remain visible. Recovery can introduce false matches, so the independent reference gate remains enabled for the bundled scene.

## Source selection

See [AERIAL_TERRAIN.md](AERIAL_TERRAIN.md) for switching satellite/aerial inputs and the Windows source selector. Real ASTER and synthetic perspective aerial examples are explicitly distinguished.

### Image-evidence peak refinement

`peakRefinement: "image-evidence"` optionally refines the best discrete height using nine bounded one-dimensional golden-section iterations, each time reprojecting the actual input pixels and recomputing normalized cross-correlation. This is **not** a resampling of any reference DEM or interpolation of heights from nearby points. It cannot fix wrong coarse matches, calibration drift, or occlusion. The real ASTER/S2P examples now use it; pass `--parabolic` to the ASTER example for A/B comparison. Subpixel numerical optimization does not guarantee subpixel or sub-metre physical accuracy.

### Large AOIs via tiled reconstruction

Use `reconstructTerrainTiled({source,grid,minHeightM,maxHeightM,heightStepM,tileSize:32,onTile})` for mosaics up to 1 million output points. Each tile uses the same original sensor images, independent NCC matching and globally offset affine geometry; no predicted heights or DEM are passed between tiles. Assembled output contains full-sized DSM, confidence, texture, point cloud and mesh. `maxAdjacentRiseM` excludes unusually steep triangles but retains the original measurements. Tile-progress callbacks are available; the method is synchronous and should run inside a worker in a browser. `npm run example:terrain-benchmark -- --case s2p-triplet-large` provides an **optional**, more expensive 128x128 real-satellite test; it may fail, which is useful validation rather than a hidden fallback.

### Physical support of image matching

`patchSpacingScale` decouples how far apart input **image matching samples** are taken from how densely output DSM pixels are placed. At 15 m terrain output resolution a `patchSpacingScale: 2` spans a 30 m ground-grid step in the NCC patch, matching the 30 m output configuration's photometric support. This does not invent sensor resolution. The ASTER demo uses `Math.max(1,30/resolutionM)` unless `--patch-spacing-scale` is supplied. The continuous `--image-evidence` optimization remains optional: in the first real benchmark it did not improve RMSE and increased runtime, so the default stays parabolic until comparative tests justify changing it.
