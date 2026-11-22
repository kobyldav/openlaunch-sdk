# Stage 16 — regional Sentinel-2 NDVI coverage

Extends the existing Prague 3D ČÚZK streamed viewer and the Stage 15
multi-year Sentinel-2 L2A SCL-masked NDVI analysis. This is **not** a synthetic
satellite layer, all-city mosaic, or a modified source of terrain heights.

## Run

~~~powershell
Set-Location "$HOME\Desktop\openlaunch-terrain"
git status --short
git pull --ff-only origin feature/terrain-prague-real-dem
npm run example:terrain-prague-stream
~~~

Open http://127.0.0.1:8765/. Under Víceletá analýza select 3–5
consecutive years and one month, then use Regionální pokrytí NDVI.
Select 2×2, 3×3 or 4×4 adjacent ~0.7km overview tiles centered at
the selected camera location.

The existing measured single-tile NDVI 3D layer is unchanged. A separate
north-up coverage map shows percent common SCL-valid pixels inside each
successfully processed tile. Gray denotes insufficient genuine source
coverage, orange a source failure, and neither yields zero-filled NDVI.
CSV and GeoJSON include per-tile coverage and verified WGS84 bounding polygons.

## Streaming localhost API

~~~text
GET /api/observations/multiyear/region.ndjson?x=2&y=2&cols=3&rows=3&from=2023&to=2025&month=8&cloud=50
~~~

- x and y are top-left zero-based Prague overview tile indices.
- cols and rows are 1–4 each with at most 16 tiles, entirely within the
  existing 6×6 Prague overview grid. The year range must be 3–5 years.
- The NDJSON stream emits a start event (bounds and tiles), ordered tile
  events (analyzed, insufficient, error), and a complete event (aggregate).
- The server processes **one region and one tile at a time**, reusing the
  original Stage 15 server pipeline. It retains only a small report for
  each tile and uses the existing source-hash disk cache.
- No client-provided remote imagery URL or unknown source data is accepted.
  A missing year, missing/clouded pixel, or absent cache cannot be fabricated.
- Aborting a request stops scheduling additional tiles after the currently
  active tile; source caches persist.
- Offline mode makes no requests to remote satellite endpoints.

## SDK API

~~~typescript
import {SentinelMultiYearRegionAccumulator} from "openlaunch-sdk";

const region = new SentinelMultiYearRegionAccumulator(
  2023, 2025, 8, ["tile-a", "tile-b"]
);
// report: verified result from analyzeSentinelMultiYearSeasons(...).
region.addResult("tile-a",
  {west:14.40,south:50.08,east:14.41,north:50.09},report);
region.addUnavailable("tile-b",
  {west:14.41,south:50.08,east:14.42,north:50.09},
  "insufficient","No complete real annual source pairs");
const summary=region.finish();
~~~

Also exposed via the terrain engine method
OpenLaunch.terrain.createSentinelMultiYearRegion(...).

The accumulator holds O(selected tiles × years) small source/QA metadata,
not the entire spectral rasters, and verifies that geographic tiles
do not overlap before pixel-weighted aggregation.

## Interpretation and limitations

- **Regional valid-pixel percentage is over analyzed tiles only**, not
  the whole requested region when any tile failed. Always inspect
  analyzedTiles, insufficientTiles, errorTiles and regionFullyAnalyzed.
- Regional annual NDVI means and mean NDVI slope weight by the **same genuine
  SCL-valid pixel population across all selected years within each tile**.
  No region-wide raw pixel mosaic or missing-value extrapolation is made.
- The coverage map is 2D; the single-tile measured Sentinel trend remains
  shown in 3D on the original ČÚZK Bpv DEM. Stage 16 does not draw the
  entire regional slope surface as one continuous 3D layer.
- Sentinel spectral pixels are ~10m scale, not new building-scale
  observations. Leave-one-year-out ranges are sensitivity, not formal
  confidence intervals. NDVI slopes do not alone prove causal vegetation
  loss or construction.
- RAM is bounded to one tile's source processing plus O(16 × years)
  metadata. Disk cache is **not globally size-limited**; check available
  storage. Starting with 2×2 is recommended for real-network work.
- The current viewer covers ~4×4 km in central Prague; this does not
  cover all of Prague or the Czech Republic.

## Verification

~~~powershell
npm run build
node --test tests/terrain-sentinel-region.test.mjs tests/terrain-prague-region-stream.test.mjs
~~~

The offline integration test uses a genuinely empty cache and must report
no observations rather than inventing test pixels. Real multi-tile Sentinel
coverage additionally requires live access to source STAC/COG services.


## Stage 17 — original multi-year pixels projected on several 3D tiles

After finishing the Stage 16 real regional coverage analysis, click
**Zobrazit regionální trend ve 3D**. The **Regionální NDVI trend** dropdown
option controls the same layer. Switch back to ČÚZK orthophoto to hide it.

- Every successfully analyzed region tile reuses its own Stage 15
  source-verified annual medians and **the corresponding calibrated
  SCL-masked trend PNG**. No guessed data or region-wide color mosaic
  is rendered; pixels missing from any required year remain transparent.
- Before a tile is uploaded, the browser independently checks its
  3–5 genuine source IDs/acquisition times, annual month and years,
  total/common/robust pixel counts, numeric NaN masks, original WGS84
  bounds and EPSG:3857 pixel grid against the Stage 16 regional
  coverage report. Invalid or shifted raster data is refused.
- Only **currently render-selected coarse tile parents** can receive an
  overlay. Their finer z=1 measured DSM meshes reuse the *same*
  source raster with the correct quadrant UV transform, without
  inventing higher-resolution satellite pixels.
- The overlay uses the **existing WebGL1 shader and original ČÚZK Bpv
  vertex coordinates**. It does not affect height profiles,
  elevation, photographs or original building geometry.
- A separate GPU cache retains **at most 6 source-verified raster
  textures**, each of at most 50,000 pixels. It fetches one at a
  time, prioritizes nearest visible tiles, releases out-of-view
  textures and cancels work on toggles, new regions or lost GPU context.
  The separate original measured terrain cache remains independent.
- Failed image requests or changed data do not generate a colored
  tile; the underlying ČÚZK ortho remains visible.
- **Important limitation:** this is a *patchwork of independently
  observed tiles*, not a seam-blended, full-resolution 3D NDVI mosaic.
  A tile boundary may show a difference in per-tile source quality,
  acquisition dates or cloud coverage. It does not establish
  physical discontinuities in vegetation.

### Stage 17 verification

~~~powershell
npm run build
node --test tests/terrain-prague-region-webgl.test.mjs
~~~

The unit test invokes the **actual embedded viewer** source check and
visible-tile planner (with small explicit QA fixtures, not fabricated
satellite images), including rejection of shifted source grids.

The Windows browser smoke test has a **real-source regional GPU
regression** using the same authentic six-scene, three-year Prague tile
as Stage 15. It checks actual rendered Edge WebGL pixel differences,
source-count integrity, GPU texture cleanup and records a genuine
screenshot in:

~~~text
test-results/terrain-prague-browser-ci/prague-real-sentinel-regional-3d-one-source-tile.png
~~~

This particular strict browser regression covers **one genuinely
verified region tile and three explicitly unavailable neighbors**.
It verifies the renderer without falsely claiming a live four-tile
data run. Multi-tile live source coverage is still dependent on
actual historical STAC/COG access and must be separately observed
before claiming all four tiles were validated end-to-end.

## Stage 18 — genuine adjacent source-pixel seam diagnostics

Regional processing now reports the seam between every pair of adjacent
**successfully verified** Sentinel-2 NDVI tiles. Each seam uses **only the
native neighboring edge pixel centers** and original Theil–Sen NDVI/year
slopes — never an invented center, a smoothed gap, a stitched raster or
interpolated source data.

- A new pure SDK API `captureSentinelRegionSeamEdges()` retains only four
  slim native edge strips, metadata, georeferencing and real source IDs,
  while `compareSentinelRegionSeamEdges()` computes descriptive
  neighboring-pixel diagnostics without holding region-wide rasters.
- The server streams optional `type:"seam"` NDJSON events for already
  validated neighboring tiles, and a final `result.seams` array.
  Missing source tiles produce **no fake edge pair**.
- A numerical comparison is produced **only if annual source scene IDs
  and timestamps match**, pixel rows/columns actually align in
  EPSG:3857, and both original edge pixels are SCL-valid.
  Otherwise it returns a descriptive status:
  `different-acquisitions`, `unaligned-grid`, or
  `insufficient-edge-data`; numerical differences remain null.
- The user sees exact shared-edge indicators in the north-up regional
  coverage map. Orange is a warning (different acquisitions, native
  grid mismatch, missing paired edge pixels, or mean absolute difference
  above the **illustrative 0.08 NDVI/year threshold**), green means
  two source-compatible native edges were compared. A new
  **Kontrola hranic CSV** action exports all measured diagnostics.
- The WebGL1 shader explicitly rejects satellite texture sampling
  **outside each terrain tile's native UV domain**, including extra
  edge-apron triangles. This prevents graphical spreading of a valid
  source pixel beyond the source tile; it does not blend or change
  the actual observed colors at neighboring pixel centers.

### Strict real two-tile test

After the existing 3-year live source test, the Windows workflow
attempts the new strict
`scripts/terrain-prague-region-live-smoke.mjs` test for two adjacent
Prague tiles **0-3-3** and **0-4-3**:

1. Both must genuinely produce 3–5-year calibrated Sentinel L2A
   COG-based NDVI slopes, with original annual SCL support, source IDs
   and numeric original pixel rasters.
2. Their one shared edge must emit a properly sourced seam event with
   honest measured/native-grid/scene-comparability diagnostics.
3. The second tile must also have original ČÚZK DMP OK Bpv
   geometry and orthophoto in the local source cache.
4. Only when that proof exists, the actual Edge WebGL1 browser test
   requires both original source-backed regional textures to render
   at once on those real DSM tiles, captures an authentic PNG and
   verifies the GPU textures are released.

Output files (only when genuine sources are available):

- `test-results/terrain-prague-stream-ci/region-adjacent-live-report.json`
- `test-results/terrain-prague-browser-ci/prague-real-sentinel-regional-3d-two-real-tiles.png`

The remote-network two-tile verification is marked
`continue-on-error` in Windows CI: a remote STAC/COG outage
does not invalidate offline deterministic calculations, but neither
does CI success by itself prove that the two genuine tiles passed.
**Always check the reported Stage 18 live step and its source report.**

### Limitations

Even with compatible source scenes, adjacent pixel centers are not the
same ground location. A strong slope difference can be real vegetation
heterogeneity, seasonal radiometric differences or original scene
quality effects. It is **not** automatic proof of a visual seam bug,
construction, deforestation or statistical significance. The 0.08
warning threshold is for triage only. Stage 18 does not invent
higher-resolution Sentinel data, impose zero values on missing
pixels, or smooth away actual observed differences.

## Stage 19 — one historical Sentinel acquisition calendar for the entire region

The previous region pipeline selected the two Sentinel-2 L2A acquisitions
independently for every tile. Even valid per-tile results could therefore
compare different historical dates. Stage 19 fixes that source comparability
problem **before any per-tile NDVI calculation**:

- The server performs **one region-wide actual Element84 STAC discovery
  per historical year** for the original WGS84 area enclosing the selected
  tiles (3–5 consecutive years, same month and scene-wide cloud limit).
  All tiles are assigned **exactly the same two source scene IDs and
  acquisition timestamps per year**. Selection requires truly distinct
  acquisition dates separated by at least four days.
- A stable, 32-hex-character source-selection digest binds the exact
  geographic tile list, year/month/cloud parameters and original
  scene IDs/timestamps. A small source manifest is stored on disk as
  `region-sources-v1-<digest>.json`, without client-provided scene URLs.
  It remains usable after a local server restart (subject to retaining
  the original STAC cache and source products).
- The region NDJSON API now emits an explicit `source-lock` event and
  includes `sourceLockId`, `sourceSelectionStatus` and
  `lockedSourceYears` in the final regional report.
  The browser shows the **actual selected acquisition dates**.
  The regional coverage and native-edge CSV exports now include that exact
  source-lock ID, and regional GeoJSON retains original annual scene IDs,
  timestamps, source-selection status and partial-coverage status.
- Every tile is computed through the same original Stage 15
  STAC/COG/reflectance/SCL pipeline, but with the **shared** scene
  selections. Both uncached calculations and cached results are checked
  against the locked IDs, timestamps and annual selection. An old
  cached tile with different scenes cannot silently count as shared.
- The regional 3D overlay fetches its real per-tile JSON and PNG
  with the identical `lock=<digest>` query. The server verifies that
  the requested tile, period and cloud limit belong to that source
  manifest; the browser additionally rejects an unbound or mismatched
  regional raster. The separate single-tile Stage 15 mode still
  works independently.
- If the chosen original scenes have insufficient SCL-valid overlapping
  pixels or missing COG coverage in any tile, that tile remains marked
  unavailable. If no two region-wide scenes can be verified for a
  required year, **the whole analysis fails closed to unavailable
  coverage**, rather than selecting different dates per tile.

### Tests and evidence

```powershell
npm run build
node --test tests/terrain-sentinel-region-catalog.test.mjs
node --test tests/terrain-prague-region-stream.test.mjs
```

The CI live proof `scripts/terrain-prague-region-live-smoke.mjs`
now validates that **both original neighboring Prague tiles use the
same locked source selection**, that the digest is attached to every
region JSON tile, and that genuine PNG sources and ČÚZK geometry are
present. The offline real Edge WebGL regression reopens the persisted
manifest in a **fresh server process** to verify that the same scene
selection still governs the actual rendered satellite texture.

### Methodological limitations

The common STAC catalog is not proof that a source image contains
cloud-free, valid measured spectra at every geographical pixel.
Per-tile original COG sampling and SCL masks are still mandatory.
Using the same calendar of observations makes regional NDVI
comparisons **more comparable**, but does not remove differences due
to land cover, clouds, shadows, topography, or sensor radiometry.
A shared source selection is **not statistical significance** and
does not justify filling gaps or inferring causes of vegetation change.

For reproducibility, preserve both the source manifest and original
source caches; a digest is a reproducible content identifier, not a
cryptographic signature of scientific correctness.


## Stage 20 — actual 4×4 region QA, memory and cache-replay benchmark

The region server now measures runtime **from its own running Node process**,
using a 100 ms sample interval plus per-tile samples:

- End-to-end server analysis time and common-source STAC selection time
- Elapsed time per original-source tile, and each tile's real source-result
  status (analyzed, insufficient or unavailable)
- Observed peak Node process RSS and V8 heap, initial RSS and a configurable
  **soft** resident-memory ceiling (default 1536 MiB; 256–8192 MiB accepted)
- Number of real historical result cache hits, misses and unavailable tiles,
  and number of yearly STAC catalogs reused from the local source cache
- The exact denominator: number of analyzed source-backed tiles out of the
  requested 16. **Whole-region SCL-valid pixel percentage is `null` unless
  every requested tile had genuine validated source data.** The percentage
  within analyzed tiles is still separate and available

Every tile NDJSON event now includes original runtime `metrics`; the final
`result.quality` comes from the exported
`assessSentinelRegionQuality()` SDK module, which rejects missing metrics,
incorrect source/cache states and invented whole-region denominators.

The Prague browser shows measured elapsed time, RSS/heap peaks, and cache
hits/misses beside the coverage map and offers **Měření provozu JSON** to
export the real quality report and source-lock evidence.

### Offline 4×4 repeat audit — safe and deterministic

```powershell
npm run build
node --test tests/terrain-sentinel-region-quality.test.mjs tests/terrain-prague-region-benchmark.test.mjs
node scripts/terrain-prague-region-benchmark.mjs --x 1 --y 1 --cols 4 --rows 4 --repeat 2
```

By default, the benchmark runs with **no external network**. It creates a
fresh server process for each attempt and reports only genuine data already
stored in the local source cache. A fresh empty cache correctly yields
16 missing tiles and **zero observed Sentinel pixels**; a passing offline
stability test is *not* scientific validation of all 16 tiles.

The output is a JSON report under
`test-results/terrain-prague-region-4x4-benchmark.json`. It includes
measured times and peak RSS separately for each cold process, original
source provenance, real coverage, source-cache reuse and an SHA-256
fingerprint of the original numerical/scene results. Repeated runs must
give identical **scientific results**, but execution times may differ.

### Full 4×4 genuine Sentinel source benchmark — opt-in

```powershell
node scripts/terrain-prague-region-benchmark.mjs --live --x 1 --y 1 --cols 4 --rows 4 --from 2023 --to 2025 --month 8 --cloud 50 --repeat 2 --rss-limit-mib 1536 --timeout-ms 1000000 --require-complete --require-cached-replay
```

This retrieves original Sentinel-2 L2A STAC/COG scenes on a bounded 4×4
area (~2.8 km wide) for three real August seasons. It **requires**
every tile to have valid data and **requires** the second fresh server
to reuse genuine cached source products. A missing year, cloud-covered
tile, network timeout or unavailable COG causes an explicit failure and
preserves a partial JSON diagnostic; source measurements are never
interpolated or invented.

There is also a dedicated manual GitHub workflow:
`.github/workflows/terrain-prague-region-4x4-benchmark.yml`
(**Actions → Prague Sentinel-2 actual 4x4 regional quality benchmark → Run
workflow**). This separate workflow deliberately avoids slowing down the
normal Windows CI by potentially tens of minutes of original remote COG
traffic. Even when the strict 16-tile benchmark fails, it uploads the
partial real-data report and the source-selection manifests.

The normal CI always checks strict deterministic 16-tile/no-data behavior
through three fresh Node server launches. When the earlier live two-tile
evidence exists, CI additionally measures a **real** source-backed 2×1
cached replay (first and second process) and checks it is fully source
verified, without claiming that this covers 4×4.

### Limits and resource risks

- RSS and heap are from the **whole local Node process**. The 100 ms
  sampler can miss a shorter allocation peak. The *soft* RSS limit
  avoids starting additional tile downloads after the limit is observed,
  but cannot interrupt an already-running COG read and is not a
  hard memory bound.
- The server's memory numbers **exclude the Edge/browser process, WebGL
  GPU textures, system file cache, on-disk storage and actual transfer
  bytes**. GPU residency remains separately limited to six region
  overlay textures.
- A cache hit means **reuse of a source-validated historical result**,
  not evidence that the scientific conclusion is correct. Faster
  second-run execution is not guaranteed; report actual timings.
- A successfully completed technical 4×4 stream with zero real source
  pixels is a successful NoData handling test, **not** an observation of
  Prague's vegetation. Similarly, Theil–Sen remains descriptive;
  no statistical confidence or causal claim is added.


## Stage 21 — bounded dual-original-acquisition COG loading and cold-source A/B

The source bottleneck in Stage 20 was measurable: cold 4×4 input had
**16 source raster cache misses** for 2023–2025, and Stage 15 processed
both selected original acquisitions **serially** per historical year.
Each `observeSentinel2()` already fetches **all five original
red/green/blue/NIR/SCL COG assets** with independent HTTPS byte-range
requests. Stage 21 permits the *two independently selected and
validated original scenes for a single year and tile* to be loaded
together, without increasing the number of regional tiles in flight.

- New reusable SDK `loadSentinelSourcePair()` helper (in
  `src/terrain/sentinel-source-pair.ts`), with concurrency exactly
  **1 (serial baseline) or 2 (bounded original source pair)**.
  `Promise.allSettled` drains **both** scene requests before reporting
  a source failure, so the next regional tile never starts while a
  rejected prior source is still consuming the two-job global budget.
- The two true STAC scene IDs and timestamps **retain their original
  ordered placement**, even when one source COG finishes earlier.
  The original calibrations, exact 10 m EPSG:3857 grid, pixel SCL
  masks, two annual source medians, Theil–Sen, original ČÚZK 3D
  geometry, source lock and Stage 20 numeric output remain unchanged.
- Only **one regional 3D/source tile** is computed at a time; only the
  two original acquisitions within its current year overlap.
  The global `MAX_OBSERVATION_JOBS=2` guard remains in place.
  This is *not* a 16-tile unbounded parallel downloader.
- Original 3D viewer and exported Stage 20 JSON now disclose
  `quality.scenePairConcurrency` and
  `quality.maxObservedConcurrentSourceJobs` from the actual
  local server, not an estimate of internet transfer parallelism.

### Select original source mode

```powershell
# Normal real 3D Prague server: two original acquisitions overlap.
node scripts/terrain-prague-stream.mjs --scene-pair-concurrency 2

# Previous Stage 20 behavior, for scientifically identical baseline.
node scripts/terrain-prague-stream.mjs --scene-pair-concurrency 1

# Normal example command still defaults to mode 2.
npm run example:terrain-prague-stream
```

### Reproducible genuine cold 4×4 benchmark

```powershell
npm run build
node --test tests/terrain-sentinel-source-pair.test.mjs
node scripts/terrain-prague-region-source-ab.mjs --x 1 --y 1 --cols 4 --rows 4 --from 2023 --to 2025 --month 8 --cloud 50 --timeout-ms 1000000
```

The dedicated GitHub Action
`.github/workflows/terrain-prague-stage21-source-ab.yml`
also runs the same **real Sentinel-2 L2A STAC/COG A/B** independently
of the routine CI. The serial and dual-acquisition treatments each
start with separate **empty disk caches** and must retrieve all
16 source-backed tiles, with two fresh Node server processes per
treatment (cold and persistent-cache replay). The benchmark rejects
non-empty cold caches, invalid source identity, incomplete 4×4,
or a changed original scientific SHA-256 fingerprint.

The resulting report
`test-results/terrain-prague-region-stage21-ab.json`
contains both **actual** cold times, whole-Node RSS peaks, cache
hits/misses, observed active source jobs, and an exact comparison of
the historical scientific output. The speed change **may be
negative** if two parallel COG requests saturate or are throttled by
a public source. Run results need explicit measurement; Stage 20's
47.7 s cold result is a historical reference, not a controlled A/B
benchmark on an unchanged network.

### Remaining resource limitations

Two scenes, each with five original COG bands requested, can increase
short-lived HTTP concurrency. Per-process RSS remains under the
observed soft ceiling if sources cooperate, but the 100 ms sampler
does not guarantee a hard memory bound; there is no automatic
parallelism adjustment to enforce a cap during an active COG read.
Missing SCL pixels, source scenes or tile coverage are still not
inferred or replaced. Browser GPU residency remains separately
limited to six measured regional textures.


### Stage 21 controlled live A/B result — 2026-11-22

A dedicated real 16-tile Windows run **succeeded** with two separate
original Sentinel-2 L2A STAC/COG cold source caches and 2023–2025 August
seasons: [GitHub Actions run 45069045054](https://github.com/kobyldav/openlaunch-sdk/actions/runs/45069045054).

| Verified measurement | Original serial pair=1 | New bounded pair=2 |
|---|---:|---:|
| Cold original 16-tile run (including fresh server) | **43,037 ms** | **34,992 ms** |
| Sampled peak Node process RSS, cold | **215.1 MiB** | **232.9 MiB** |
| Subsequent full source-cache replay | 344 ms | 340 ms |
| Genuine shared annual SCL-qualified NDVI pixels | 62,504 | 62,504 |
| First-run genuine raster cache hits | 0/16 | 0/16 |
| Source-backed output coverage | 16/16 tiles | 16/16 tiles |
| Scientific SHA-256 output fingerprint | `f538be31b4cc079a…` | `f538be31b4cc079a…` |

Measured cold-time reduction: **8,045 ms / 18.7%**, with **17.8 MiB
more sampled peak Node RSS**. This trade-off is bounded to two original
acquisitions per year and a single regional tile in flight. A/B results
are individual external-network measurements, not a guarantee of the
same speedup on every machine, cloud host, region or date.

Original benchmark artifact (all raw audits and individual source
times): [Stage 21 A/B artifact](https://github.com/kobyldav/openlaunch-sdk/actions/runs/45069045054/artifacts/14772189284).
