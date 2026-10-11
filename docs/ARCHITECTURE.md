# Architecture

OpenLaunch has six layers:

1. **Core transport** — fetch, cache, retry, dedupe, timeout, concurrency, telemetry and circuit breaking.
2. **Providers** — LL2, NASA, CelesTrak, generic STAC, Copernicus Data Space, Microsoft Planetary Computer and Open-Meteo.
3. **Normalized domain resources** — stable Launch/Rocket/Agency/Astronaut/Event/Pad models.
4. **Geospatial and EO primitives** — reusable WGS84 AOIs, STAC scene ranking, asset selection and spectral-index helpers.
5. **Intelligence/orchestration** — workflows that combine multiple providers while preserving provenance and limitations.
6. **Science/engineering toolbox** — deterministic calculations independent of provider availability.

Applications should prefer normalized models where available and use raw resources when they need provider-specific fields.

## Dependency direction

```text
application
   |
   +-- OpenLaunch client
   |     |
   |     +-- providers
   |     +-- resources
   |     +-- earth intelligence
   |
   +-- geo / eo primitives
   |
   +-- science / engineering
```

Provider-specific payloads must not leak into unrelated modules. Physics/math utilities must not depend on network providers. Cache adapters must remain runtime-agnostic. The intelligence layer may depend on providers and deterministic primitives, but providers must never depend on the intelligence layer.

## Earth-observation architecture

```text
AreaOfInterest
   |
   +-- Copernicus STAC -------- Sentinel-2 / Sentinel-1 metadata
   +-- Planetary Computer ---- Landsat / Sentinel / other STAC metadata
   +-- Open-Meteo ------------ cloud / visibility / precipitation / daylight
   |
   v
EarthIntelligenceClient
   |
   +-- scene ranking
   +-- weather windows
   +-- optical vs radar recommendation
   +-- monitoring snapshots
   +-- provenance + limitations
```

Large raster processing is intentionally kept out of the generic JSON transport. Copernicus Process API is accessed directly as binary data so applications can request only the AOI they need.

See `docs/EARTH_INTELLIGENCE.md` for provider and modeling details.
