# Provider strategy

## Launch Library 2

Primary source for launches, agencies, astronauts, spacecraft, stations, pads, payloads and related spaceflight metadata. The SDK currently targets LL2 2.3.0.

## NASA

NASA APIs are heterogeneous and can be moved or archived independently. OpenLaunch therefore provides common convenience calls plus a raw escape hatch.

## CelesTrak

OpenLaunch defaults to OMM JSON for GP data. TLE remains available for compatible legacy catalog numbers, but modern OMM formats avoid the 5-digit catalog-number limitation.

v0.7 separates **catalog access** from **orbit propagation**:

```ts
const satellite = await space.orbit.byCatalogNumber(25544);
const state = satellite?.stateAt(new Date());
```

CelesTrak remains the data provider; the `space.orbit` layer initializes an SGP4/SDP4 model from the returned GP elements. The element epoch and age remain visible so callers can judge freshness.

The older `ommToApproximateState()` helper is only a two-body educational approximation and should not be used for GP tracking, pass prediction or traffic screening now that the dedicated SGP4/SDP4 path exists.

OpenLaunch pins `satellite.js` as the focused propagation dependency. This avoids maintaining a home-grown SGP4 implementation while OpenLaunch owns the higher-level frame, pass, traffic, sensor and scenario semantics.

All external data should be cached responsibly and stamped with retrieval time/provenance by applications that use it for engineering workflows.

## Generic STAC

`StacClient` is the provider-neutral catalog layer. Applications can connect standards-compatible catalogs without waiting for an OpenLaunch release. STAC items stay close to upstream schema so important EO metadata is not lost.

## Copernicus Data Space

OpenLaunch uses the public CDSE STAC catalog for Sentinel discovery and optionally the Sentinel Hub Process API for server-side raster processing. Sentinel Hub processing requires OAuth credentials or a valid access token. Client secrets should not be embedded in public frontend bundles.

## Microsoft Planetary Computer

The STAC catalog is available without an account. Some Azure-backed assets require short-lived SAS signing; `PlanetaryComputerClient` exposes URL/asset/item signing and optional subscription-key support.

## Open-Meteo

Used as an observation-planning weather source for cloud cover, visibility, precipitation probability and daylight. Forecasts are planning inputs, not ground truth and not substitutes for pixel-level cloud masks.

## Provider selection principles

- Prefer open standards such as STAC over vendor-specific search schemas when possible.
- Preserve provider provenance in analytical workflows.
- Do not claim identical semantics across optical, SAR and meteorological products.
- Keep authentication provider-specific but expose one coherent client surface.
- Cache responsibly and honor upstream rate limits and token expiry.
- Do not treat orbital catalog data as proof of actual sensor tasking or acquisition.

