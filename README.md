# OpenLaunch SDK

**OpenLaunch SDK** is a zero-runtime-dependency TypeScript toolkit for spaceflight data, mission analysis, orbital mechanics and spacecraft engineering.

It combines three layers in one package:

1. **Live spaceflight data** — Launch Library 2 (LL2), NASA Open APIs and CelesTrak.
2. **Mission-engineering utilities** — orbital mechanics, interplanetary transfers, rockets, geodesy, atmosphere, communications, thermal, power, navigation, EDL, reliability, statistics and more.
3. **Production SDK infrastructure** — typed resources, pagination, caching, request deduplication, retries, timeouts, concurrency control, telemetry and a circuit breaker.

The goal is not to hide public data behind a paywall. The goal is to provide a clean, reusable engineering layer on top of public sources and deterministic calculations.

> **Important:** OpenLaunch is an engineering/development library, not flight-qualified software. Do not use its results as the sole basis for human safety, launch commit criteria, collision avoidance, flight termination, autonomous spacecraft control or other safety-critical operations without independent verification, validated models, requirements traceability and appropriate certification.

---

## What changed in v0.5.x

The original OpenLaunch wrapper has been expanded into a much broader spaceflight SDK.

- Full LL2 2.3.0 endpoint surface through `sdk.ll2.*`
- LL2 configuration/reference tables through `sdk.config.*`
- Normalized typed resources for launches, launch vehicles, agencies, astronauts, events and pads
- NASA provider with NeoWs, DONKI, EPIC, technology transfer and current APOD access
- CelesTrak provider built around OMM/JSON instead of assuming legacy 5-digit TLE identifiers
- CelesTrak OMM → approximate Keplerian state helpers
- Fluent LL2 query builder
- Automatic pagination with async iterators and `all()` collection
- Memory, tiered and storage-backed cache adapters
- Request deduplication
- Exponential retry with jitter
- `Retry-After` handling
- Timeouts
- Concurrency limits
- Optional request spacing
- Circuit breaker
- Telemetry events
- 90+ supported engineering units through one conversion engine
- Orbital mechanics and two-body propagation
- Earth–Mars Hohmann reference calculations
- Rocket equation and staging
- ISA atmosphere and aerodynamic helpers
- WGS-84 geodesy and ECI/ECEF conversion
- RF/link-budget tools
- Thermal and spacecraft power tools
- Linear algebra, numerical integration and root finding
- Quaternions and attitude utilities
- Linear Kalman filter, filters and PID control
- Structures, entry/descent/landing and reliability helpers
- Mission consumables, data-volume and radiation utilities
- ESM and CommonJS builds
- Node 18/20/22 CI workflow
- Zero runtime dependencies

The package currently exposes more than **300 public exports**. It intentionally does **not** create thousands of duplicate functions such as `kmToM()`, `mToKm()`, `kmToFt()`, etc. Generic engines such as `convert()`, `QueryBuilder`, raw LL2 resources and numerical primitives cover thousands of valid operations without turning the API into an unmaintainable list of aliases.

---

## Installation

```bash
npm install openlaunch-sdk
```

For development from this repository:

```bash
npm install
npm run check
```

Requirements:

- Node.js 18+
- or a browser/runtime with `fetch`
- TypeScript is only a development dependency
- no runtime npm dependencies

---


## Examples and AI/code indexing

The repository includes **90 categorized, type-checked TypeScript examples** under [`examples/`](./examples/). The examples are deliberately optimized for code search and AI/LLM retrieval: descriptive paths, self-contained imports, explicit units, a machine-readable catalog, and an AI-oriented context file.

```text
examples/
├── 00-getting-started/
├── 01-launch-library/
├── 02-nasa/
├── 03-celestrak/
├── 04-orbital-mechanics/
├── 05-rocket-engineering/
├── 06-spacecraft-engineering/
├── 07-gnc-math/
├── 08-geodesy-visibility/
├── 09-atmosphere-edl/
├── 10-astronomy-time-units/
├── 11-integrated-missions/
├── 12-sdk-infrastructure/
├── catalog.json
└── AI_INDEX.md
```

Useful commands:

```bash
npm run examples:check   # type-check every example; no network calls
npm run check            # source + examples + unit tests
```

AI-oriented repository map: [`llms.txt`](./llms.txt). Machine-readable example inventory: [`examples/catalog.json`](./examples/catalog.json). These files improve discoverability but cannot guarantee indexing by any specific AI provider.

---

# 1. Quick start

```ts
import { OpenLaunch } from "openlaunch-sdk";

const space = new OpenLaunch();

const next = await space.launches.next();

console.log(next?.name);
console.log(next?.net);
console.log(next?.rocket?.name);
console.log(next?.provider?.name);
console.log(next?.pad?.name);
```

`SpaceClient` remains an alias:

```ts
import { SpaceClient } from "openlaunch-sdk";

const space = new SpaceClient();
```

---

# 2. Client configuration

```ts
const space = new OpenLaunch({
  apiKey: process.env.LL2_API_KEY,
  nasaApiKey: process.env.NASA_API_KEY,

  cacheTtlMs: 5 * 60_000,
  retries: 3,
  retryDelayMs: 500,
  timeoutMs: 20_000,
  maxConcurrency: 4,
  minRequestIntervalMs: 0,

  onTelemetry(event) {
    console.log(event);
  },
});
```

### Main options

| Option | Purpose |
|---|---|
| `baseUrl` | Override LL2 base URL |
| `apiKey` | LL2 token |
| `nasaApiKey` | NASA API key; defaults to `DEMO_KEY` |
| `fetch` | Custom `fetch` implementation |
| `cache` | Cache adapter or `false` |
| `cacheTtlMs` | Default GET cache lifetime |
| `retries` | Number of retries after the first attempt |
| `retryDelayMs` | Base exponential-backoff delay |
| `timeoutMs` | Per-request timeout |
| `maxConcurrency` | Maximum concurrent HTTP requests |
| `minRequestIntervalMs` | Minimum spacing between requests |
| `headers` | Additional LL2 headers |
| `onTelemetry` | Request/cache/retry/error event callback |

---

# 3. Launch Library 2

OpenLaunch targets the currently supported **Launch Library 2 v2.3.0** API.

Production:

```text
https://ll.thespacedevs.com/2.3.0/
```

Development:

```text
https://lldev.thespacedevs.com/2.3.0/
```

The anonymous production LL2 service is rate-limited, so applications should cache aggressively rather than making every device repeatedly request the same launch data.

Official documentation:

```text
https://lldev.thespacedevs.com/docs
```

## Normalized high-level resources

```ts
space.launches
space.rockets
space.agencies
space.astronauts
space.events
space.pads
```

These map LL2 responses into stable OpenLaunch types.

### Upcoming launches

```ts
const launches = await space.launches.upcoming({
  limit: 20,
  isCrewed: true,
  from: new Date(),
});

for (const launch of launches.results) {
  console.log(launch.name, launch.net);
}
```

### Previous launches

```ts
const history = await space.launches.previous({ limit: 50 });
```

### Next launch

```ts
const next = await space.launches.next();
```

### Launch helpers

```ts
const countdown = space.launches.countdown(next!);
const live = space.launches.isLive(next!);
const hasVideo = space.launches.hasWebcast(next!);
```

### Search

```ts
const results = await space.launches.search("Starship");
const rockets = await space.rockets.search("Falcon 9");
const astronauts = await space.astronauts.search("Williams");
```

---

# 4. Complete LL2 surface

Not every LL2 schema needs to be manually normalized before it becomes useful. `sdk.ll2` therefore exposes every primary LL2 2.3.0 collection as a raw resource.

```ts
const spacecraft = await space.ll2.spacecraft.list({ limit: 25 });
const station = await space.ll2.spaceStations.get(4);
const landings = await space.ll2.landings.list({ ordering: "-landing__attempt" });
```

Available collections:

```text
agencies
astronauts
celestialBodies
dockingEvents
events
expeditions
landings
launches
launchers
launcherConfigurations
launcherConfigurationFamilies
locations
missionPatches
pads
payloadFlights
payloads
programs
spacecraft
spacecraftConfigurations
spacecraftConfigurationFamilies
spacecraftFlights
spaceStations
spacewalks
updates
```

Each raw collection supports:

```ts
resource.list()
resource.get(id)
resource.count()
resource.iterate()
resource.all()
resource.action()
```

Example:

```ts
for await (const payload of space.ll2.payloads.iterate({
  pageSize: 100,
  maxItems: 500,
})) {
  console.log(payload);
}
```

### Escape hatch for future endpoints

If LL2 adds an endpoint before OpenLaunch ships a new version:

```ts
const notices = space.resource("some_future_endpoint");
const page = await notices.list({ limit: 10 });
```

Or call any path directly:

```ts
const raw = await space.raw("launches/", {
  search: "Artemis",
  mode: "detailed",
});
```

This prevents provider changes from immediately blocking applications.

---

# 5. LL2 configuration/reference data

OpenLaunch exposes LL2 reference tables under `space.config`.

Examples:

```ts
const statuses = await space.config.launchStatuses.list();
const orbits = await space.config.orbits.list();
const countries = await space.config.countries.list();
```

Included tables:

```text
agencyTypes
astronautRoles
astronautStatuses
astronautTypes
celestialBodyTypes
countries
dockingLocations
eventTypes
firstStageTypes
imageLicenses
imageVariantTypes
infoUrlTypes
landingLocations
landingTypes
languages
launchStatuses
launcherStatuses
missionTypes
netPrecisions
noticeTypes
orbits
payloadTypes
programTypes
roadClosureStatuses
spacecraftConfigurationTypes
spacecraftStatuses
spaceStationStatuses
timelineEventTypes
videoUrlTypes
```

---

# 6. Fluent query builder

LL2 exposes many Django-style filters. Hardcoding every possible combination as a separate SDK method would create thousands of repetitive functions.

OpenLaunch instead exposes a fluent query engine:

```ts
import { query } from "openlaunch-sdk";

const filters = query()
  .gte("net", "2030-01-01T00:00:00Z")
  .lte("net", "2030-12-31T23:59:59Z")
  .icontains("rocket__configuration__name", "Falcon")
  .ordering("net")
  .limit(100)
  .build();

const result = await space.raw("launches/", filters);
```

Supported builder primitives:

```ts
eq()
gt()
gte()
lt()
lte()
contains()
icontains()
ids()
dateGte()
dateLte()
search()
ordering()
limit()
offset()
mode()
set()
merge()
build()
```

This design automatically supports many future LL2 filters without waiting for an SDK release.

---

# 7. Caching

The default cache is an in-memory TTL cache.

```ts
import { MemoryCache, OpenLaunch } from "openlaunch-sdk";

const space = new OpenLaunch({
  cache: new MemoryCache(5000),
  cacheTtlMs: 10 * 60_000,
});
```

Disable caching:

```ts
new OpenLaunch({ cache: false });
```

## Tiered cache

```ts
import { MemoryCache, TieredCache } from "openlaunch-sdk";

const cache = new TieredCache([
  new MemoryCache(1000),
  myPersistentCache,
]);
```

## Storage-backed cache

`JsonStorageCache` works with an AsyncStorage/local-storage-like interface:

```ts
import { JsonStorageCache } from "openlaunch-sdk";

const cache = new JsonStorageCache({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});
```

---

# 8. HTTP resilience

The HTTP layer includes:

- caching
- in-flight GET deduplication
- retry of network errors, timeouts, HTTP 5xx and HTTP 429
- exponential backoff
- random jitter
- `Retry-After` support
- request timeout
- concurrency semaphore
- optional request spacing
- circuit breaker
- telemetry hooks

Example telemetry:

```ts
const space = new OpenLaunch({
  onTelemetry(event) {
    switch (event.type) {
      case "cache-hit":
        console.log("cache", event.url);
        break;
      case "retry":
        console.warn("retry", event.attempt, event.delayMs);
        break;
      case "error":
        console.error(event.error);
        break;
    }
  },
});
```

---

# 9. NASA provider

```ts
const space = new OpenLaunch({
  nasaApiKey: process.env.NASA_API_KEY,
});
```

### Near-Earth objects

```ts
const feed = await space.nasa.neoFeed("2026-09-27", "2026-09-30");
const object = await space.nasa.neoLookup("3542519");
const page = await space.nasa.neoBrowse(0, 20);
```

### DONKI space weather

```ts
const cmes = await space.nasa.donki(
  "CME",
  "2026-09-01",
  "2026-09-27",
);
```

The same method can query other DONKI event types.

### EPIC

```ts
const natural = await space.nasa.epicNatural();
const enhanced = await space.nasa.epicEnhanced("2026-09-20");
```

### NASA technology transfer

```ts
const patents = await space.nasa.techTransfer("propulsion");
```

### APOD

NASA is transitioning APOD away from the old legacy endpoint. OpenLaunch exposes the current WordPress-backed APOD feed separately:

```ts
const apod = await space.nasa.apodCurrent({ per_page: 10 });
```

### Raw NASA access

```ts
const data = await space.nasa.raw("DONKI/FLR", {
  startDate: "2026-09-01",
  endDate: "2026-09-27",
});
```

NASA changes individual APIs independently. Treat the NASA provider as a convenience layer, not as a promise that every NASA backend has a permanent schema.

---

# 10. CelesTrak provider

CelesTrak provides General Perturbations orbital data.

OpenLaunch defaults to **OMM-style JSON** rather than assuming TLE is always sufficient.

This matters because the 5-digit NORAD catalog number space was exhausted in 2026. Modern CelesTrak JSON/CSV/XML/KVN OMM formats can represent newer catalog numbers that legacy TLE cannot.

```ts
const iss = await space.celestrak.byCatalogNumber(25544);
const stations = await space.celestrak.stations();
const active = await space.celestrak.active();
const starlink = await space.celestrak.starlink();
```

Other helpers:

```ts
space.celestrak.byInternationalDesignator("2024-149")
space.celestrak.byName("ISS")
space.celestrak.byGroup("GPS-OPS")
space.celestrak.special("DECAYING")
space.celestrak.gpsOperational()
space.celestrak.galileo()
space.celestrak.geoActive()
space.celestrak.cubesats()
space.celestrak.weather()
space.celestrak.science()
space.celestrak.first(...)
space.celestrak.supplemental(...)
```

Legacy text formats are still available when appropriate:

```ts
const tle = await space.celestrak.text(
  { catnr: 25544 },
  "TLE",
);
```

## OMM → approximate state vector

```ts
import {
  ommToOrbitalElements,
  ommToApproximateState,
} from "openlaunch-sdk";

const [record] = await space.celestrak.byCatalogNumber(25544);

if (record) {
  const elements = ommToOrbitalElements(record);
  const state = ommToApproximateState(record);
}
```

**This is two-body Keplerian conversion, not SGP4.** Do not use it for operational conjunction assessment or precise tracking. CelesTrak GP data are mean elements intended for SGP4-compatible processing.

---

# 11. Unit engine

```ts
import { convert, supportedUnits } from "openlaunch-sdk";

convert(1, "km", "m");       // 1000
convert(1, "au", "km");
convert(32, "F", "C");       // ~0
convert(7.8, "km/s", "m/s");
convert(1, "atm", "kPa");
convert(1, "kWh", "MJ");

console.log(supportedUnits("velocity"));
```

The current table includes 90+ units across:

```text
length
mass
time
velocity
acceleration
angle
temperature
pressure
energy
power
force
area
volume
frequency
data
```

A generic conversion engine provides thousands of valid same-dimension conversion paths while keeping the API small and testable.

---

# 12. Orbital mechanics

```ts
import {
  BODIES,
  circularVelocity,
  orbitalPeriod,
  escapeVelocity,
  visVivaVelocity,
} from "openlaunch-sdk";

const r = BODIES.earth.radius + 400_000;

console.log(circularVelocity(r));
console.log(orbitalPeriod(r));
console.log(escapeVelocity(r));
```

Available orbital utilities include:

- circular velocity
- escape velocity
- orbital period
- mean motion
- vis-viva
- specific orbital energy
- semi-major axis from energy
- periapsis/apoapsis radius
- eccentricity from apsides
- plane-change delta-v
- sphere of influence
- Hill sphere
- C3 / hyperbolic excess velocity
- synchronous orbit radius
- J2 nodal precession estimate
- Kepler equation solver
- anomaly conversions
- Cartesian state ↔ classical orbital elements
- two-body propagation for elliptical orbits
- line-of-sight and spherical occultation helpers
- cylindrical eclipse approximation

## State vectors

```ts
import {
  stateToOrbitalElements,
  orbitalElementsToState,
} from "openlaunch-sdk";

const state = orbitalElementsToState({
  semiMajorAxisM: 7_000_000,
  eccentricity: 0.01,
  inclinationRad: 0.9,
  raanRad: 1.2,
  argumentOfPeriapsisRad: 0.4,
  trueAnomalyRad: 2.1,
});

const elements = stateToOrbitalElements(state);
```

---

# 13. Interplanetary transfers

```ts
import {
  earthMarsHohmann,
  hohmannTransfer,
  patchedConicDeparture,
} from "openlaunch-sdk";

const mars = earthMarsHohmann();

console.log(mars.transferTimeDays);
console.log(mars.synodicPeriodDays);
console.log(mars.departurePhaseAngleDeg);
console.log(mars.earthDepartureC3M2ps2);
```

Additional transfer helpers include:

- generic Hohmann transfer
- single-revolution universal-variable Lambert solver
- Stumpff functions
- synodic period
- ideal interplanetary phase angle
- patched-conic departure estimate
- hyperbolic periapsis speed
- gravity-assist turning-angle estimate

These are excellent for architecture studies and sanity checks. They are not replacements for high-fidelity ephemerides, n-body propagation, finite-burn optimization or navigation-grade trajectory design.

---

# 14. Mars mission reference

```ts
import { marsMissionReference } from "openlaunch-sdk";

console.table(marsMissionReference());
```

The reference helper returns idealized values including:

- Hohmann transfer duration
- Earth–Mars synodic period
- departure phase angle
- Earth departure hyperbolic excess velocity
- C3
- trans-Mars injection estimate from a parking orbit
- solar flux at Mars mean orbital distance
- mean radial-distance one-way light time

This is intentionally a **reference calculation**, not an optimized Mars mission trajectory.

---

# 15. Rocket performance

```ts
import {
  rocketEquationDeltaV,
  stagedRocketDeltaV,
  thrustToWeight,
  massFlowRate,
} from "openlaunch-sdk";

const dv = rocketEquationDeltaV(
  500_000,
  120_000,
  350,
);
```

Staging:

```ts
const result = stagedRocketDeltaV([
  {
    dryMassKg: 25_000,
    propellantMassKg: 400_000,
    specificImpulseS: 330,
  },
  {
    dryMassKg: 5_000,
    propellantMassKg: 100_000,
    specificImpulseS: 370,
  },
], 20_000);
```

Includes:

- Tsiolkovsky rocket equation
- required mass ratio
- required propellant
- specific impulse ↔ effective exhaust velocity
- thrust-to-weight
- mass flow
- burn duration
- characteristic velocity
- staging
- structural coefficient
- propellant mass fraction
- payload fraction
- impulse
- acceleration

---

# 16. Atmosphere and aerodynamics

```ts
import {
  isa1976,
  dynamicPressure,
  machNumber,
  dragForce,
} from "openlaunch-sdk";

const atmosphere = isa1976(10_000);
const q = dynamicPressure(
  atmosphere.densityKgM3,
  1200,
);
```

Includes:

- simplified ISA 1976 atmosphere through the lower atmosphere
- pressure
- density
- speed of sound
- dynamic pressure
- Mach number
- drag
- ballistic coefficient
- terminal velocity
- stagnation temperature
- Reynolds number
- Sutherland viscosity

---

# 17. Geodesy and reference frames

```ts
import {
  geodeticToEcef,
  ecefToGeodetic,
  eciToEcef,
  ecefToEci,
  lookAngles,
} from "openlaunch-sdk";
```

WGS-84 helpers include:

- geodetic ↔ ECEF
- ECI ↔ ECEF using GMST
- haversine distance
- initial bearing
- destination point
- horizon distance
- Earth rotation surface velocity
- topocentric azimuth/elevation/range
- relative ECEF vectors

---

# 18. Time and astronomy

```ts
import {
  toJulianDate,
  fromJulianDate,
  gmstDegrees,
  localSiderealDegrees,
} from "openlaunch-sdk";
```

Astronomy helpers include:

- angular diameter
- blackbody luminosity
- inverse-square flux
- distance modulus
- apparent magnitude
- magnitude/flux ratio
- Wien peak wavelength

---

# 19. Vectors, matrices and quaternions

Vectors:

```ts
import {
  add3,
  sub3,
  dot3,
  cross3,
  norm3,
  normalize3,
  angle3,
} from "openlaunch-sdk";
```

Matrices:

```ts
import {
  matrixMul,
  inverse,
  determinant,
  solveLinear,
} from "openlaunch-sdk";
```

Attitude/quaternions:

```ts
import {
  quatFromAxisAngle,
  quatRotateVector,
  quatFromEuler,
  quatToEuler,
  quatSlerp,
} from "openlaunch-sdk";
```

---

# 20. Navigation and control

## Linear Kalman filter

```ts
import {
  LinearKalmanFilter,
  identity,
} from "openlaunch-sdk";

const filter = new LinearKalmanFilter(
  [0, 1],
  identity(2),
);

filter.predict(
  [[1, 1], [0, 1]],
  [[0.01, 0], [0, 0.01]],
);

const estimate = filter.update(
  [1.2],
  [[1, 0]],
  [[0.1]],
);
```

Other helpers:

- complementary filter
- low-pass filter
- high-pass filter
- PID controller
- first-order filter coefficient

Again, these are general mathematical components, not a certified GNC stack.

---

# 21. Communications

```ts
import {
  lightTimeSeconds,
  freeSpacePathLossDb,
  antennaGainDb,
  linkMarginDb,
  dopplerShiftHz,
} from "openlaunch-sdk";
```

Includes:

- wavelength
- one-way light time
- round-trip light time
- free-space path loss
- dish gain
- EIRP
- thermal noise
- dB/linear conversion
- Shannon capacity
- Doppler shift
- basic link-margin calculation

---

# 22. Thermal

```ts
import {
  solarFluxAtDistance,
  radiativeEquilibriumTemperature,
  blackbodyRadiativePower,
} from "openlaunch-sdk";
```

Includes:

- Stefan–Boltzmann radiation
- equilibrium temperature
- solar flux vs heliocentric distance
- conduction
- absorbed solar power
- thermal capacity/energy

---

# 23. Electrical power

```ts
import {
  solarArrayPower,
  requiredSolarArea,
  batteryEnergyWh,
  requiredBatteryWh,
} from "openlaunch-sdk";
```

Includes solar array sizing, battery energy/runtime and joule/Wh conversion.

---

# 24. Structures

Utilities include:

- axial stress
- axial strain
- axial elongation
- thin-wall hoop stress
- thin-wall longitudinal stress
- Euler buckling
- second moment of area for common sections
- factor of safety

Example:

```ts
import { thinWallHoopStressPa } from "openlaunch-sdk";

const stress = thinWallHoopStressPa(
  300_000,
  2,
  0.005,
);
```

---

# 25. Entry, descent and landing

```ts
import {
  parachuteAreaM2,
  suttonGravesHeatFluxWm2,
  ballisticCoefficientKgM2,
} from "openlaunch-sdk";
```

Includes first-order helpers for:

- parachute sizing
- parachute diameter
- Sutton–Graves-style convective heating estimate
- deceleration in g
- ballistic coefficient
- kinetic energy

EDL is highly nonlinear and environment-dependent; these helpers are for estimation and trade studies.

---

# 26. Propellant and tanks

```ts
import {
  boiloffMassKg,
  mixtureComponentMasses,
  tankVolumeM3,
} from "openlaunch-sdk";
```

Includes:

- simple fractional boiloff
- remaining mass after boiloff
- oxidizer/fuel split
- tank volume estimate
- ideal-gas pressurant moles

---

# 27. Reliability

```ts
import {
  exponentialReliability,
  seriesReliability,
  parallelReliability,
  kOfNReliability,
} from "openlaunch-sdk";
```

Includes:

- constant-hazard exponential reliability
- MTBF ↔ failure rate
- series systems
- parallel redundancy
- k-of-n redundancy
- steady-state availability

---

# 28. Statistics and Monte Carlo

```ts
import {
  mean,
  stddev,
  percentile,
  linearRegression,
  monteCarloScalar,
} from "openlaunch-sdk";
```

Example:

```ts
const analysis = monteCarloScalar(10_000, () => {
  const isp = 350 + (Math.random() - 0.5) * 10;
  return isp;
});

console.log(analysis.p05, analysis.p50, analysis.p95);
```

---

# 29. Numerical methods

```ts
import {
  bisection,
  newtonRaphson,
  integrateSimpson,
  rk4,
} from "openlaunch-sdk";
```

Includes:

- clamp/remap/interpolation
- bisection root finder
- Newton–Raphson
- central finite derivative
- trapezoid integration
- Simpson integration
- generic fourth-order Runge–Kutta step

---

# 30. Crew and life-support estimates

```ts
import { consumablesForMission } from "openlaunch-sdk";

const supplies = consumablesForMission(
  4,
  900,
  {
    waterRecovery: 0.9,
    oxygenRecovery: 0.7,
  },
  0.2,
);
```

Also includes CO₂ production, metabolic heat and ideal-gas cabin oxygen mass estimates.

These are planning helpers with configurable rates, not life-support certification models.

---

# 31. Data systems

```ts
import {
  dailyDataBudget,
  downlinkBalance,
  transmissionTimeSeconds,
} from "openlaunch-sdk";
```

Useful for early spacecraft data-volume studies.

---

# 32. Radiation utilities

First-order utilities include:

- accumulated dose from a constant rate
- exponential shielding transmission
- inverse-square dose scaling
- Poisson single-event probability

Radiation environments require dedicated models and mission-specific datasets for serious analysis.

---

# 33. Runtime support

OpenLaunch is designed to avoid Node-only runtime APIs in the library core.

Target environments include:

- Node.js 18+
- Bun
- Deno-compatible bundlers/runtimes
- modern browsers
- React Native environments with `fetch`
- Expo
- Cloudflare Workers
- other Fetch API runtimes

The repository generates both:

```text
dist/      ESM + declarations
dist-cjs/  CommonJS
```

---

# 34. Testing

Full local validation:

```bash
npm run check
```

This performs:

```text
TypeScript strict typecheck
ESM build
CommonJS build
unit tests
```

Package inspection:

```bash
npm pack --dry-run
```

Live network smoke test:

```bash
npm run test:live
```

The live test touches external services and therefore should **not** be used as the default CI test.

---

# 35. GitHub Actions

The repository includes:

```text
.github/workflows/ci.yml
```

It tests Node.js:

```text
18
20
22
```

and runs:

```bash
npm install --no-audit --no-fund
npm run check
npm pack --dry-run
```

This is intentionally a Node/TypeScript workflow. It does not install Python, ffmpeg or unrelated project dependencies.

---

# 36. Development API vs production API

For LL2 development/testing, use:

```ts
import {
  OpenLaunch,
  DEVELOPMENT_BASE_URL,
} from "openlaunch-sdk";

const space = new OpenLaunch({
  baseUrl: DEVELOPMENT_BASE_URL,
});
```

The development service is useful for integration work because production anonymous requests are limited. Development data can be stale or incomplete, so final product behavior should also be checked against production responsibly.

---

# 37. Error handling

```ts
import {
  HttpError,
  RateLimitError,
  TimeoutError,
  CircuitOpenError,
  ParseError,
  ValidationError,
} from "openlaunch-sdk";
```

Example:

```ts
try {
  await space.launches.next();
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(error.retryAfterSeconds);
  }
}
```

---

# 38. Design philosophy

## Stable models over provider leakage

Application code should ideally consume:

```ts
Launch
Rocket
Agency
Astronaut
LaunchPad
SpaceEvent
```

rather than depend everywhere on provider-specific nested JSON.

## Raw access where normalization adds little value

Normalizing every provider object immediately creates a large maintenance burden and can hide newly added fields. OpenLaunch therefore keeps both layers:

```text
normalized high-level SDK
+
complete raw provider surface
```

## Generic engines over thousands of aliases

Examples:

```ts
convert(value, from, to)
query().gte(...).icontains(...)
resource.iterate(...)
rk4(...)
```

This gives more expressive power than thousands of narrow one-off wrappers.

## Zero runtime dependencies

Fewer runtime dependencies means:

- smaller supply-chain surface
- easier browser/worker support
- smaller install footprint
- simpler long-term maintenance

The downside is that OpenLaunch implements more mathematical primitives itself, which makes independent validation especially important for critical applications.

---

# 39. Accuracy tiers

Not all functions in a space SDK have the same fidelity. Treat the library in layers:

### Data access — provider fidelity

LL2/NASA/CelesTrak data are only as accurate and current as the upstream provider.

### Deterministic engineering helpers — analytical

Examples:

```text
rocket equation
unit conversion
link budget
WGS-84 conversion
matrix operations
```

These are deterministic analytical calculations and are covered by tests.

### First-order mission models — architecture studies

Examples:

```text
Hohmann transfers
patched-conic departure
ISA atmosphere
Sutton-Graves estimate
life-support consumables
```

These are useful for trade studies and sanity checks.

### Not included as validated high-fidelity flight models

OpenLaunch v0.5.0 does not claim to provide validated implementations of:

```text
SGP4/SDP4 propagation
SPICE kernels / JPL ephemerides
high-order geopotential propagation
n-body numerical ephemerides
atmospheric density models such as NRLMSISE-00
precision conjunction assessment
6-DOF launch vehicle simulation
GN&C flight software
fault protection flight software
CFD
FEA
certified EDL simulation
```

Those belong in dedicated, validated packages or mission analysis environments. OpenLaunch can integrate with them later without pretending a simplistic formula is equivalent.

---

# 40. Security and operational guidance

- Do not embed paid/private API keys in public browser bundles.
- Cache public API results.
- Respect upstream service rate limits and usage policies.
- Do not poll CelesTrak datasets more frequently than they are updated.
- Prefer current OMM formats over legacy TLE when catalog-number limitations matter.
- Validate all external data before feeding autonomous systems.
- Pin SDK versions for production.
- Keep mission constants/configuration under version control.
- Record provenance, timestamps and provider IDs when data are used in engineering decisions.

---

# 41. Repository structure

```text
openlaunch-sdk/
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
├── examples/
├── scripts/
├── src/
│   ├── client.ts
│   ├── cache.ts
│   ├── errors.ts
│   ├── http.ts
│   ├── mappers.ts
│   ├── query.ts
│   ├── types.ts
│   ├── utils.ts
│   ├── providers/
│   │   ├── ll2.ts
│   │   ├── nasa.ts
│   │   └── celestrak.ts
│   ├── resources/
│   └── science/
│       ├── astronomy.ts
│       ├── atmosphere.ts
│       ├── communications.ts
│       ├── constants.ts
│       ├── control.ts
│       ├── data.ts
│       ├── edl.ts
│       ├── geodesy.ts
│       ├── life-support.ts
│       ├── matrix.ts
│       ├── mission.ts
│       ├── navigation.ts
│       ├── numerics.ts
│       ├── orbits.ts
│       ├── power.ts
│       ├── propellant.ts
│       ├── quaternion.ts
│       ├── radiation.ts
│       ├── reliability.ts
│       ├── rocket.ts
│       ├── statistics.ts
│       ├── structures.ts
│       ├── thermal.ts
│       ├── time.ts
│       ├── transfers.ts
│       ├── units.ts
│       └── vector.ts
└── tests/
```

---

# 42. Roadmap

The architecture is intentionally ready for significantly deeper mission-analysis tooling.

High-value future additions:

1. validated SGP4 package integration instead of reimplementing it casually
2. SPICE/JPL ephemeris provider adapter
3. multi-revolution Lambert extensions and branch selection
4. universal-variable n-body propagator
5. event detection for apoapsis, periapsis, node crossings and eclipses
6. ground-track generation
7. access-window scheduling
8. covariance propagation
9. conjunction screening adapters
10. CCSDS OEM/OMM/OPM/TDM parsing
11. maneuver timeline model
12. spacecraft subsystem budgets
13. high-fidelity solar-array/eclipse energy simulation
14. atmospheric model adapters
15. mission configuration snapshots and provenance
16. schema validation for provider responses
17. worker-safe persistent cache adapters
18. Redis/KV/D1 cache packages
19. Python SDK generated from a shared schema
20. automatic API reference generation

The target should be **more verified capability**, not just a larger function count.

---

# 43. Upstream services

OpenLaunch is not affiliated with these providers.

### The Space Devs / Launch Library 2

```text
https://thespacedevs.com/
https://lldev.thespacedevs.com/docs
```

### NASA Open APIs

```text
https://api.nasa.gov/
```

### CelesTrak

```text
https://celestrak.org/
https://celestrak.org/NORAD/documentation/gp-data-formats.php
```

Review each provider's current documentation and usage policy before production deployment.

---

# 44. License

MIT.

You can use, modify and distribute OpenLaunch under the terms in `LICENSE`.

---

## Minimal Mars-flavored example

```ts
import {
  OpenLaunch,
  BODIES,
  marsMissionReference,
  patchedConicDeparture,
  solarFluxAtDistance,
  consumablesForMission,
  linkMarginDb,
} from "openlaunch-sdk";

const space = new OpenLaunch();

// Real-world launch data
const nextLaunch = await space.launches.next();

// Idealized interplanetary architecture reference
const mars = marsMissionReference(200_000);

// Crew consumables for a conceptual 900-day mission
const consumables = consumablesForMission(
  4,
  900,
  { waterRecovery: 0.9, oxygenRecovery: 0.7 },
  0.2,
);

// Mean solar flux near Mars
const marsSolarFlux = solarFluxAtDistance(
  BODIES.mars.semiMajorAxis!,
);

console.log({
  nextLaunch: nextLaunch?.name,
  mars,
  consumables,
  marsSolarFlux,
});
```

That example captures the intended direction of the project: **one library that connects live spaceflight information with reusable engineering tools while keeping provider access, numerical methods and mission assumptions explicit.**
