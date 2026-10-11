# Architecture

OpenLaunch has eight layers:

1. **Core transport** — fetch, cache, retry, dedupe, timeout, concurrency, telemetry and circuit breaking.
2. **Providers** — LL2, NASA, CelesTrak, generic STAC, Copernicus Data Space, Microsoft Planetary Computer and Open-Meteo.
3. **Normalized domain resources** — stable Launch/Rocket/Agency/Astronaut/Event/Pad models.
4. **Orbit dynamics** — SGP4/SDP4 propagation, TEME/Earth-fixed transforms, ground tracks, look angles and pass prediction.
5. **Space traffic and sensors** — closest approach, RTN geometry, bounded screening, swath/off-nadir access and 3D scenario export.
6. **Geospatial and EO primitives** — reusable WGS84 AOIs, STAC scene ranking, asset selection and spectral-index helpers.
7. **Intelligence/orchestration** — workflows that combine multiple providers while preserving provenance and limitations.
8. **Science/engineering toolbox** — deterministic calculations independent of provider availability.

Applications should prefer normalized models where available and use raw resources when they need provider-specific fields.

## Dependency direction

```text
application
   |
   +-- OpenLaunch client
   |     |
   |     +-- providers
   |     +-- resources
   |     +-- orbit engine
   |     +-- traffic engine
   |     +-- earth intelligence
   |
   +-- sensors / scenario
   +-- geo / eo primitives
   +-- science / engineering
```

Provider-specific payloads must not leak into unrelated modules. Deterministic science/math utilities must not depend on network providers. Cache adapters must remain runtime-agnostic.

The orbit layer may depend on the SGP4/SDP4 implementation and provider-normalized OMM/TLE inputs, but the traffic layer operates on propagated `Sgp4Satellite` objects rather than talking directly to HTTP.

The intelligence layer may combine providers and deterministic primitives, but providers must never depend on intelligence/orchestration.

## Orbit and traffic architecture

```text
CelesTrak OMM / TLE
       |
       v
  Sgp4Satellite
       |
       +---- TEME state --------+
       |                        |
       +---- ground track       +---- TrafficEngine
       +---- look angles        |       |
       +---- passes             |       +-- closest approach
       |                        |       +-- RTN / relative velocity
       |                        |       +-- bounded catalog screening
       |                        |
       +---- sensor access -----+
       |
       +---- OrbitScenario -> CZML -> Cesium
```

Important boundaries:

- GP elements are propagated with SGP4/SDP4, not the older two-body approximation.
- Earth-fixed conversion currently uses GMST and does not yet ingest measured IERS Earth Orientation Parameters.
- miss distance is not collision probability;
- sensor access is not acquisition/tasking truth;
- bounded catalog screening is designed to avoid accidental unbounded CPU workloads.

See `docs/ORBIT_TRAFFIC.md`.

## Earth-observation architecture

```text
AreaOfInterest
   |
   +-- Copernicus STAC -------- Sentinel-2 / Sentinel-1 metadata
   +-- Planetary Computer ---- Landsat / Sentinel / other STAC metadata
   +-- Open-Meteo ------------ cloud / visibility / precipitation / daylight
   +-- Sensor access --------- propagated geometric reach
   |
   v
EarthIntelligenceClient / application orchestration
   |
   +-- scene ranking
   +-- weather windows
   +-- optical vs radar recommendation
   +-- monitoring snapshots
   +-- provenance + limitations
```

Large raster processing is intentionally kept out of the generic JSON transport. Copernicus Process API is accessed directly as binary data so applications can request only the AOI they need.

See `docs/EARTH_INTELLIGENCE.md` for provider and modeling details.
