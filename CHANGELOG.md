# Changelog

## 0.7.0 - 2026-10-11

Orbit Dynamics and Space Traffic release.

- added SGP4/SDP4 propagation from CelesTrak OMM and TLE through a typed `Sgp4Satellite` wrapper
- added explicit TEME state, Earth-fixed position and geodetic coordinates with element-age metadata
- added near-Earth/deep-space propagation mode reporting
- added explicit approximate TEME -> Earth-fixed state transforms including rotating-frame velocity
- added refined ground-station pass prediction with AOS, TCA, LOS, maximum elevation, slant range and azimuth
- added look-angle and signed range-rate calculations
- added bounded ground-track sampling
- added pairwise closest-approach search with coarse bracketing and golden-section TCA refinement
- added relative velocity and RTN/RIC separation geometry
- added multiple-close-approach search, nearest-object queries and bounded CelesTrak group screening
- added element-freshness metadata and explicit no-covariance/no-collision-probability flags
- added spherical-Earth sensor swath and off-nadir access geometry
- added nominal Sentinel-2 MSI, Sentinel-1 IW and Landsat OLI/TIRS sensor presets
- added Cesium CZML export and multi-satellite `OrbitScenario`
- added ESM and CommonJS runtime validation for the SGP4 integration
- added `openlaunch-sdk/orbit`, `/traffic`, `/sensors` and `/scenario` subpath exports
- added 12 type-checked orbit/traffic examples and detailed architecture documentation
- added `satellite.js` 6.0.2 as a focused runtime dependency for established SGP4/SDP4 propagation

## 0.6.0 - 2026-10-11

Earth Intelligence release.

- added reusable WGS84 AOI primitives for points, bounds, polygons and circles
- added a generic STAC client with Copernicus Data Space and Microsoft Planetary Computer presets
- added Copernicus Sentinel-2 L2A optical and Sentinel-1 GRD radar search
- added Copernicus Sentinel Hub Process API support with OAuth client-credentials token reuse
- added true-color and NDVI server-side processing helpers
- added Planetary Computer SAS URL, asset and item signing
- added Landsat Collection 2 Level-2 historical search through Planetary Computer
- added Open-Meteo cloud, visibility, precipitation and daylight forecasts for observation planning
- added NDVI, NDWI, NDMI, NBR, EVI and SAVI helpers
- added scene ranking and common STAC asset discovery helpers
- added cross-provider Earth intelligence orchestration via `space.earth`
- added weather-aware optical-window ranking and radar fallback recommendations
- added Earth-observation tests, documentation and 10 type-checked examples
- added package subpath exports for `openlaunch-sdk/geo`, `/eo` and `/intelligence`
- explicitly documents that two-body OMM conversion is not operational SGP4 pass prediction

## 0.5.1 - 2026-09-29

Documentation and example-library release.

- added **90 categorized TypeScript examples** covering data providers, astrodynamics, rocket/spacecraft engineering, GNC math, geodesy, atmosphere/EDL, SDK infrastructure and integrated mission sketches
- every TypeScript example is checked by `npm run examples:check` without making network requests
- added `examples/catalog.json` for machine-readable indexing
- added `examples/AI_INDEX.md` and root `llms.txt` for AI/code-search context and modeling boundaries
- included `examples` and `llms.txt` in the published npm package
- expanded the main README with example/indexing guidance
- fixed literal-inferred gravity parameter types so callers can supply non-Earth gravity values

## 0.5.0 - 2026-09-27

Major expansion from launch-data wrapper to spaceflight/mission SDK.

- complete LL2 raw endpoint registry and config tables
- NASA and CelesTrak providers
- OMM helpers
- pagination iterators and collectors
- query builder
- resilient HTTP layer with timeout, dedupe, retry/jitter, concurrency control, telemetry and circuit breaker
- expanded caching adapters
- orbital mechanics, transfers and Mars reference calculations
- vectors, matrices, quaternions and numerical methods
- rocket, atmosphere, geodesy, communications, thermal, power, structures and EDL helpers
- navigation/Kalman/PID tools
- reliability, statistics, life-support, radiation, data and propellant utilities
- GitHub Actions Node CI
- expanded tests and documentation

## 0.1.0 - 2026-09-26

Initial typed Launch Library 2 SDK with normalized launches, rockets, agencies, astronauts, events, pads, cache and ESM/CommonJS builds.
