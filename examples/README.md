# OpenLaunch SDK examples

This directory is a **searchable, type-checked cookbook** for OpenLaunch SDK. It is intentionally organized for both humans and code/AI indexers: examples use descriptive filenames, self-contained imports, explicit units, short comments, and stable public symbols.

> These examples improve discoverability but do not guarantee that any particular AI system will crawl or index the repository.

## Conventions

- Every `.ts` file is self-contained and imports from the public root export.
- `Network: yes` examples call LL2, NASA or CelesTrak and may be rate-limited or change with upstream data.
- Pure engineering examples have `Network: no` and are deterministic unless they explicitly use `Math.random()`.
- Numerical/engineering utilities are first-order development tools, **not flight-qualified models**.
- SI units are used by default. Function names include units when ambiguity would be dangerous.
- Run `npm run examples:check` to type-check every example without calling the network.

## Fast paths for AI/code search

- Machine-readable catalog: [`catalog.json`](./catalog.json)
- LLM-oriented context: [`AI_INDEX.md`](./AI_INDEX.md)
- Root repository AI map: [`../llms.txt`](../llms.txt)

## Example catalog

### `getting-started`

- [`00-getting-started/01-next-launch.ts`](./00-getting-started/01-next-launch.ts) — **Fetch the next launch**. Smallest useful LL2 example: create a client and fetch the next normalized launch.
- [`00-getting-started/02-upcoming-launches.ts`](./00-getting-started/02-upcoming-launches.ts) — **List upcoming launches**. Fetch a small page of upcoming launches and print stable normalized fields.
- [`00-getting-started/03-search.ts`](./00-getting-started/03-search.ts) — **Search normalized resources**. Use high-level search helpers instead of constructing raw query parameters.
- [`00-getting-started/04-client-options.ts`](./00-getting-started/04-client-options.ts) — **Configure the client**. Configure caching, retry, timeouts, concurrency and telemetry. Keys are intentionally omitted from the example.
- [`00-getting-started/05-spaceclient-alias.ts`](./00-getting-started/05-spaceclient-alias.ts) — **Use the SpaceClient alias**. OpenLaunch is also exported as SpaceClient for compatibility and descriptive naming.
- [`00-getting-started/06-error-handling.ts`](./00-getting-started/06-error-handling.ts) — **Handle typed SDK errors**. Pattern for distinguishing rate limits, timeouts and other HTTP failures.

### `launch-library`

- [`01-launch-library/01-countdown-and-webcast.ts`](./01-launch-library/01-countdown-and-webcast.ts) — **Launch countdown and webcast helpers**. Derive countdown, webcast availability and a simple live-window indicator from a normalized launch.
- [`01-launch-library/02-filter-date-window.ts`](./01-launch-library/02-filter-date-window.ts) — **Filter launches by date window**. Ask LL2 for launches inside a concrete time window using Date values.
- [`01-launch-library/03-crewed-launches.ts`](./01-launch-library/03-crewed-launches.ts) — **Filter crewed launches**. Fetch only upcoming launches marked as crewed by LL2.
- [`01-launch-library/04-previous-launches.ts`](./01-launch-library/04-previous-launches.ts) — **Read launch history**. Retrieve recent launches in reverse chronological order.
- [`01-launch-library/05-pagination-iterator.ts`](./01-launch-library/05-pagination-iterator.ts) — **Stream pages with an async iterator**. Iterate across LL2 pages without manually managing offsets. maxItems prevents accidental large downloads.
- [`01-launch-library/06-collect-all-bounded.ts`](./01-launch-library/06-collect-all-bounded.ts) — **Collect a bounded result set**. Collect multiple pages into one array while using maxItems as a safety boundary.
- [`01-launch-library/07-agencies.ts`](./01-launch-library/07-agencies.ts) — **Browse launch agencies**. Read normalized agency metadata.
- [`01-launch-library/08-astronauts.ts`](./01-launch-library/08-astronauts.ts) — **Search astronauts**. Search normalized astronaut records and use optional career fields safely.
- [`01-launch-library/09-events.ts`](./01-launch-library/09-events.ts) — **Upcoming space events**. Fetch upcoming non-launch spaceflight events.
- [`01-launch-library/10-pads.ts`](./01-launch-library/10-pads.ts) — **Search launch pads**. Find launch pads and print geospatial fields when available.
- [`01-launch-library/11-generic-resources.ts`](./01-launch-library/11-generic-resources.ts) — **Use generic normalized resources**. Use stable id/name wrappers for LL2 entities that do not yet have dedicated rich OpenLaunch types.
- [`01-launch-library/12-raw-endpoints.ts`](./01-launch-library/12-raw-endpoints.ts) — **Access the complete raw LL2 surface**. Use raw resources when LL2 exposes a field or collection not normalized by the high-level SDK yet.
- [`01-launch-library/13-config-tables.ts`](./01-launch-library/13-config-tables.ts) — **Read LL2 configuration tables**. Configuration resources expose reference tables such as launch statuses, orbit types and mission types.
- [`01-launch-library/14-query-builder.ts`](./01-launch-library/14-query-builder.ts) — **Build advanced LL2 queries**. Compose Django-style filters without losing access to new LL2 filter names.
- [`01-launch-library/15-throttle-status.ts`](./01-launch-library/15-throttle-status.ts) — **Inspect LL2 throttle status**. Read LL2 request-limit information before a data-heavy workflow.
- [`01-launch-library/16-custom-resource.ts`](./01-launch-library/16-custom-resource.ts) — **Create a custom raw resource**. Create a RawResource for a current or future LL2 endpoint without waiting for a new SDK release.

### `nasa`

- [`02-nasa/01-neows-feed.ts`](./02-nasa/01-neows-feed.ts) — **NASA NeoWs date feed**. Fetch NASA near-Earth-object data for a date range. Response is left raw because NASA schemas evolve independently.
- [`02-nasa/02-neows-browse.ts`](./02-nasa/02-neows-browse.ts) — **Browse NASA near-Earth objects**. Browse paginated NeoWs objects using NASA DEMO_KEY by default.
- [`02-nasa/03-donki-space-weather.ts`](./02-nasa/03-donki-space-weather.ts) — **NASA DONKI space weather**. Query NASA DONKI for coronal mass ejections or other supported event types.
- [`02-nasa/04-epic-earth-images.ts`](./02-nasa/04-epic-earth-images.ts) — **NASA EPIC natural imagery metadata**. Fetch EPIC image metadata. This SDK returns the provider payload without inventing a second schema.
- [`02-nasa/05-technology-transfer.ts`](./02-nasa/05-technology-transfer.ts) — **Search NASA technology transfer**. Search NASA patent/technology-transfer data.
- [`02-nasa/06-raw-nasa-request.ts`](./02-nasa/06-raw-nasa-request.ts) — **Use the raw NASA provider**. Call a NASA Open API path that does not yet have a convenience method. api_key is added automatically.

### `celestrak`

- [`03-celestrak/01-iss-by-catalog.ts`](./03-celestrak/01-iss-by-catalog.ts) — **Fetch ISS OMM by catalog number**. Retrieve current OMM mean elements for NORAD catalog 25544 (ISS).
- [`03-celestrak/02-by-name.ts`](./03-celestrak/02-by-name.ts) — **Search CelesTrak by satellite name**. Retrieve OMM records using CelesTrak name matching.
- [`03-celestrak/03-stations-group.ts`](./03-celestrak/03-stations-group.ts) — **Fetch the stations group**. Fetch CelesTrak STATIONS group as OMM JSON.
- [`03-celestrak/04-operational-gnss.ts`](./03-celestrak/04-operational-gnss.ts) — **Fetch operational GPS satellites**. Read the GPS-OPS group. Useful for catalog exploration, not precision navigation.
- [`03-celestrak/05-tle-text.ts`](./03-celestrak/05-tle-text.ts) — **Request legacy TLE text**. Request text-format orbital elements when a downstream legacy tool explicitly needs TLE.
- [`03-celestrak/06-omm-to-state.ts`](./03-celestrak/06-omm-to-state.ts) — **Convert OMM to approximate two-body state**. Convert mean elements to Keplerian elements and an approximate state vector. This is intentionally not SGP4.

### `orbital-mechanics`

- [`04-orbital-mechanics/01-leo-reference.ts`](./04-orbital-mechanics/01-leo-reference.ts) — **LEO reference orbit**. Compute a simple circular LEO reference around Earth.
- [`04-orbital-mechanics/02-circular-and-escape.ts`](./04-orbital-mechanics/02-circular-and-escape.ts) — **Circular and escape velocity**. Compare circular-orbit and escape speeds at a selected Earth altitude.
- [`04-orbital-mechanics/03-state-elements-roundtrip.ts`](./04-orbital-mechanics/03-state-elements-roundtrip.ts) — **State vector and orbital elements round trip**. Convert an inertial state to Keplerian elements and back.
- [`04-orbital-mechanics/04-two-body-propagation.ts`](./04-orbital-mechanics/04-two-body-propagation.ts) — **Two-body orbit propagation**. Propagate Keplerian elements forward under an ideal two-body model.
- [`04-orbital-mechanics/05-hohmann-transfer.ts`](./04-orbital-mechanics/05-hohmann-transfer.ts) — **Hohmann transfer between circular Earth orbits**. Estimate ideal impulsive delta-v and transfer time between two circular radii.
- [`04-orbital-mechanics/06-earth-mars-hohmann.ts`](./04-orbital-mechanics/06-earth-mars-hohmann.ts) — **Earth to Mars Hohmann reference**. Compute a first-order heliocentric Earth–Mars transfer reference.
- [`04-orbital-mechanics/07-patched-conic-departure.ts`](./04-orbital-mechanics/07-patched-conic-departure.ts) — **Patched-conic Earth departure**. Estimate injection from a circular Earth parking orbit onto an Earth-to-Mars heliocentric transfer.
- [`04-orbital-mechanics/08-lambert.ts`](./04-orbital-mechanics/08-lambert.ts) — **Solve a Lambert transfer**. Solve a single-revolution Lambert boundary-value problem with inertial position vectors.
- [`04-orbital-mechanics/09-plane-change.ts`](./04-orbital-mechanics/09-plane-change.ts) — **Plane-change delta-v**. Estimate an ideal instantaneous plane-change maneuver at a known orbital speed.
- [`04-orbital-mechanics/10-spheres-of-influence.ts`](./04-orbital-mechanics/10-spheres-of-influence.ts) — **Sphere of influence and Hill sphere**. Estimate Earth gravitational influence scales relative to the Sun.
- [`04-orbital-mechanics/11-kepler-equation.ts`](./04-orbital-mechanics/11-kepler-equation.ts) — **Solve Kepler equation**. Convert mean anomaly to eccentric anomaly, then to true anomaly for an elliptic orbit.
- [`04-orbital-mechanics/12-j2-precession.ts`](./04-orbital-mechanics/12-j2-precession.ts) — **Estimate J2 nodal precession**. Estimate secular RAAN drift from Earth J2 for a simplified orbit.

### `rocket-engineering`

- [`05-rocket-engineering/01-rocket-equation.ts`](./05-rocket-engineering/01-rocket-equation.ts) — **Tsiolkovsky rocket equation**. Compute ideal delta-v and reverse-calculate propellant requirement for a single idealized stage.
- [`05-rocket-engineering/02-staging.ts`](./05-rocket-engineering/02-staging.ts) — **Multi-stage ideal delta-v**. Estimate ideal total delta-v for stacked stages with a payload above them.
- [`05-rocket-engineering/03-thrust-flow-burn.ts`](./05-rocket-engineering/03-thrust-flow-burn.ts) — **Thrust, mass flow and burn time**. Connect engine thrust and specific impulse to mass flow, T/W and approximate burn time.
- [`05-rocket-engineering/04-mass-fractions.ts`](./05-rocket-engineering/04-mass-fractions.ts) — **Rocket mass fractions**. Compute simple structural, propellant and payload fractions.
- [`05-rocket-engineering/05-delta-v-budget.ts`](./05-rocket-engineering/05-delta-v-budget.ts) — **Mission delta-v budget with reserves**. Aggregate named maneuver budgets and reserve fractions.

### `spacecraft-engineering`

- [`06-spacecraft-engineering/01-solar-and-battery.ts`](./06-spacecraft-engineering/01-solar-and-battery.ts) — **Solar array and battery sizing**. First-order spacecraft power sizing using solar flux, efficiency and eclipse duration.
- [`06-spacecraft-engineering/02-link-budget.ts`](./06-spacecraft-engineering/02-link-budget.ts) — **Deep-space style link margin**. Build a first-order RF link budget and compute one-way light time.
- [`06-spacecraft-engineering/03-doppler-and-capacity.ts`](./06-spacecraft-engineering/03-doppler-and-capacity.ts) — **Doppler shift and Shannon capacity**. Estimate first-order Doppler shift and theoretical channel capacity.
- [`06-spacecraft-engineering/04-thermal-balance.ts`](./06-spacecraft-engineering/04-thermal-balance.ts) — **Radiative thermal balance**. Estimate absorbed solar power, equilibrium temperature and emitted radiative power.
- [`06-spacecraft-engineering/05-propellant-tank.ts`](./06-spacecraft-engineering/05-propellant-tank.ts) — **Propellant mixture and tank volume**. Split bipropellant mass, estimate tank volume with ullage, and ideal-gas pressurant requirement.
- [`06-spacecraft-engineering/06-cryogenic-boiloff.ts`](./06-spacecraft-engineering/06-cryogenic-boiloff.ts) — **Cryogenic boil-off estimate**. Use a simple constant daily fractional boil-off model for architecture trades.
- [`06-spacecraft-engineering/07-structures.ts`](./06-spacecraft-engineering/07-structures.ts) — **Thin-wall pressure vessel and buckling checks**. First-order structural calculations for architecture and sanity checks.
- [`06-spacecraft-engineering/08-reliability.ts`](./06-spacecraft-engineering/08-reliability.ts) — **Series, parallel and k-of-n reliability**. Compare reliability architectures and steady-state availability.
- [`06-spacecraft-engineering/09-life-support-and-data.ts`](./06-spacecraft-engineering/09-life-support-and-data.ts) — **Crew consumables and data budget**. Estimate crew consumables and a simple daily instrument/downlink data balance.
- [`06-spacecraft-engineering/10-radiation.ts`](./06-spacecraft-engineering/10-radiation.ts) — **Radiation and single-event estimates**. Simple attenuation, accumulated dose and Poisson single-event probability helpers.

### `gnc-math`

- [`07-gnc-math/01-vectors.ts`](./07-gnc-math/01-vectors.ts) — **3D vector operations**. Basic vector primitives used throughout orbital and attitude calculations.
- [`07-gnc-math/02-matrices.ts`](./07-gnc-math/02-matrices.ts) — **Matrix solve and inverse**. Solve a small linear system and verify matrix inversion utilities.
- [`07-gnc-math/03-quaternions.ts`](./07-gnc-math/03-quaternions.ts) — **Quaternion attitude rotations**. Rotate a vector with a quaternion and interpolate attitude with SLERP.
- [`07-gnc-math/04-pid.ts`](./07-gnc-math/04-pid.ts) — **PID controller loop**. Run a minimal PID loop against a toy first-order plant.
- [`07-gnc-math/05-kalman.ts`](./07-gnc-math/05-kalman.ts) — **Linear Kalman filter**. Perform one constant-velocity predict/update cycle with a 2-state linear Kalman filter.
- [`07-gnc-math/06-filters.ts`](./07-gnc-math/06-filters.ts) — **Complementary and low/high-pass filters**. Apply simple filters to sensor-like scalar values.
- [`07-gnc-math/07-numerics.ts`](./07-gnc-math/07-numerics.ts) — **Root finding and numerical integration**. Use general numerical primitives on deterministic scalar functions.
- [`07-gnc-math/08-monte-carlo.ts`](./07-gnc-math/08-monte-carlo.ts) — **Monte Carlo scalar summary**. Run a deterministic-seed-free uncertainty sketch and summarize percentiles. Use a seeded RNG in reproducible engineering workflows.

### `geodesy-visibility`

- [`08-geodesy-visibility/01-geodetic-ecef.ts`](./08-geodesy-visibility/01-geodetic-ecef.ts) — **Geodetic and ECEF conversion**. Round-trip a WGS-84 latitude/longitude/altitude position through ECEF.
- [`08-geodesy-visibility/02-look-angles.ts`](./08-geodesy-visibility/02-look-angles.ts) — **Ground-station look angles**. Compute azimuth, elevation and range from a ground observer to an ECEF target.
- [`08-geodesy-visibility/03-great-circle.ts`](./08-geodesy-visibility/03-great-circle.ts) — **Great-circle distance and bearing**. Compute spherical distance/bearing and project a destination point.
- [`08-geodesy-visibility/04-earth-rotation.ts`](./08-geodesy-visibility/04-earth-rotation.ts) — **ECI/ECEF rotation and sidereal time**. Rotate vectors between simple Earth-fixed and inertial frames using GMST.
- [`08-geodesy-visibility/05-line-of-sight-and-eclipse.ts`](./08-geodesy-visibility/05-line-of-sight-and-eclipse.ts) — **Line of sight and cylindrical eclipse**. Check spherical-body line of sight and a simple cylindrical shadow approximation.

### `atmosphere-edl`

- [`09-atmosphere-edl/01-isa-atmosphere.ts`](./09-atmosphere-edl/01-isa-atmosphere.ts) — **ISA 1976 atmosphere sample**. Sample the built-in standard-atmosphere model at several geometric altitudes.
- [`09-atmosphere-edl/02-aerodynamic-loads.ts`](./09-atmosphere-edl/02-aerodynamic-loads.ts) — **Dynamic pressure, drag and Reynolds number**. Combine atmospheric state with first-order aerodynamic loads.
- [`09-atmosphere-edl/03-parachute-sizing.ts`](./09-atmosphere-edl/03-parachute-sizing.ts) — **First-order parachute sizing**. Estimate ideal parachute area and equivalent circular diameter from a target terminal speed.
- [`09-atmosphere-edl/04-entry-heating.ts`](./09-atmosphere-edl/04-entry-heating.ts) — **Sutton-Graves convective heating estimate**. Compute first-order stagnation-region heat flux, kinetic energy and ballistic coefficient.

### `astronomy-time-units`

- [`10-astronomy-time-units/01-units.ts`](./10-astronomy-time-units/01-units.ts) — **Unit conversion engine**. Convert across dimensions and enumerate supported velocity units.
- [`10-astronomy-time-units/02-julian-and-sidereal.ts`](./10-astronomy-time-units/02-julian-and-sidereal.ts) — **Julian date and sidereal time**. Convert UTC Date to Julian date and compute Greenwich/local sidereal angle.
- [`10-astronomy-time-units/03-blackbody.ts`](./10-astronomy-time-units/03-blackbody.ts) — **Blackbody and magnitude helpers**. Use simple astronomy utilities for blackbody peak wavelength, luminosity and magnitude scaling.
- [`10-astronomy-time-units/04-duration-and-dates.ts`](./10-astronomy-time-units/04-duration-and-dates.ts) — **Date and duration helpers**. Work with mission durations using Date objects and second-based helpers.

### `integrated-missions`

- [`11-integrated-missions/01-mars-architecture.ts`](./11-integrated-missions/01-mars-architecture.ts) — **Mars mission architecture sketch**. Combine independent first-order helpers into a human-readable Mars architecture study.
- [`11-integrated-missions/02-leo-spacecraft-sizing.ts`](./11-integrated-missions/02-leo-spacecraft-sizing.ts) — **LEO spacecraft first-order sizing**. Combine orbit, power and data helpers into a small LEO spacecraft sizing workflow.
- [`11-integrated-missions/03-launch-watch.ts`](./11-integrated-missions/03-launch-watch.ts) — **Build a launch-watch data snapshot**. Fetch a compact dashboard snapshot while reusing one cached client.

### `sdk-infrastructure`

- [`12-sdk-infrastructure/01-memory-cache.ts`](./12-sdk-infrastructure/01-memory-cache.ts) — **Use MemoryCache directly**. The cache adapter can be used and tested independently of HTTP.
- [`12-sdk-infrastructure/02-prefix-cache.ts`](./12-sdk-infrastructure/02-prefix-cache.ts) — **Namespace cache keys**. PrefixCache creates logical namespaces on top of a shared adapter.
- [`12-sdk-infrastructure/03-tiered-cache.ts`](./12-sdk-infrastructure/03-tiered-cache.ts) — **Compose a tiered cache**. TieredCache checks fast tiers first and warms earlier tiers after a hit.
- [`12-sdk-infrastructure/04-storage-cache.ts`](./12-sdk-infrastructure/04-storage-cache.ts) — **Adapt key/value storage to the SDK cache**. Wrap browser-like or app storage behind JsonStorageCache without coupling OpenLaunch to a specific storage library.
- [`12-sdk-infrastructure/05-telemetry.ts`](./12-sdk-infrastructure/05-telemetry.ts) — **Collect HTTP telemetry**. Observe requests, cache hits, retries and errors without modifying provider code.

