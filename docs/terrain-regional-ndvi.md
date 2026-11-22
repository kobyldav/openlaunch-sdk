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
