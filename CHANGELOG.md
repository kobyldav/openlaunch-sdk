# Changelog

## 1.16.0 (development) — TIFF LZW GeoTIFF/COG

- Bounded TIFF 6.0 LZW decompression (MSB-first, 9–12 bits, clear/EOI, early-change=1) without new runtime packages.
- Local GeoTIFF and remote HTTP 206 COG readers accept Compression=5 for supported single-band TIFF tiles or strips.
- Independent Pillow/libtiff-compressed actual TIFF fixtures, including 32×32 dynamic-width dictionary regression and 3×2 QA classification.
- Secure allowlist restrictions, bounded output and sanitized scene-linked QA remain unchanged.
- No JPEG2000/JP2 support or claim of current real satellite-provider accessibility.
- Fedora smoke, docs and seven scoped workspace versions updated to 1.16.0.


## 1.15.0 (development) — WGS84 UTM GeoTIFF/COG Support

- Support all 60 WGS84 northern EPSG:326xx and 60 southern EPSG:327xx UTM zones in raster geometry and coordinate conversion, with inverse WGS84 geodetic formulas.
- GeoTIFF reader recognizes WGS84 UTM ProjectedCSType GeoKeys, not only EPSG:4326/3857.
- Bounded HTTP Range COG AOI clipping uses UTM transforms and sampled geographic edge envelopes for reliable window selection.
- Existing STAC-linked Sentinel-2 SCL / Landsat 8/9 QA_PIXEL pipeline automatically benefits for supported TIFF/COG assets. This release does NOT include JPEG2000 support.
- New UTM inverse, north/south GeoTIFF and COG range/pixel-quality regressions, Fedora smoke and version sync across 7 workspaces.


## 1.14.0 (development) — STAC-linked QA analysis

- Add `SpaceMapClient.analyzeObservationQa()`: provider+collection+item ID resolves a matching Sentinel-2 SCL or Landsat 8/9 QA_PIXEL COG from the official STAC item.
- Explicit host allowlist for asset URLs, identity checks, strict TIFF-only selection, optional Planetary Computer signing and rejection of unsafe/ambiguous scene mask links.
- Actual GeoTIFF HTTP byte-range windows reused from OpenLaunch raster engine; no token or provider URL in outputs.
- Source provenance makes clear STAC linkage is not independent image-to-scene authentication.
- Offline real TIFF fixture, security regressions, Fedora smoke and seven-workspace versions updated.


## 1.13.0 (development) — AOI Pixel Quality from real raster masks

- Sensor-specific Sentinel-2 L2A SCL and Landsat 8/9 Collection 2 QA_PIXEL classification of real georeferenced pixels in Polygon/MultiPolygon AOIs.
- Separates clear, cloud, shadow, snow, ambiguous and no-data; reports honest usable fraction of AOI and cloud fraction of classified pixels.
- Optional aligned science-band validity, mask size limits, null-safe zero-denominator handling.
- Backend-only allowlisted remote single-band QA GeoTIFF/COG ranged reads using OpenLaunch raster infrastructure, without provider credentials in user responses.
- Offline real TIFF byte-range regression, Fedora smoke and seven-package version alignment.


## 1.12.0 (development) — Satellite Footprint Coverage

- New `estimateFootprintCoverage()` calculates bounded approximate STAC Polygon/MultiPolygon vs convex AOI polygon overlap, subtracting polygon holes where present.
- `exploreObservations()` returns nullable `footprintCoveragePercent`, explicit basis and `pixelCoverageVerified:false` rather than inventing 100% for missing footprints.
- Optional `minFootprintCoveragePercent` filter to exclude low-coverage or unknown scenes.
- `bestAvailablePreview()` now includes catalog coverage estimate in candidate ranking while still verifying real preview bytes separately.
- Offline regression tests, standalone Fedora smoke and seven-workspace v1.12 alignment.


## 1.11.0 (development) — Best Available Satellite Preview

- New `SpaceMapClient.bestAvailablePreview()` combines location-first multi-provider discovery with verified JPEG/PNG image delivery.
- Catalog ranking supports balanced and recent strategies based on declared scene cloud %, acquisition time and product resolution, with optional optical priority.
- Bounded sequential fallback (default three, max five) when higher-ranked preview is missing, denied or invalid.
- Returns verified binary bytes only for a successful candidate, sanitized per-attempt statuses, no signed source URLs or fabricated acquisition proof.
- Regression suite, mocked Fedora demonstration and version alignment for all seven workspaces.


## 1.10.0 (development) — Verified Satellite Preview Delivery

- Added `SpaceMapClient.fetchObservationPreview()` for official STAC scene ID+provider+collection lookup followed by actual binary JPEG/PNG preview download.
- Explicit server-configured hostname allowlist, HTTPS-only nonredirecting bounded download, content MIME and image signature checks, and safe errors that do not disclose signed URLs.
- Optional Planetary Computer SAS signing through the existing provider adapter.
- Only claimed proof is successful binary preview delivery. STAC timestamp stays provider metadata; no independent acquisition proof.
- Offline regression suite and Fedora smoke, all seven workspaces aligned to 1.10.0.


## 1.9.0 (development) — Location-first Observation Explorer

- Added `SpaceMapClient.exploreObservations()`: find historical Copernicus Sentinel-2/1 and Planetary Computer Landsat data by map point+radius or bounds and date interval without requiring mission selection.
- Structured catalog results with STAC acquisition timestamp, asset kinds, declared resolution, preview pointer and cloud percentage; clear catalog-only and preview-unverified flags.
- Sorted results, optional cloud threshold and static DEM opt-in, strict bounded input and cross-provider partial-error handling with sanitized provider failure messages.
- No direct imagery download or fabricated live frames. Reuses existing SDK provider integrations.
- Fully offline Fedora smoke and regression tests; all seven workspaces bumped to v1.9 development.


## 1.8.0 (development) — Space Archive & Playback

- Unified `SpaceMapClient.archivePlayback()` across NASA GIBS daily WMTS requests and Meteosat time-advertised WMS images.
- Introduced common frame descriptors, chronology, attribution, delivery status, verified scope and check timestamp.
- Optional bounded sequential verification for at most eight recent frames; NASA verifies only one requested tile per day, Meteosat checks the full WMS image.
- Reuses existing Meteosat image/shared cache, supports unverified offline frames without provider imagery downloads.
- Added deterministic Fedora smoke, provider failure tests and seven-workspace version alignment.


## 1.7.0 (development) — Shared Meteosat Image Cache

- Optional, backend-neutral `MeteosatSharedImageStore` with cross-instance read/write support.
- Cloudflare Workers KV adapter with hashed official WMS keys, binary envelope and explicit expiry.
- `MeteosatImageCache` revalidates remote image data and permits shared hits across SDK instances; KV read/write errors fall back to upstream.
- Offline integration tests and standalone Fedora smoke; seven workspaces aligned to v1.7.0.


## 1.6.0 (development) — Meteosat Validated Image Cache

- Added `MeteosatImageCache`: 5-minute TTL, bounded LRU byte budget, single-flight identical requests and defensive copies.
- Integrated cache with `SpaceMapClient.meteosatPlayback()`, `probeImage()`, and direct `meteosatImage()` retrieval.
- Image cache never retains errors, malformed images or WMS images without explicit TIME.
- Added `meteosatCacheStats()`, `clearMeteosatCache()` and offline Fedora smoke.
- Updated all seven packages to v1.6 development versions; compatibility retained.


## 1.5.0 (development) — Meteosat Frame Verification

- Added bounded and sequential `SpaceMapClient.meteosatPlayback()`, selecting provider-advertised timeline frames and verifying image delivery.
- Each frame returns a georeferenced WMS URL, time, image availability, and playback flag; unverifiable capture time remains null.
- Provider checks are limited to 12 frames per request, with errors and missing images kept distinct.
- Added offline smoke and regression tests, updated all seven workspace versions.


## 1.4.0 (development) — Meteosat WMS Time-aware timeline

- XML capabilities parser now extracts nested layer title, exact ID, inherited Time dimension and derived WMS chronology.
- `meteosatAdvertisedTimes()` bounds and sorts timestamps, supports explicit ISO UTC dates and fixed-duration intervals without inventing observations.
- `MeteosatClient.timeline()` and `SpaceMapClient.meteosatTimeline()` return map-ready descriptors with `verifiedAcquisition:false` and `verifiedAvailable:false`.
- Opt-in real capabilities smoke, fully offline deterministic Fedora smoke and comprehensive regression tests.
- Package version alignment across seven independent SDK workspaces, preserving legacy exports.


## 1.3.0 (development) — Space Data Foundation

- v1.2 Live Earth implementation from PR #11 is the single unified 18-layer SDK registry; no duplicate provider client implementation from PR #12
- added SDK-controlled explicit image verification probes for NASA GIBS and EUMETView with provider error reporting and no invented acquisition times
- new independently installable @openlaunch/math workspace: vectors, matrices, quaternions, numerics, units, statistics and PID/Kalman control
- optional engineering reuses @openlaunch/math compiled modules, with legacy openlaunch-sdk and engineering exports retained
- updated TypeScript and isolated ESM/CommonJS npm package integration checks


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
