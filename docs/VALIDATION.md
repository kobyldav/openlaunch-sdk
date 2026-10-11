# Validation and flight-safety boundary

OpenLaunch is not flight-qualified software.

Every new analytical function should have:

- explicit units in parameter names or documentation,
- deterministic tests,
- references to the equation/model where practical,
- defined validity limits,
- numerical sanity checks,
- no hidden provider/network dependency.

High-consequence functions should be compared against at least one independent implementation or authoritative reference before release.

Do not silently replace high-fidelity models with first-order approximations. Name approximations explicitly, as done by `ommToApproximateState`.

## Orbit / SSA validation

v0.7 introduces SGP4/SDP4 through the established `satellite.js` implementation.

Rules:

- use `Sgp4Satellite` for tracking GP OMM/TLE elements;
- keep the element source and epoch visible;
- report element age at the evaluation epoch;
- treat SGP4 output as TEME;
- do not describe the current GMST-only Earth-fixed conversion as full ITRF/EOP precision;
- bound pass, track and catalog searches to avoid unbounded CPU/memory work;
- refine TCA after coarse sampling rather than presenting grid time as exact closest approach;
- report RTN/RIC separation when interpreting conjunction geometry;
- never convert miss distance alone into probability of collision;
- require covariance/uncertainty data before adding probabilistic conjunction products;
- reject or quarantine failed/physically invalid propagated states.

A precise floating-point TCA does not imply precise orbital knowledge. GP element uncertainty, age, maneuvers and incomplete tracking can dominate numerical refinement.

## Sensor-access validation

Sensor access must distinguish:

- orbital geometric reach,
- nominal swath,
- off-nadir pointing capability,
- actual spacecraft attitude,
- tasking/acquisition plan,
- instrument availability,
- atmospheric conditions,
- published image/product existence.

`findSensorAccessWindows()` currently implements spherical-Earth swath/off-nadir geometry. It is a planning geometry model, not mission-operations truth.

## Earth-observation validation

Earth-data workflows must also distinguish:

- catalog-level cloud metadata from pixel-level cloud masks,
- weather forecasts from observed atmospheric conditions,
- spatial intersection from actual target visibility,
- a satellite orbit/pass opportunity from a confirmed instrument acquisition,
- raw/calibrated reflectance from display-scaled RGB values,
- optical imagery from SAR imagery.

The older `ommToApproximateState()` helper remains educational/first-order and must not be promoted into an operational pass predictor now that the SGP4/SDP4 layer exists.
