# Terrain reconstruction benchmark suite

Run on Windows, Linux or macOS with Node.js and npm (Windows includes tar.exe):

```cmd
npm run example:terrain-benchmark
start "" "test-results\terrain-benchmark\index.html"
```

`--offline` runs deterministic synthetic tests only; `--real-only` runs external cases; `--case urban` runs a single case (combine with appropriate mode if desired). All cases are recorded even if a case fails; process exits nonzero if any failed. The dashboard links to each reconstructed surface. No source imagery is fabricated for missing real datasets.

Synthetic scenes: flat, hills, mountains, urban (roof discontinuities), industrial (large roof), forest-like canopy, water (uniform texture), cloud occlusion, periodic texture, zero baseline. All are synthetic, with independent ray-rendered perspective images and separately recorded known height field. Raw float64 little-endian input samples, camera metadata, reference-only JSON and visualization PGM files are saved. Expected failure/rejection cases are scored accordingly; no claim of real-world accuracy. Urban is DSM rooftops, not vertical facades.

Real tests: original ASTER archive, baseline and higher-density same area, plus two nearby AOIs. Cache shares one 152 MB download. The locations are separate crops of one scene, not independent global datasets. The reference HGT comparison is only after reconstruction. S2P pair and triplet use small published sensor TIFFs at pinned commit 75ea354dc7de658bf696eabf11944e92c65412c5 from https://github.com/centreborelli/s2p. Their expected output DSM is an algorithm comparison, not independent ground truth. The SDK does not use S2P code, nor run its pipeline. Input source terms must be respected; files are not distributed in this package. External failure (unsupported TIFF, network, poor correspondence) is a reported failure, never a synthetic fallback.

Real aerial cases can be run via `--aerial-manifest path/to/aerial.json` using the existing calibrated aerial manifest (see AERIAL_TERRAIN.md). Without a manifest they are NOT RUN. Candidate data: [ISPRS Avenches](https://www.isprs.org/resources/datasets/sample-datasets/avenches/default.aspx) residential and industrial, original Sun Raster RGB, photogrammetric orientation in native Swiss coordinates, reference DSM residential only; [Zürich Höngg](https://www.isprs.org/resources/datasets/sample-datasets/hoengg/default.aspx), city, vegetation and river. Native Sun Raster and Swiss camera/datum import not yet implemented. The project does not claim real aerial validation from these datasets. Prague requires calibrated imagery and is not covered by these automatic cases.

Coverage, accepted and interpolated cells, RMSE, comparison type and elapsed time are recorded in summary.json, summary.csv and individual reports. Synthetic thresholds are smoke-test thresholds, not surveying specifications. Keep failed cases visible.

Multiple real aerial datasets may be evaluated in one run by repeating `--aerial-manifest`. The optional manifest field `referenceCheckpoints` is a relative path to JSON of the form `{"verticalDatum":"WGS84 ellipsoid","points":[{"col":0,"row":0,"heightM":220}]}` (at least 10 points). Pixel indices are zero-based grid centre indices. The reference file is only opened after reconstruction and is never an input to the matcher. Without checkpoints a successful real aerial run is marked UNVALIDATED, not PASS. Supplied checkpoint provenance and accuracy are the user's responsibility. The example gate is 3 m RMSE and 65% coverage, not a surveying certification.

## CRS-safe reference checking

The S2P reference DSM is projected onto the OpenLaunch WGS84 grid with `reprojectRasterTo` before comparison. This uses the reference for **validation only**, never as the reconstruction input. Source and target CRS are recorded, and vertical datum discrepancies are explicitly marked as unknown; centered RMSE is not absolute accuracy. Invalid cells and non-overlap are not silently treated as successes.

## Extended real sensor mosaic

`npm run example:terrain-benchmark -- --case s2p-triplet-large --out test-results/terrain-large` reconstructs a 128×128 grid at 2 m pitch from original S2P triplet images, using the OpenLaunch tiled engine. A reference algorithm's DSM is opened only after reconstruction. This case is opt-in because its runtime and memory requirements are higher. The explicit `--out` path prevents overwriting the standard benchmark dashboard. The high-resolution satellite image scene is not a fully calibrated independent aerial photograph benchmark.

### Honest real-data acceptance

A 128×128 satellite model with roughly 70% coverage and ~11 m centered RMSE is **not an acceptable detailed 3D reconstruction**. The S2P test now enforces a stronger relative comparison (small AOI: coverage ≥80%, centered RMSE ≤4 m; large AOI: coverage ≥85%, centered RMSE ≤5 m, mean offset within 10 m). Large triplets optionally require `pairConsensusToleranceM:8` so incompatible view pairs cannot create apparently confident height measurements. A failed gate leaves diagnostic outputs but fails CI. These are algorithm-comparison thresholds, not certified surveying tolerances; no independent ground control points are supplied.

## Rejection diagnostics for every pixel

The matcher now emits `rejectionReasons` (codes 0–8) with every DSM, including tiled DSMs. `scripts/terrain-s2p-benchmark.mjs` exports a per-reason histogram `rejectionCounts`. It distinguishes insufficient viewing parallax, missing valid image hypotheses, boundary maxima, weak correlation, contradictory stereo pairs, ambiguous maxima, missing seed neighbours, and inconsistency with recovered matches. Reasons are diagnostic only and may reflect the final recovery attempt, not every rejection in the first pass. Always inspect this histogram before relaxing thresholds or filling holes.
