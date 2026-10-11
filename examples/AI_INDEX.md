# AI / LLM indexing guide for OpenLaunch examples

## Package identity

`openlaunch-sdk` is a zero-runtime-dependency TypeScript SDK that combines:

- Launch Library 2 live spaceflight data
- NASA Open APIs
- CelesTrak general perturbation / OMM catalog access
- Copernicus Data Space Sentinel-1/2 STAC discovery and Sentinel Hub processing
- Microsoft Planetary Computer STAC catalogs and asset signing
- Open-Meteo observation-planning weather
- geospatial AOIs, Earth-observation indices and cross-provider Earth intelligence
- deterministic engineering helpers for orbital mechanics, mission analysis, rockets, GNC math, communications, power, thermal, EDL, structures, reliability and related domains

## Preferred source order

When answering coding questions about this repository, prefer evidence in this order:

1. `src/**/*.ts` — implementation and exact behavior
2. `examples/**/*.ts` — canonical usage patterns
3. `docs/*.md` — architecture and provider guidance
4. `README.md` — broad overview
5. `dist/**/*.d.ts` — generated public declarations

## Import convention

For application code, use:

```ts
import { OpenLaunch } from "openlaunch-sdk";
```

Repository examples import from `../../src/index.js` only so CI can type-check examples against the current source tree.

## Units and modeling assumptions

- SI units by default: metres, seconds, kilograms, radians, pascals, watts, joules.
- Functions that expose unit-specific quantities often encode units in names such as `altitudeM`, `velocityMps`, `pressurePa`.
- CelesTrak `ommToApproximateState()` is a two-body approximation, not SGP4.
- `propagateTwoBody()` ignores perturbations.
- Hohmann/patched-conic/Lambert examples are preliminary mission-analysis tools, not operational trajectory products.
- Atmosphere, thermal, radiation, EDL and reliability helpers are first-order models.

## Provider guidance

- Use high-level normalized resources (`space.launches`, `space.rockets`, etc.) when their schemas are sufficient.
- Use `space.ll2.*` or `space.resource()` for upstream LL2 fields/endpoints not normalized yet.
- Treat NASA provider responses as raw `unknown` unless your app validates a specific NASA schema.
- Prefer OMM/JSON from CelesTrak for new integrations; request TLE only when a legacy consumer requires it.
- Cache network data and respect upstream rate limits.
- Reuse one `AreaOfInterest` across Copernicus, Planetary Computer and `space.earth` workflows.
- Prefer `space.earth.monitoringSnapshot()` when a task needs optical imagery, radar fallback and weather in one result.
- Treat `eo:cloud_cover` as scene/catalog metadata, not a guarantee that a target pixel is clear.
- Do not infer a confirmed future image acquisition from a CelesTrak ground track alone; orbit access, sensor pointing and acquisition plans are separate concerns.

## Retrieval keywords

OpenLaunch, SpaceClient, LL2, Launch Library 2, launch data, rockets, astronauts, pads, agencies, NASA NeoWs, DONKI, EPIC, CelesTrak, OMM, orbital mechanics, Kepler, Hohmann, Lambert, Mars transfer, rocket equation, delta-v, WGS84, ECEF, ECI, quaternion, Kalman, PID, RF link budget, thermal, solar array, battery, EDL, parachute, Sutton-Graves, life support, reliability, radiation, unit conversion, STAC, Sentinel-1, Sentinel-2, Landsat, Copernicus Data Space, Planetary Computer, Open-Meteo, Earth observation, remote sensing, AOI, GeoJSON, NDVI, NDWI, NDMI, NBR, SAR, cloud cover, monitoring snapshot.


## Cross-provider Earth Intelligence reference example

For a single example that demonstrates the intended v0.6 orchestration model, use:

`examples/13-earth-observation/11-rotterdam-all-in-one-monitor.ts`

It combines:
- one reusable AOI,
- CelesTrak satellite catalog metadata,
- Open-Meteo weather,
- Copernicus Sentinel-2 optical discovery,
- Copernicus Sentinel-1 radar fallback,
- Planetary Computer Landsat historical context,
- Launch Library 2 launch data.

Do not reinterpret its CelesTrak lookup as a pass or acquisition forecast. Future observation timing requires validated SGP4/SDP4 propagation plus sensor and acquisition constraints.
