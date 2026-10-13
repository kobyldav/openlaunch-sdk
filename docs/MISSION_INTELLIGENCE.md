# OpenLaunch SDK v0.9.0 — Mission & Earth Intelligence

v0.9 closes specific integration gaps left by the v0.6 (Earth observation), v0.7 (SGP4/traffic) and v0.8 (generic launch dynamics) development branches. It does **not** pretend to have completed every feature required for flight-qualified launch planning, full raster processing or real satellite tasking.

## Quick start

```bash
npm ci
npm run check
npm run example:mission
npm run example:launch
npm run example:orbit-traffic
npm run example:rotterdam
```

The `example:mission` test uses synthetic, explicitly labeled STAC items and a historical satellite TLE to run without network access. Live data must be fetched separately.

## v0.6 completion — available imagery and data layers

`space.earth.discoverObservations({area, from, to})` queries four logical layers independently:

| Layer | STAC collection | Catalog source | Interpretation |
|---|---|---|---|
| Optical | `sentinel-2-l2a` | Copernicus | Multispectral surface-reflectance acquisitions |
| SAR | `sentinel-1-grd` | Copernicus | GRD radar acquisitions; not ready-to-use RGB photography |
| Thermal | `landsat-c2-l2` | Planetary Computer | Surface-temperature layer **if** corresponding assets exist |
| Elevation/3D input | `cop-dem-glo-30` | Planetary Computer | Historical/static digital surface-model input, NOT an up-to-date 3D scene |

The DEM search intentionally has no time filter. Static terrain does not represent a new image acquired within the requested date range.

`ObservationDiscoveryReport` provides `queryStatuses` for every provider, `scenes`, `newestByLayer`, and `catalogOnly:true`. If one provider fails, results from others remain available. Failures are not silently treated as “zero imagery exists.”

`inspectEoProduct(item)` and `selectEoAssets(product, layer)` expose only real asset keys, links, roles, recorded ground sample distance (`gsd`), and available modalities. A missing `gsd` stays *unspecified*. Do not substitute a nominal satellite resolution or a rendered thumbnail resolution for a verified raster pixel size. Explicit asset metadata may be missing or wrong; verify product documentation.

```ts
import { OpenLaunch, bbox, inspectEoProduct, selectEoAssets } from "openlaunch-sdk";

const space = new OpenLaunch();
const area = bbox(12.1, 48.6, 18.9, 51.1);
const report = await space.earth.discoverObservations({
  area,
  from: new Date("2026-09-01"),
  to: new Date("2026-10-13"),
  layers: ["optical","radar","thermal","elevation"],
  perQueryLimit: 10,
});
console.table(report.queryStatuses);
const newest = report.newestByLayer.optical;
if (newest) {
  const product = inspectEoProduct(newest.item);
  console.log(product.availableResolutionsM);
  console.log(selectEoAssets(product,"visible"));
}
```

A scene intersecting the supplied area is not proof that the exact coordinates have valid/cloudless pixels. Catalog cloud cover typically describes a scene-level estimate, not the exact AOI.

### Download existing imagery bytes

`space.earth.downloadPreview(item, options)` selects a STAC preview/visual asset and downloads its **actual bytes**. It never fabricates a photo or a URL. Downloads are capped at 12 MiB by default, 64 MiB maximum, and 20 s by default. Only HTTPS assets are accepted, redirects are rejected, obvious private/loopback IPs are blocked, and `allowedHosts` can restrict access to trusted domains.

```ts
const preview = report.newestByLayer.optical;
if (preview) {
  // Use only trusted provider-hostnames. A signed URL may be needed.
  const file = await space.earth.downloadPreview(preview.item, {
    allowedHosts: ["trusted-imagery.example.org"],
    maxBytes: 12 * 1024 * 1024,
  });
  console.log(file.contentType, file.byteLength, file.decodedPixels);
}
```

The hostname above is a placeholder: use an actual domain returned by a trusted scene asset. Some real imagery links require signing; use `space.planetaryComputer.signAsset(...)` or provider authentication before downloading. `downloadEoAsset` works on the selected asset metadata when an alternate asset is desired. No COG window reads, pixel resampling, cloud-mask reprojection, TIFF parser, thermal radiometry correction or 3D mesh generation is included yet. Untrusted redirect/DNS environments may require a dedicated egress allowlist/proxy outside this SDK.

### Pixel interpretation (caller supplies raster samples)

- `landsatC2SurfaceTemperature(dn)`: calibrated Landsat Collection 2 ST_B10 DN to Kelvin and Celsius using official scale/offset, returning `null` for fill/invalid pixels.
- `landsatC2StUncertaintyKelvin(dn)`: ST_QA uncertainty scale.
- `sentinel2SclClass(code)`, `summarizeSentinel2Scl(codes)`: classify caller-provided Sentinel-2 L2A SCL values; no claim of AOI cloud cover unless the input has actually been clipped/masked to the AOI.

These functions do not fetch imagery themselves. Surface temperature is a land/surface skin temperature, not ambient air temperature.

### Reliable snapshot

`space.earth.monitoringSnapshot(...)` now tolerates intermittent provider failures. The new `sourceFailures` array and provenance indicate when a snapshot is incomplete.

## v0.7 completion — quality-assessed orbital correlation

`auditTrajectoryAgainstCatalog(trajectory, satellites, {thresholdKm, maxEphemerisAgeHours})` evaluates each supplied SGP4 orbit independently and exposes all nearest modeled approaches, including those **outside** the proximity threshold.

It also flags stale element ages and coarse trajectory sampling relative to encounter duration. The entire sampled catalog is bounded, and failed objects are reported under `failures` rather than discarded silently.

```ts
const flight = space.trajectory.simulate(model);
const satellites = [satelliteFromOmm];
const audit = space.trajectory.auditTraffic(flight, satellites, {
  thresholdKm: 20,
  maxEphemerisAgeHours: 72,
});
console.log(audit.encounters, audit.failures, audit.warnings);
```

The `operationalClearance` field is always **false**. Geometric miss distance without validated uncertainty covariance, complete catalogs, correlated object maneuvers, precise EOP and numerical convergence is not collision probability or safe flight clearance.

`reconcileAccessWithScenes(windows, stacItems, {expectedPlatform, toleranceSeconds})` correlates *modeled* geometric swath-access windows with the timestamps of separately discovered, spatially filtered STAC items. Its `confidence` is either `time-only` or `time-and-platform`. An identity mismatch is rejected. Neither result proves exact AOI pixel coverage, genuine tasking or sensor acquisition guarantee; `acquisitionProved` remains false.

## v0.8 completion — target-orbit mission diagnostics

`space.mission.assess(simulation, target)` scores the instantaneous osculating final orbital elements against an explicitly supplied target (perigee, apogee and optional inclination, with tolerances). Only a bound two-body candidate above 160 km perigee within tolerances passes the purely kinematic `achieved` field; **this is not flight validation**.

`space.mission.sweep(model, target, {pitchOffsetsDeg, headingOffsetsDeg})` is a bounded, reproducible **grid sweep**, up to 64 candidates by default. It repeats the physics integration for specified guidance offsets and ranks output by transparently reported errors and constraint violations. It cannot promise orbital insertion or optimize an actual Falcon mission from launch time alone.

```ts
const target = { perigeeAltitudeKm: 350, apogeeAltitudeKm: 350, inclinationDeg: 51.6 };
const study = space.mission.sweep(model, target, {
  pitchOffsetsDeg: [-5, -2, 0, 2, 5],
  headingOffsetsDeg: [-2, 0, 2],
});
console.log(study.best.assessment, study.achieved);
```

`space.mission.idealDeltaV(model)` reports a vacuum-only ideal multistage rocket-equation diagnostic. `space.mission.circularSpeed(altitudeKm)` returns ideal two-body circular speed. **Neither** includes full ascent gravity/drag/steering losses, orbital plane changes, stage thrust constraints or verified performance margins.

## Known remaining engineering work

| Requested capability | v0.9 status | What is still necessary |
|---|---|---|
| Latest catalog acquisition over Czechia | **Available** from provider STAC when the endpoint works | Verify exact AOI pixel coverage and image QA |
| Latest real preview image bytes | **Available if the item exposes accessible preview** | Provider signing/auth, content display/storage pipeline |
| Same place, several satellite resolutions | **Available as recorded asset metadata** | COG window reads and reprojection onto common grid |
| Land-surface temperature | **Pixel conversion available** | Read actual ST_B10 and masks, quality thresholds |
| Clouds above exact location | **SCL samples can be classified** | Clip/reproject actual scene SCL to location |
| Terrain / 3D over an area | **DEM discovery available** | Georeferenced height raster, mesh creation, texture fusion |
| SGP4 satellite passes and swath | **Available** from v0.7 | Better platform-dependent pointing geometry and EOP |
| Actual confirmed instrument overpass | **Temporal correlation available, not confirmation** | Actual spacecraft acquisition/timing and target pixels |
| Generic multistage rocket ascent | **Available** from v0.8 | 6DOF, winds, TVC, adaptive events/solver, calibrated vehicle |
| Optimize desired target orbit | **Bounded exploration available, not closed-loop targeting** | Full guidance controls, true optimization, convergence and reference validation |
| Rocket through satellite catalog | **Geometric screening plus data-quality flags** | Fresh high-precision ephemerides, complete catalog, validated covariances |

### Accuracy contract

Every output states whether it is a catalog pointer, a real downloaded binary, a computed pixel transformation, a geometric model, or an idealized mission assessment. No hidden substitution is made between these categories. All v0.9 work remains engineering/research software rather than flight-certified operational guidance.
