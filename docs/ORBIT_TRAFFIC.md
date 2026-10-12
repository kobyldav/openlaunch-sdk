# Orbit Dynamics and Space Traffic

OpenLaunch v0.7 adds a real orbital-dynamics layer instead of treating CelesTrak records as static metadata.

The implementation uses the established `satellite.js` SGP4/SDP4 implementation for GP element propagation. OpenLaunch adds a typed domain layer around it: element provenance, state conversion, pass search, closest-approach refinement, RTN geometry, sensor access and scenario export.

## Why SGP4/SDP4

TLE and CelesTrak OMM GP element sets are mean elements intended for SGP4-family propagation. They are not osculating Keplerian elements.

The older OpenLaunch helper `ommToApproximateState()` remains useful for education and first-order calculations, but it must not be used as a tracking propagator.

v0.7 adds:

```ts
const sat = await space.orbit.byCatalogNumber(25544);
const state = sat?.stateAt(new Date());
```

The result contains:

- TEME position in km
- TEME velocity in km/s
- Earth-fixed position
- geodetic latitude / longitude / height
- source-element age
- whether the propagator selected near-Earth SGP4 or deep-space SDP4 mode

## OMM and TLE

New code should prefer CelesTrak OMM JSON when available:

```ts
const [record] = await space.celestrak.byCatalogNumber(25544);
const satellite = record ? space.orbit.fromOmm(record) : null;
```

Legacy TLE remains supported:

```ts
const satellite = space.orbit.fromTle(line1, line2, {
  name: "ISS",
  noradCatalogId: 25544,
});
```

OMM epochs preserve more timestamp precision than legacy TLE epochs.

## Reference frames

SGP4 output is treated explicitly as TEME.

OpenLaunch v0.7 provides:

```ts
temeToEcfPositionApprox(...)
temeToEcfStateApprox(...)
temeToGeodeticApprox(...)
geodeticToEcfKm(...)
```

The current Earth-fixed conversion uses Greenwich mean sidereal time.

That is appropriate for:

- ground tracks
- ordinary visualization
- pass geometry
- first-order access analysis

It is not a full precision TEME -> ITRF transformation.

Not yet applied:

- measured UT1-UTC
- polar motion xp / yp
- high-precision Earth orientation
- precession/nutation frame chains outside the SGP4/TEME context

Future precision mode should consume IERS Earth Orientation Parameters.

## Ground tracks

```ts
const track = satellite.groundTrack({
  start,
  end,
  stepSeconds: 30,
});
```

Every sample contains UTC time, WGS84-like geodetic position and Earth-fixed Cartesian position.

The API has an explicit `maxPoints` bound to prevent an accidental multi-million-point allocation.

## Ground-station passes

```ts
const passes = space.orbit.passes(
  satellite,
  {
    latitudeDeg: 50.0755,
    longitudeDeg: 14.4378,
    heightM: 250,
  },
  {
    start,
    end,
    minElevationDeg: 10,
    stepSeconds: 30,
  },
);
```

The search is two-stage:

1. coarse stepping detects threshold crossings;
2. crossings are refined by binary search;
3. the maximum-elevation time is refined inside each pass.

Returned values include:

- AOS
- TCA / maximum elevation time
- LOS
- maximum elevation
- minimum slant range
- AOS / TCA / LOS azimuth
- clipped-window flags

`lookAnglesAt()` additionally estimates signed range rate by symmetric finite difference.

## Closest approach

Pairwise relative-motion analysis:

```ts
const event = space.traffic.closestApproach(a, b, {
  start,
  end,
  stepSeconds: 60,
});
```

The algorithm:

1. propagates both objects across a bounded coarse grid;
2. finds the lowest sampled separation;
3. brackets the local minimum;
4. minimizes squared TEME separation with golden-section refinement;
5. evaluates relative position and velocity at the refined TCA;
6. transforms the relative position into the primary object's RTN frame.

Returned geometry:

```ts
{
  tca,
  missDistanceKm,
  relativeSpeedKmS,
  relativePositionTemeKm,
  relativeVelocityTemeKmS,
  rtn: {
    radialKm,
    alongTrackKm,
    crossTrackKm,
  }
}
```

## RTN / RIC frame

The RTN basis is built from the primary state:

- R: radial, along the primary position
- N: normal, along orbital angular momentum
- T: along-track, completing the right-handed frame

This is much more useful for conjunction interpretation than a raw XYZ difference.

## Multiple close approaches

```ts
const events = findCloseApproaches(primary, secondary, {
  start,
  end,
  thresholdKm: 50,
  stepSeconds: 60,
});
```

Local minima are detected on the coarse grid and independently refined.

## Catalog screening

For bounded CelesTrak groups:

```ts
const events = await space.traffic.screenGroup(primary, "STATIONS", {
  start,
  end,
  thresholdKm: 100,
  stepSeconds: 120,
  maxObjects: 500,
  maxResults: 50,
});
```

The bounds are deliberate. A full operational catalog screen is a large numerical workload and should use parallel/bulk propagation rather than accidentally running tens of millions of propagations on the UI thread.

Future versions can add workers or WASM bulk propagation while preserving this API.

## Catalog-coincident orbit records

CelesTrak may publish multiple catalog entries with the same GP orbital state
(e.g. components of an attached spacecraft). In that case, a propagator may
return exactly the same TEME position and velocity for distinct catalog IDs.

A computed **0 km separation is not a measured 0 km physical clearance**.
It may mean that the available catalog ephemerides cannot resolve the relative
motion. `TrafficEngine.nearestAt()` therefore returns:

```ts
{
  distanceKm,
  relativeSpeedKmS,
  separation: "resolved" | "indistinguishable-ephemeris"
}
```

`"indistinguishable-ephemeris"` is set only when both modeled position and
velocity coincide to tight numerical thresholds (1 mm and 1 micrometer/s).
The result neither asserts that the objects are docked nor merges their
NORAD identities. By default, all entries are preserved.

To hide these unresolved GP states in a ranking while preserving an explicit
opt-in to the full raw view:

```ts
const distinct = space.traffic.nearestAt(
  primary,
  candidates,
  at,
  10,
  { includeIndistinguishable: false },
);
```

Do not use this convenience filter as a safety screen: for conjunction analysis,
preserve source identities and seek higher-quality ephemerides and relative
navigation data.

## What miss distance is not

OpenLaunch deliberately does not return a made-up collision probability.

A useful probability of collision normally requires uncertainty information such as state covariance and a well-defined encounter plane / probability model.

v0.7 reports:

```ts
quality: {
  covarianceAvailable: false,
  collisionProbabilityAvailable: false,
  primaryElementAgeHours,
  secondaryElementAgeHours,
  freshness
}
```

Element age matters. A numerically precise TCA derived from stale orbital elements is not an operationally precise prediction.

## Sensor access

v0.7 also adds first-order Earth-observation access geometry.

```ts
const windows = findSensorAccessWindows(
  satellite,
  SENSOR_PRESETS.sentinel2Msi,
  {
    area,
    start,
    end,
  },
);
```

The model combines:

- propagated satellite ground point
- AOI extent
- nominal sensor swath
- optional maximum off-nadir pointing
- spherical-Earth line-of-sight geometry

Helpers:

```ts
offNadirGroundReachKm(altitudeKm, offNadirDeg)
requiredOffNadirDeg(altitudeKm, groundDistanceKm)
```

A returned access window means the target is geometrically reachable under the declared sensor model.

It does **not** mean:

- the spacecraft was tasked
- the sensor was active
- the actual mission acquisition plan includes the target
- clouds permit an optical image
- the product was downlinked or published

Those constraints belong in higher-level observation planning.

## Earth observation + orbit

The intended composition is now possible:

```ts
const [sentinel2c] = await space.orbit.byName("SENTINEL-2C");

const windows = findSensorAccessWindows(
  sentinel2c,
  SENSOR_PRESETS.sentinel2Msi,
  {
    area: czechia,
    start: new Date(),
    end: new Date(Date.now() + 7 * 86400_000),
  },
);

const weather = windows[0]
  ? await space.weather.conditionsAt(lat, lon, windows[0].closest)
  : null;

const imagery = await space.copernicus.searchSentinel2(
  czechia,
  thirtyDaysAgo,
  new Date(),
  20,
);
```

This separates three different facts correctly:

1. orbital geometry says whether the satellite can reach the area;
2. weather says whether optical conditions may be useful;
3. the imagery catalog says what acquisitions actually exist.

## 3D scenarios

`OrbitScenario` and `satelliteToCzml()` export sampled Earth-fixed trajectories as Cesium CZML.

```ts
const scenario = new OrbitScenario(start, end)
  .addSatellite("iss", iss)
  .addSatellite("sentinel-2c", sentinel2c);

const czml = scenario.toCzml(30);
```

This creates a direct bridge from numerical propagation to a 3D globe.

The current CZML frame conversion has the same Earth-orientation limitations described above.

## Numerical and operational boundaries

v0.7 is a major improvement over two-body propagation, but it is still not a certified operational SSA system.

For high-consequence use, independently validate:

- element freshness and source
- propagation implementation/version
- Earth orientation
- state covariance
- screening window and sample/refinement settings
- maneuver knowledge
- object identity
- sensor acquisition constraints

## Screening an external or launch trajectory

The traffic layer is not limited to two SGP4 satellites.

`SampledTemeTrajectory` accepts time-tagged TEME position and velocity states from an external dynamics model:

```ts
const trajectory = new SampledTemeTrajectory(states);

const events = space.traffic.screenTrajectory(
  trajectory,
  catalog,
  100, // threshold km
  50,  // max results
);
```

Between supplied states OpenLaunch uses cubic Hermite interpolation, preserving both position and velocity at sample boundaries. The satellite side is still propagated with SGP4/SDP4, and closest approach is numerically refined inside every trajectory segment.

This is the bridge needed for launch-vehicle screening: a future 3DOF/6DOF ascent model only needs to output time-tagged TEME states, and the existing traffic engine can screen them against the satellite catalog.

The frame contract is strict: do not feed ECEF, GCRF or arbitrary local-frame states into `SampledTemeTrajectory` without transforming them to the documented TEME frame.

## Next layer: launch trajectories

The orbital/traffic engine is intentionally built before launch-vehicle corridor simulation.

A serious launch trajectory engine needs:

- launch pad geodesy
- Earth rotation
- atmospheric density and winds
- vehicle stage masses
- thrust and Isp curves
- drag / reference area
- pitch / guidance law
- staging and fairing events
- target orbital plane / insertion state
- uncertainty corridor

Once a 3DOF/6DOF launch trajectory produces time-tagged Earth-centered states, the same traffic engine can screen the rocket path against propagated satellites.

That is the planned v0.8 direction.
