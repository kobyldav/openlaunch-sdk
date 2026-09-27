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
