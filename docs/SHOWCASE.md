# Real OpenLaunch SDK 3D showcase

OpenLaunch is a TypeScript computational SDK, not a visualization framework. The README orbital and launch screenshots are captured from working browser WebGL scenes that consume actual OpenLaunch calculations. They are neither decorative infographics nor stock footage.

## Reproduce on Windows

From the current SDK root:

~~~powershell
npm ci
npm run showcase
~~~

The command compiles the SDK, installs isolated Playwright and Three.js tools, installs Chromium, and captures:

- docs/images/live/sdk-orbit-3d.png
- docs/images/live/sdk-launch-3d.png
- docs/images/live/sdk-showcase-provenance.json

The script downloads NASA Blue Marble global surface imagery and rejects unavailable or invalid texture bytes. It does not replace failed acquisitions with generated images. The browser viewer and data preparation are in tools/readme-gallery/showcase-viewer.html and scripts/generate-sdk-showcase.mjs.

## Data sources and limits

| Scene | Actual SDK pipeline | Provenance and limitation |
| --- | --- | --- |
| ISS 3D orbit | Sgp4Satellite.groundTrack() with georeferenced Earth-fixed positions | Historical June 2019 ISS TLE, **not live orbital position**. Earth surface texture is NASA Blue Marble 2002. |
| Launch ascent | simulateLaunch(), launchToCzml(), trajectory telemetry and events | **Generic two-stage 3DOF simulation**, not a real observed flight or a validated launch vehicle design. |
| 3D Prague | OpenLaunch.terrain.load() on the [experimental 3D terrain branch](https://github.com/kobyldav/openlaunch-sdk/tree/feature/terrain-prague-real-dem) | Real ČÚZK DMP OK elevations and Ortofoto ČR texture; measured source is 0.5m, but illustrated geometry samples at 2m and simplified building geometry. **Not published in main SDK**. |
| Copernicus and NASA imagery | SDK-backed Copernicus and GIBS services consumed by [kobylkadavid.cz](https://www.kobylkadavid.cz/) | Actual provider raster pixels, not fabricated images. Independent acquisition dates, cloud masking and upstream quotas need their own verification. |

NASA credit: NASA Goddard Space Flight Center, Reto Stöckli, [Blue Marble 2002](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/). The texture is historical and static. Terrain © ČÚZK, DMP OK and Ortofoto ČR, CC BY 4.0; OSM footprints also carry ODbL obligations. Screenshot of terrain is from the separate experimental feature branch's real measured tile and Edge WebGL test.

The orbit screenshot depicts propagated model positions. The launch screenshot depicts numerical model positions on a reference grid rather than an actual photograph of a rocket. Model telemetry, predicted event times and the experimental 3D reconstruction must never be represented as real flight telemetry or surveying-grade geometry.

## More than visuals

The SDK also provides launch-provider HTTP clients, spacecraft thermal and power sizing, link budgets, orbital transfers, Monte Carlo trajectory dispersion, mission planning, raster analysis, provider caches and error handling. Those capabilities are code APIs, not screenshots of a built-in application.

Relevant examples:
- [Orbit and traffic](../examples/14-orbit-traffic/)
- [Launch and staging](../examples/15-launch-trajectory/)
- [Earth observation](../examples/13-earth-observation/)
- [Raster and vegetation](../examples/17-raster/)
- [Orbital mechanics and transfers](../examples/04-orbital-mechanics/)
- [Spacecraft engineering](../examples/06-spacecraft-engineering/)
