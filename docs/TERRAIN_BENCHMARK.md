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
