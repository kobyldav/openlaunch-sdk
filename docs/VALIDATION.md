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

## Earth-observation validation

Earth-data workflows must also distinguish:

- catalog-level cloud metadata from pixel-level cloud masks,
- weather forecasts from observed atmospheric conditions,
- spatial intersection from actual target visibility,
- a satellite orbit/pass opportunity from a confirmed instrument acquisition,
- raw/calibrated reflectance from display-scaled RGB values,
- optical imagery from SAR imagery.

Any future pass/access implementation must use a validated propagation model appropriate to the orbital elements and time horizon. The current `ommToApproximateState()` helper must not be promoted into an operational pass predictor.

