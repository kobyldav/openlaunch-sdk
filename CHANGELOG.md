# Changelog

## 1.2.0 – satellite web-layer interfaces (feature branch)

- Typed Earth layer registry with source/freshness/auth/resolution/provenance capabilities and explicit status.
- NASA GIBS dated MODIS/VIIRS Web Mercator WMTS templates; link to capabilities validation.
- NASA FIRMS bbox source query, protected MAP_KEY, bounded CSV decode to UTC heat hotspots.
- NASA ISS official external-view source descriptor without fabricated playable stream.
- Generic STAC discovery for a caller-selected atmosphere collection (no implied Sentinel-5P raster decoding).
- Meteosat kept explicitly unavailable until a real EUMETSAT product is authenticated and validated.
- Fully backwards-compatible v1.1 monorepo packages; changes only in new v1.2 branch.


## 0.9.0 - 2026-10-13

Mission & Earth Intelligence: cross-version functional gap closure.

- STAC-derived EO asset metadata for actual available RGB, spectral, radar, quality, thermal and elevation layers, with explicit per-asset GSD provenance
- real, bounded HTTPS STAC preview/visual bytes downloader (not GeoTIFF decoding, arbitrary raster analysis or a fabricated image)
- independent Sentinel-1, Sentinel-2, Landsat L2 surface temperature and Copernicus DEM GLO-30 catalog discovery, with provider-level error statuses
- Earth monitoring snapshot resilience when optical, radar or weather provider is offline
- Landsat Collection 2 ST_B10 calibrated surface temperature and ST_QA uncertainty pixel helpers; Sentinel-2 L2A SCL classifier/summary
- separate time/platform metadata correlation between predicted geometric swath access and actually indexed STAC scenes, without claiming exact AOI pixel confirmation
- auditable historical/current satellite traffic screening: element-age and trajectory sample-resolution warnings, failed orbit data accounting, no operational clearance claim
- bounded pitch/heading guidance sweep scored against optional target inclination/perigee/apogee and physical constraint violations
- idealized staged vacuum delta-v and circular orbit-speed diagnostics
- `space.mission`, `openlaunch-sdk/mission`, `space.earth.discoverObservations`, `space.earth.downloadPreview`, `space.trajectory.auditTraffic`
- offline v0.9 mission example, expanded regression suite and machine-readable examples catalog

Incomplete by design: full COG pixel tile reads, multi-resolution raster fusion/reprojection, actual DEM 3D mesh generation, full closed-loop launch optimizer, verified real SpaceX telemetry/trajectories and covariance-based collision probabilities.


## 0.8.1 - 2026-10-13

Ascent modeling refinement following the offline high-q launch scenario:

- first-order max-dynamic-pressure throttle limiter with predictive q-rate estimate, nominal 4% headroom and explicit best-effort violation reporting
- optional axial-thrust acceleration limiting, telemetry of requested/applied throttle and active limiting reason
- conditional fairing release gated by earliest time, minimum altitude and maximum modeled dynamic pressure
- retain legacy fixed-time fairing release for backwards compatibility, rejecting ambiguous mixed configuration
- mass-before/mass-after audit metadata for stage separation and fairing release
- report maximum modeled axial thrust-g, number of throttled telemetry samples and constraint warnings
- improved deterministic launch demo with complete time checkpoint summaries and final two-body perigee/apogee classification
- explicit distinction between inertial ground-rotation velocity and atmospheric-relative launch speed
- additional offline controller, fairing, staging and model-constraint regression tests
- package and lockfile updated to 0.8.1

**Not a certified launch controller or actual SpaceX vehicle model.** Max-Q and acceleration limits are approximate and may be exceeded in model results. Do not use as operational launch-clearance data.


## 0.8.0 - 2026-10-13

Generic Launch Trajectory Engine.

- physics-based RK4 integration of 3DOF point-mass ascent with position, velocity and total wet mass
- central Earth gravity with optional J2 perturbation and launch-pad Earth-rotation initial velocity
- co-rotating atmospheric drag, pressure-dependent thrust and Isp, mass-flow integration
- time-tagged pitch/heading/throttle schedule interpolation
- multi-stage burnout, dry-mass separation, between-stage coast, fairing jettison
- max-Q, Mach, dynamic pressure, altitude, speed and mass telemetry and flight events
- optional post-burnout coast, explicit non-flight-qualified limits and frame provenance
- seeded Monte Carlo with position-deviation percentiles and bounded runs
- direct v0.7 satellite-relative launch screening with an explicit modeled frame warning
- Cesium CZML launch track export including flight-event markers
- new `openlaunch-sdk/trajectory` subpath and `space.trajectory`
- offline regression tests and demo `npm run example:launch`

The full flight simulator does NOT infer a genuine mission profile from a public NET alone; no certified EOP frame, covariance, closed-loop guidance or operational collision assessment.


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
- nearest-object results now flag indistinguishable propagated GP ephemerides and support opt-in exclusion, without claiming physical zero separation
- Rotterdam monitoring example now computes SGP4 ground passes and nominal Sentinel-2 MSI access windows
- added cubic-Hermite sampled TEME trajectory interpolation and satellite screening as the bridge for future launch-vehicle trajectories
- added element-freshness metadata and explicit no-covariance/no-collision-probability flags
- added spherical-Earth sensor swath and off-nadir access geometry
- added nominal Sentinel-2 MSI, Sentinel-1 IW and Landsat OLI/TIRS sensor presets
- added Cesium CZML export and multi-satellite `OrbitScenario`
- added ESM and CommonJS runtime validation for the SGP4 integration
- added `openlaunch-sdk/orbit`, `/traffic`, `/sensors` and `/scenario` subpath exports
- added 13 type-checked orbit/traffic examples and detailed architecture documentation
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
