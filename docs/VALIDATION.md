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


## v0.8 launch dynamics verification

- Preserve SI units across WGS84/ECEF dynamics; distinguish ECEF velocities from inertial/TEME-like velocities.
- RK4 is fixed-step with event segmentation; check convergence by decreasing `stepSeconds` for each model.
- Track stage fuel, fairing dry-mass drops, stage burnout and coast chronology without negative propellant.
- Treat the standard atmosphere, upper-atmosphere tail and uniform winds as approximations.
- Use LL2 only for pad and NET; never infer an authoritative launch profile from it.
- The ECEF->TEME-like bridge uses GMST, not IERS EOP; traffic screening is exploratory and not a flight-safety determination.
- Orbital insertion requires a verified orbit/vehicle/guidance; final two-body osculating elements are only diagnostics.
- Validate any high-consequence use with independent numerical models, measured states, covariances, requirements and certified software.
