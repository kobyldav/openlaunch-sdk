# Earth Intelligence in OpenLaunch SDK

OpenLaunch v0.6 introduces a first-class Earth-observation and geospatial layer. The design goal is not to collect unrelated API wrappers. It is to give applications one set of geometry, catalog, weather and orchestration primitives that can be composed into real workflows.

## Data pillars

| Pillar | Provider | OpenLaunch surface | Typical use |
|---|---|---|---|
| Launch and mission data | Launch Library 2 | `space.launches`, `space.ll2` | launch schedules, vehicles, agencies, pads |
| Orbital catalog data | CelesTrak | `space.celestrak` | OMM/TLE catalogs and satellite metadata |
| Earth observation | Copernicus Data Space | `space.copernicus` | Sentinel-1/2 STAC search and Sentinel Hub processing |
| Earth observation | Microsoft Planetary Computer | `space.planetaryComputer` | Sentinel, Landsat and other STAC catalogs; asset signing |
| Weather | Open-Meteo | `space.weather` | cloud cover, visibility, precipitation and daylight |
| Cross-provider orchestration | OpenLaunch | `space.earth` | imagery search, weather windows, sensor recommendation and monitoring snapshots |

## Geospatial model

The same `AreaOfInterest` can be passed to Copernicus, Planetary Computer and the intelligence layer.

```ts
import { circle } from "openlaunch-sdk";

const target = circle([4.1453, 51.9475], 5);
```

Coordinates are WGS84 longitude/latitude. Helpers currently include `point()`, `bbox()`, `polygon()`, `circle()`, `centerOf()` and `areaKm2Approx()`.

## Copernicus Sentinel-2 optical search

```ts
const scenes = await space.copernicus.searchSentinel2(
  target,
  "2026-09-01T00:00:00Z",
  "2026-10-11T23:59:59Z",
  20,
  20,
);
```

The result is standard STAC. OpenLaunch intentionally preserves provider metadata rather than forcing every Earth-observation product into a lossy custom schema.

## Sentinel-1 radar fallback

```ts
const radar = await space.copernicus.searchSentinel1(
  target,
  "2026-10-01T00:00:00Z",
  "2026-10-11T23:59:59Z",
  20,
);
```

SAR is useful when passive optical imagery is obstructed by cloud or unavailable at night. A radar scene still requires domain-specific interpretation; OpenLaunch does not pretend that SAR and RGB products are interchangeable.

## Weather-aware optical planning

```ts
const windows = await space.earth.opticalWeatherWindows(target, {
  forecastDays: 7,
  maxCloudCoverPercent: 25,
  limit: 12,
});
```

Open-Meteo is used for forecast cloud cover, visibility, precipitation probability and daylight. The score is a planning heuristic, not a guarantee that an individual satellite pixel will be cloud-free.

## Cross-provider monitoring snapshot

```ts
const snapshot = await space.earth.monitoringSnapshot({
  area: target,
  lookbackDays: 30,
  maxCloudCoverPercent: 20,
});

console.log(snapshot.recommendedSensor);
console.log(snapshot.optical[0]?.item.id);
console.log(snapshot.radar.length);
console.log(snapshot.recommendationReasons);
console.log(snapshot.limitations);
```

The workflow combines Sentinel-2 catalog results, Sentinel-1 catalog results and current weather into one decision object. Provenance and limitations travel with the result.

## Landsat historical analysis

Planetary Computer exposes Landsat Collection 2 Level-2 through STAC:

```ts
const history = await space.earth.searchLandsatHistory(
  target,
  "1990-01-01T00:00:00Z",
  "2026-10-11T23:59:59Z",
  100,
);
```

This complements Sentinel's higher spatial resolution with a much longer historical record.

## Planetary Computer asset signing

Some Planetary Computer assets are Azure Blob URLs that require a short-lived SAS token. OpenLaunch can sign a URL, asset, item or a bounded list of items.

```ts
const signed = await space.planetaryComputer.signItem(item);
console.log(signed.assets);
```

Do not cache signed asset URLs beyond their SAS expiry.

## Generic STAC

The Earth-observation layer is not hard-coded to two vendors.

```ts
import { StacClient } from "openlaunch-sdk";

const catalog = new StacClient({
  baseUrl: "https://example.org/stac/",
});

const results = await catalog.search({
  collections: ["my-collection"],
  intersects: target.geometry,
  datetime: "2026-10-01T00:00:00Z/2026-10-11T00:00:00Z",
  limit: 20,
});
```

Any standards-compatible STAC API can be connected this way.

## Server-side Copernicus processing

Copernicus Sentinel Hub Process API can return only the requested AOI instead of forcing clients to download full source scenes.

```ts
const space = new OpenLaunch({
  copernicusClientId: "...",
  copernicusClientSecret: "...",
});

const image = await space.copernicus.trueColor(
  target,
  "2026-10-01T00:00:00Z",
  "2026-10-11T23:59:59Z",
  { width: 1024, height: 1024, maxCloudCoverage: 20 },
);
```

OAuth tokens are cached in memory and reused until shortly before expiry. Never ship a confidential client secret in a public browser bundle. Use a backend or an OAuth flow appropriate for public clients.

## Spectral indices

For already calibrated reflectance samples, OpenLaunch exposes deterministic helpers:

```ts
ndvi(nir, red)
ndwi(green, nir)
ndmi(nir, swir1)
nbr(nir, swir2)
evi(nir, red, blue)
savi(nir, red)
```

These helpers do not perform atmospheric correction, band resampling, cloud masking or radiometric calibration.

## What OpenLaunch does not claim

A serious Earth-observation SDK must preserve uncertainty and data provenance.

- A STAC item intersecting an AOI does not prove every pixel in the target is usable.
- Catalog-level `eo:cloud_cover` is not a target-level cloud mask.
- Weather forecasts are planning inputs, not observation truth.
- A CelesTrak OMM converted to a two-body state is **not SGP4**.
- OpenLaunch v0.6 therefore does not claim operational satellite pass prediction from its current OMM helper.
- A satellite ground-track crossing does not prove the instrument was tasked, active, pointed at the target or able to acquire it.
- Future collection planning needs validated orbit propagation, sensor geometry and mission acquisition-plan data.
- Remote-sensing indices need correctly calibrated bands and appropriate preprocessing.

## Roadmap

The next high-value layers are:

1. validated SGP4/SDP4 propagation and pass/access windows;
2. sensor models: swath, field of view, off-nadir constraints and resolution;
3. COG/range-request raster windows;
4. pixel-level cloud masks and quality bands;
5. Sentinel-1 SAR metadata helpers and analysis primitives;
6. Landsat/Sentinel time-series change detection;
7. NOAA/EUMETSAT atmospheric products;
8. optional Google Earth Engine / openEO adapters for server-side large-scale processing;
9. pluggable commercial providers without changing the public orchestration API.

The intended architecture is:

```text
target / AOI
   |
   +-- orbital catalog and access geometry
   +-- weather and atmosphere
   +-- STAC catalog discovery
   +-- optical / SAR sensor selection
   +-- server-side or range-based raster processing
   +-- scoring, provenance and uncertainty
   v
observation plan / analytics result
```

OpenLaunch remains development and engineering software, not flight-qualified or safety-critical operational software.
