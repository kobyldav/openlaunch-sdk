# Aerial and satellite terrain source selection

`OpenLaunch.terrain.reconstructFromSource({source:{kind:"satellite" | "aerial",images},grid,minHeightM,maxHeightM,heightStepM})` selects an input camera family and calls the same local stereo engine. Source selection does not retrieve an existing DEM. Satellite images support RPC and calibrated pushbroom. Aerial images support ECEF pinhole poses and WGS84 UTM 3×4 camera projection matrices (undistorted images). The result is a DSM height field, not a full 3D building/facade model.

## Windows

```cmd
npm run example:terrain-source
start "" "test-results\terrain-sources.html"
```

Both scenes are generated: real ASTER archive and a synthetic aerial scene with three perspective cameras. The selector links to both offline 3D viewers. They do not depict the same region. To run only one use `npm run example:terrain-source -- --source satellite --size 32` or `npm run example:terrain-source -- --source aerial`.

For actual aerial imagery, prepare a manifest and run:

```cmd
npm run example:terrain-source -- --source aerial --manifest "C:\data\aerial.json"
```

Manifest v1: `sourceKind:"aerial"`, `verticalDatum:"WGS84 ellipsoid"`, `grid` (width, height, crs, transform), `resolutionM`, `minHeightM`, `maxHeightM`, `heightStepM`, `images` (2–8). Each image: relative `file` to an undistorted single-band TIFF, unique `source`, `calibration:{kind:"projected",camera:{crs,worldOffset:[east,north,height],matrix:[12 row-major values]}}` or `calibration:{kind:"pinhole",pose:{positionEcefM,right,down,forward,focalXpx,focalYpx,centerXpx,centerYpx}}`. Matrix projects offset-relative WGS84 UTM x/y and ellipsoidal height to zero-based pixels with positive depth. Grid transform follows SDK pixel-corner convention. Use a small AOI, e.g. 48x48. Input TIFF may be converted from original JPEG without geometric resampling; this is not an orthophoto. No automatic camera pose estimation, lens undistortion or datum conversion.

Potential real benchmark: [ISPRS/EuroSDR Dortmund](https://www.isprs.org/resources/datasets/benchmarks/MultiPlatformPhoto/description_Dortmund.aspx) has undistorted original imagery and K/R/t or P matrices with global offset. [Registration and terms](https://www2.isprs.org/commissions/comm2/icwg-2-1a/benchmark_main/). Convert the actual coordinate reference, height datum, matrix and offset to this manifest convention first; data have not yet been downloaded or validated by this SDK. Do not use an orthomosaic as a stereo input. ČÚZK native calibration imports, automatic catalog retrieval and Prague reconstruction remain unimplemented. Aerial synthetic success does not establish accuracy on real flight data.

## Run native SGM with aerial camera calibration

`npm run example:terrain-aerial -- --matcher sgm` tests the new native height-volume SGM on three **synthetic** but calibrated perspective cameras. Use `--sgm-pyramid-levels 2` to enable optional image-only coarse-to-fine guidance. Same mode can process real aerial scenes with `--manifest path/to/manifest.json --matcher sgm` only after sensor TIFFs, camera matrices, datum and calibration are correctly prepared. The current demo's quality gate uses ground truth only for synthetic evaluation, never as matching input. A successful synthetic test does not validate actual city photogrammetry.
