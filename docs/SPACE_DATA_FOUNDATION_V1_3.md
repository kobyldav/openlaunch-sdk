# OpenLaunch v1.3 — Space Data Foundation

**Status:** development branch. Not a published npm release.

## SDK owns space integrations

The website renders outputs from OpenLaunch. SDK modules own catalog queries, request validation, provenance, analysis, orbit models and public live-stream descriptors. Raw pixels and videos still originate at NASA, Copernicus, EUMETSAT and other attributed providers.

### Consolidation

v1.3 is based on PR #11's more complete Live Earth implementation (18 satellite/analysis/stream descriptors), while following the honest availability metadata principles from PR #12. Do not fork the providers or expose competing registries. The canonical catalog is `new SpaceMapClient().layers()`. No PR #11/#12 merge into `main` was performed here.

### Provider image probe

```ts
import { SpaceMapClient } from "@openlaunchsdk/earth";

const maps = new SpaceMapClient();
// Run on the backend, with caching and rate limits.
const result = await maps.probeImage({
  source: "nasa-gibs",
  layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
  date: "2026-10-13", z: 6, x: 34, y: 22,
});
console.log(result.status, result.checkedAt, result.observedAt);
```

Only a successful nonempty JPEG/PNG magic signature plus upstream MIME proves the requested image was delivered. HTTP 404/410 means `unavailable`; other HTTP/network/format errors mean `error`. Even with `available`, `observedAt: null` and `verifiedAcquisition:false`: a request date or WMS default time is not satellite capture time.

For Meteosat, use `{source:"meteosat",map:{layer,bounds3857,width,height,time?}}`; obtain layer names through `maps.meteosatCapabilities()` first. Do not probe each map tile on every render. Cache backend image probes per provider/date/tile.

### General math is optional

```ts
import { matrixMul, vec3, LinearKalmanFilter } from "@openlaunchsdk/math";
```

The seventh workspace `@openlaunchsdk/math` owns shared vectors, matrices, quaternions, statistics, units, numerical methods, control/PID and Kalman filtering. Compiled engineering imports those modules rather than copying them. Legacy umbrella and engineering exports stay available in v1 for compatibility. The original TypeScript source remains under `src/science/` during migration.

### Unfinished / risks

- Meteosat's WMS Time dimension and actual frame timestamps require a standards-aware, provider-tested parser before a trustworthy automatic animation.
- NASA GIBS date availability should be checked against current WMTS Capabilities for coverage beyond individual verified tiles.
- Sentinel-5P visual PNG isn't a calibrated science raster; QA and units need product-level validation.
- Stream uptime/embed availability is controlled by broadcasters, not by SDK.
- FIRMS MAP_KEY and Copernicus credentials must remain backend-side.
- Offline CI is not evidence of live satellite availability.
- All v1.3 scoped packages require explicit publication; no publication is claimed.

Validation: `npm ci && npm run check && npm run pack:check:packages && npm run test:packed`.
