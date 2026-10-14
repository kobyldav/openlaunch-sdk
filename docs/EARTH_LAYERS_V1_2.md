# OpenLaunch 1.2 – satellite layers and near-real-time data

OpenLaunch v1.2 exposes one SDK-owned definition for map layer switches. The **website does not need its own unverified source list**: `earthLayerCatalog()` returns each layer's source, category, freshness, API method, implementation status, access requirements and known limitations.

## Ready integrations

| Layer | SDK API | Important qualification |
|---|---|---|
| Sentinel-2 optical / Sentinel-1 radar | Existing Earth observation STAC providers | Acquisition times only from STAC item metadata |
| Landsat thermal / Copernicus DEM | Existing Planetary Computer and raster modules | Check real band availability and authorization |
| Vegetation/water/moisture, scene changes | Existing raster and spectral index functions | Pixel values need real calibration, masks and matching grids |
| MODIS Terra / VIIRS S-NPP | `nasaGibsTileTemplate(layer,date)` | Dated NASA GIBS WMTS tile, **not** confirmation of an available image |
| NASA FIRMS VIIRS/MODIS | `fetchFirmsHotspots({mapKey,area,...})`, `parseFirmsCsv()` | Backend key and quota; hotspots are **not fire boundaries** |
| Atmospheric catalog (e.g. TROPOMI) | `discoverAtmosphereScenes(collection,area,from,to,client)` | Generic STAC search; no automatic NO₂ raster/calibration |
| NASA ISS live source | `issLiveSource()` | Official external NASA Live page, no fabricated direct player URL |

**Not finished:** Meteosat rapid imagery, a provider-authenticated EUMETSAT tile/time catalog, Sentinel-5P NO₂ unit-correct rendering, embedded ISS video player, universal raster file codecs and arbitrary EPSG reprojection. The catalog records these limitations with `implemented:false` for Meteosat. No external source is a guaranteed live view over Czechia.

### Provider details

NASA GIBS provides WMTS tiles and per-layer time dimensions. Request dates without checking capabilities can return empty tiles. `nasaGibsCapabilitiesUrl()` gives the NASA WMTS capabilities URL to check the actual layers/dates/matrix sets against the provider.

FIRMS: obtain a MAP_KEY separately from NASA, keep it server-side, choose `VIIRS_NOAA21_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_SNPP_NRT` or `MODIS_NRT`. Source timestamps come from `acq_date` and `acq_time` in returned rows; `frp` is Fire Radiative Power, **not** ambient temperature or a proof of an active fire boundary.

ISS: `issLiveSource()` gives NASA's official landing page. It does not scrape expiring player embeds; stream availability and view direction depend on NASA.

### Example

```ts
import {
  earthLayerCatalog,
  nasaGibsTileTemplate,
  fetchFirmsHotspots,
  bbox,
  issLiveSource,
} from "@openlaunch/earth";

const options = earthLayerCatalog();
console.table(options.map(l => ({
  id: l.id, enabled: l.implemented, data: l.source, freshness: l.freshness,
})));

const date = "2026-10-13";
const imagery = nasaGibsTileTemplate("nasa-modis-terra", date);
console.log(imagery.tileTemplate, imagery.actualAcquisitionVerified); // false

// Backend only: never return MAP_KEY to the frontend.
const mapKey = process.env.FIRMS_MAP_KEY;
if (mapKey) {
  const fires = await fetchFirmsHotspots({
    mapKey, area: bbox(12, 48.5, 19, 51.2),
    source: "VIIRS_NOAA21_NRT",
    days: 1,
  });
  console.log(fires.length);
}

console.log(issLiveSource()); // Official external NASA page, not a player
```

### Validation

```sh
npm ci
npm run check
npm run test:packed
npm run example:earth-layers
```

Tests use mocked providers, never pretend to verify external imagery acquisition. Production readiness requires a live smoke against dated NASA GIBS products, NASA FIRMS with user-owned MAP_KEY, authorized Copernicus acquisitions, quotas and source attribution.

Official documentation: [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/access-basics/), [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/), [NASA Live](https://www.nasa.gov/live/).
