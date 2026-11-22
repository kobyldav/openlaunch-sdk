# README gallery generator

The gallery generator turns **OpenLaunch SDK results into six 1600 × 900 PNG images**, suitable for Markdown and GitHub previews. It does not take screenshots of the command line, and it does not use stock photography or generated illustrations.

## Run

From the root of the repository (Windows PowerShell, Command Prompt, Linux or macOS):

```bash
npm run gallery
```

This command builds the SDK, installs the renderer into the isolated `tools/readme-gallery` folder, and runs the gallery generator.

PNG files and `gallery-manifest.json` are written to `docs/images/`.

### Generate images on GitHub (without local setup)

On the repository **Actions** tab, open **Generate README gallery**, select **Run workflow**, keep **offline** unchecked for the full set of six images, and optionally change the NASA date. When the run completes, download the **openlaunch-readme-gallery** artifact from the workflow run.

For pull requests that change the generator, the workflow automatically tests the five offline images. The downloadable artifact contains PNGs plus the provenance manifest. GitHub workflow artifacts are temporary; save and commit selected screenshots if you want them visible in README permanently. The renderer is [sharp](https://sharp.pixelplumbing.com/), used only for gallery generation; it is **not** an SDK runtime dependency.

To generate the five network-independent previews:

```bash
npm run gallery -- --offline
```

The NASA imagery panel is intentionally skipped in offline mode, rather than replaced with a fake satellite image.

To choose the requested NASA imagery day:

```bash
npm run gallery -- --date 2026-08-15
```

Use a past UTC date with known NASA MODIS coverage. The script fetches 12 GIBS tiles at zoom 7 with `SpaceMapClient.webMapDailyTilesBatch()`. At least 9 must be successfully delivered and validated; otherwise it reports a failure instead of producing a misleading image. A daily mosaic is not independently verified imagery acquisition timing, nor a guarantee that every pixel covers the requested day.

To send output to another directory:

```bash
npm run gallery -- --out ./readme-gallery
```

## Use real raster data

The default terrain and NDVI examples deliberately use synthetic data and are labelled accordingly. To create them from real, **already acquired raster bands**, supply GeoTIFF files:

```bash
npm run gallery -- --offline --dem ./data/dem.tif --red ./data/red.tif --nir ./data/nir.tif
```

The DEM is decoded by the OpenLaunch `decodeGeoTiff()` API, projected into a local EPSG:3857 sample grid and passed to `elevationToLocalMesh()`.

The RED and NIR single-band rasters are decoded and processed by OpenLaunch `ndviRaster()`. They must already have identical dimensions, CRS, and affine transform. The tool **does not** invent reflectance calibration, register incompatible bands, or apply cloud masks automatically. Check the data provider's scale and offset, nodata, QA, acquisition dates, and band correspondence before presenting the result as a scientifically meaningful vegetation index.

Input GeoTIFF files must be supported by the SDK's bounded single-band decoder. Full-resolution multi-gigabyte images and unsupported TIFF codecs/CRS are not automatically converted.

## Outputs and provenance

| PNG file | SDK calculation | Provenance |
| --- | --- | --- |
| `earth-observation.png` | NASA GIBS validated daily tiles via `SpaceMapClient` | Real provider image bytes; request date is not verified acquisition time |
| `orbital-tracking.png` | `Sgp4Satellite.groundTrack()` | Historical ISS orbital elements from existing SDK tests |
| `terrain-model.png` | `elevationToLocalMesh()` | Synthetic DEM by default; actual GeoTIFF with `--dem` |
| `launch-simulation.png` | `simulateLaunch()` | Generic illustrative two-stage rocket |
| `ndvi-analysis.png` | `ndviRaster()` and `rasterStatistics()` | Synthetic inputs by default; actual reflectance bands with `--red` and `--nir` |
| `space-traffic.png` | `closestApproach()` | Historical ISS record and deliberately synthetic nearby test TLE |

The generated `gallery-manifest.json` records the output set, chosen NASA date, and any errors. A run with one or more failed images returns a nonzero exit code.

The modelled proximity graph is **not** a current close approach warning or an operational collision probability. The launch graph is **not** recorded telemetry. The 3D terrain image is a rendering of SDK-generated local geometry, not a map service screenshot.

## Embed images in README

After reviewing the files for visual quality and scientific context, they can be added to `README.md` with relative image links, for example:

```markdown
![Orbit propagation with OpenLaunch SDK](docs/images/orbital-tracking.png)
![Rocket launch telemetry simulated with OpenLaunch SDK](docs/images/launch-simulation.png)
```

Do not embed the generated images before running and reviewing the output locally. Committing `docs/images/*.png` is optional; the project does not commit generated images automatically.
