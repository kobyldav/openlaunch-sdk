# Real README screenshots from OpenLaunch SDK applications

The screenshot tool opens the **real, published** [kobylkadavid.cz](https://www.kobylkadavid.cz/) satellite explorer in Chromium. It selects actual satellite map layers, verifies that the browser has decoded provider image pixels, and captures the existing web interface as a PNG.

It does **not** render hand-designed infographic panels, draw fake satellite paths, invent data, or replace missing imagery with illustrations. The source website's satellite explorer is an implementation consuming OpenLaunch SDK from its backend.

## Run on Windows

From the latest checkout of `openlaunch-sdk`:

```powershell
npm run gallery -- --only nasa-modis
```

The command installs the isolated Playwright package and Chromium browser automatically. No existing application screenshot is reused.

Run the desired views:

```powershell
npm run gallery -- --only sentinel2,nasa-modis,ndvi,radar
```

For a stable NASA date:

```powershell
npm run gallery -- --only nasa-modis --date 2026-08-15
```

Images are written to `docs/images/live/`. The tool creates a `capture-manifest.json` with the selected layer names, timestamp, and failed captures.

## What is captured

| Output | Visible website view | Source |
| --- | --- | --- |
| `sentinel2-real-ui.png` | Sentinel-2 RGB and map UI | Copernicus imagery delivered through SDK-backed web service |
| `nasa-modis-real-ui.png` | Terra MODIS map and layer controls | NASA GIBS via the website's SDK-backed API |
| `ndvi-real-ui.png` | Vegetation overlay and interactive map UI | SDK-backed Copernicus processed NDVI |
| `radar-real-ui.png` | Sentinel-1 SAR map mode | SDK-backed Copernicus processing |

Only images that actually load in the browser are captured. The script fails instead of writing a misleading placeholder when a provider is disabled, returns an error, or does not deliver a displayed image.

**This is a frontend screenshot**, not proof of scientific calibration, exact acquisition time, provider uptime, or a standalone OpenLaunch SDK visualization package. The site implements the UI using its own React components, with OpenLaunch supplying the underlying data workflows. The separate air-traffic map is not part of this screenshot selection.

## On GitHub

The **Generate README gallery** workflow exercises real browser capture and uploads the PNG files as an Actions artifact. If the website is unavailable or Copernicus is rate-limited, run the workflow later or request only the NASA layer locally; the tool intentionally does not insert synthetic pixels.

Before adding an image to README, inspect that the selected layer is visible, there is no error/loading overlay, geographic imagery genuinely covers the displayed map, and the label matches the data source.

To publish verified captures, commit files under `docs/images/live/` and embed the selected PNG with a relative Markdown image link.
