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
