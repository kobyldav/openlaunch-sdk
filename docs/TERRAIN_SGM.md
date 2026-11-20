# Experimental native SGM: first implementation stage

The new \`matcher:"sgm"\` option uses a **height-indexed cost volume** made solely
from calibrated original sensor-image projections, photometric NCC and 4/8
Semi-Global Matching (Hirschmüller-style) dynamic-programming paths.
This is genuine multi-direction cost aggregation, **not** merely interpolating
a previously computed DEM. It also is **not yet full epipolar rectification,
image-space disparity SGM, multiresolution processing, or triangulation of facades**.
The output is still a 2.5D DSM of roofs and terrain.

The path aggregation is exposed as \`aggregateTerrainCostVolume\` for unit tests.
Invalid height hypotheses remain invalid even after regularisation. Strong
sensor evidence is required at the chosen height; SGM cannot turn an
unobserved / untextured point into a measured one.

Options: \`matcher:"sgm"\`, \`sgmPaths:4|8\`, \`sgmP1\`, \`sgmP2\`,
\`sgmContrastScale\` (intensity difference for adaptive penalties).
The original \`matcher:"height-sweep"\` remains the default.

Real satellite experiment (diagnostic; does not weaken existing production gate):

\`\`\`cmd
npm run build
node scripts/terrain-s2p-benchmark.mjs --dataset s2p-triplet --out test-results/sgm-triplet --matcher sgm --diagnostic-only
start "" "test-results\sgm-triplet\terrain.html"
\`\`\`

Compare \`report.json\` with the original height-sweep benchmark. Use
\`--diagnostic-only\` ONLY for experiments: it preserves \`referencePassed:false\`
and does not mean the result meets acceptance criteria. Real S2P reference
heights are read **after** the SDK reconstructs the surface; the S2P DSM is
comparison output from another algorithm, not independent ground truth.

Current limits: no epipolar regridding, no left/right consistency test yet,
no coarse-to-fine pyramid, no dedicated GPU/worker, and no independent survey
accuracy. SGM currently disallows \`recoverMissing:true\`, multi-round recovery,
sparse sampling, and image-evidence substep refinement to avoid mixing methods.
For large AOIs use \`reconstructTerrainTiled\` with a bounded \`tileSize\`.

## Real-data A/B dashboard

\`\`\`cmd
npm run example:terrain-sgm
start "" "test-results\terrain-sgm\index.html"
\`\`\`

This runs the original height sweep and the new native SGM over the same real
calibrated S2P image triplet, saving separate original DSMs, metrics and interactive
viewers. The dashboard visibly reports a strict PASS/FAIL for each method. The
comparison command returns a zero exit code when both methods *run and provide
valid metrics*, even if their quality gates fail; this is a **diagnostic job** and
is not a production-acceptance claim.

## Overlapping tile context

`reconstructTerrainTiled({matcher:"sgm",tileSize:32,tileHaloPixels:4,...})` includes a 4-pixel neighborhood outside every tile in the regularization and trims the halo on output. This prevents artificial SGM path resets exactly on tile borders; the result is assembled into the original global raster coordinate system without duplicating points. Tile pilots still use the corresponding expanded sensor footprint, and no DEM is imported. Default halo remains 0 for reproducibility of historical results; memory/work scale with the enlarged tile dimensions. Control `--tile-halo 4` in the real S2P benchmark and compare against `--tile-halo 0`.

## Coarse-to-fine stereo, experimental

`sgmPyramidLevels:2` computes a half-resolution calibrated SGM pass from the **same sensor images** (height step doubled), then runs full-resolution SGM with a **soft, capped image-derived cost penalty** near stable coarse height observations. A coarse sample influences a fine pixel only if it passes the coarse photometric quality check and at least two adjacent coarse samples agree within `sgmPriorRadiusM`. The actual fine candidate must still have valid cross-image NCC; no reference DEM, S2P output, interpolation or coarse model is used as a replacement for measured heights. Tune `sgmPriorWeight` (default .07) and `sgmPriorRadiusM` (default max(8 m, 8×height step)). Set `sgmPyramidLevels:1` to retain the original SGM exactly. Coarse priors can bias roof/ground boundaries and this mode is NOT enabled by default. Compare with `node scripts/terrain-sgm-compare.mjs --dataset s2p-triplet --size 128 --sgm-pyramid-levels 2 --out test-results/terrain-sgm-pyramid` before adoption.
