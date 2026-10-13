# OpenLaunch v0.8: Launch Trajectory Engine

## Scope

OpenLaunch v0.8 introduces a generic, physics-based **3-degree-of-freedom (3DOF) point-mass** launch trajectory simulator, not a provider-specific flight plan. It accepts launch-site geometry, a complete staged vehicle mass/propulsion budget, and a time-tagged pitch/heading/throttle guidance program.

It produces time-tagged modeled position/velocity states, performance and atmosphere telemetry, discrete flight events, repeatable Monte Carlo dispersion envelopes and first-order comparisons to the SGP4/SDP4 satellite catalog from v0.7.

**It does not know an actual launch trajectory from a launch time alone.** Launch schedules generally omit guidance, target RAAN, stage loading, performance, closed-loop corrections and dispersions. Do not use this package to make operational collision-avoidance, launch-clearance, human safety or flight-termination decisions.

## Physics and reference frames

The integration state is `r(t), v(t), m(t)` in SI units. RK4 integrates

```text
dr/dt = v
dv/dt = gravity(r) + thrust(t,r,m)/m + drag(r,v,m)/m
dm/dt = -thrust(t,r)/(Isp(t,r) * g0)
```

Force model:
- central Earth gravity (`mu = 3.986004418e14 m3/s2`);
- optional first-order zonal `J2` acceleration in a quasi-inertial equatorial frame;
- Earth initial ground rotational speed `omega x r` included at launch;
- aerodynamic velocity relative to a co-rotating atmosphere `v - omega x r`;
- ISA-1976 atmosphere through 84.852 km;
- **simplified** exponential extrapolation to 200 km; no winds, density assimilation or space weather;
- `Cd * A` quadratic drag;
- sea-level to vacuum thrust and specific-impulse interpolation using local pressure;
- mass flow from `thrust / (Isp * g0)`;
- commanded ENU pitch and azimuth rotated with Earth's GMST into the integration frame.

The integration frame uses a **GMST-only, TEME-aligned approximation** to interoperate with v0.7 catalog states. It is explicitly `TEME-approx-GMST`, **not** a rigorous TEME/ITRF/GCRF conversion. No UT1-UTC, Earth orientation parameters, polar motion or advanced precession/nutation chain are included.

Model evaluation is research-grade and should be independently compared with a validated trajectory solver before quantitative real-world use.

## Vehicle input

```ts
import { OpenLaunch } from "openlaunch-sdk";

const space = new OpenLaunch();

const model = {
  liftoff: new Date("2026-10-13T12:00:00Z"),
  site: { latitudeDeg: 28.56, longitudeDeg: -80.58, altitudeM: 3 },
  durationSeconds: 160,
  stepSeconds: 1,
  enableJ2: true,
  guidance: [
    { timeSeconds: 0, pitchDeg: 90, headingDeg: 90, throttle: 1 },
    { timeSeconds: 30, pitchDeg: 85, headingDeg: 90, throttle: 1 },
    { timeSeconds: 100, pitchDeg: 55, headingDeg: 90, throttle: 1 },
    { timeSeconds: 160, pitchDeg: 30, headingDeg: 90, throttle: 0.9 },
  ],
  vehicle: {
    name: "Generic two-stage demonstrator (NOT any real launch vehicle)",
    payloadMassKg: 100,
    fairingMassKg: 30,
    fairingJettisonSeconds: 25,
    referenceAreaM2: 2,
    dragCoefficient: 0.25,
    stages: [
      {
        name: "Stage 1",
        dryMassKg: 1000,
        propellantMassKg: 5000,
        thrustSeaLevelN: 300000,
        thrustVacuumN: 330000,
        ispSeaLevelS: 250,
        ispVacuumS: 280,
        coastAfterSeparationSeconds: 3,
      },
      {
        name: "Stage 2",
        dryMassKg: 300,
        propellantMassKg: 1000,
        thrustSeaLevelN: 60000,
        thrustVacuumN: 65000,
        ispSeaLevelS: 280,
        ispVacuumS: 310,
      },
    ],
  },
} as const;

const result = space.trajectory.simulate(model);
console.log(result.events);
console.log(result.maxQPa);
console.log(result.maxAltitudeKm);
console.log(result.trajectory[0]);
```

For a TypeScript variable passed to `simulate()`, use `LaunchModel` or `satisfies LaunchModel` to validate input without losing precision. Arrays of stages and guidance knots are ordered. Do not assume the example thrust, Isp or mass values describe Falcon 9, Starship or any particular vehicle.

### Guidance

- `pitchDeg`: commanded thrust vector angle **above local horizontal**; 90° straight up;
- `headingDeg`: compass heading clockwise from true north; 90° approximately east;
- `throttle`: normalized thrust multiplier from 0 to 1;
- guidance is linearly interpolated between knots;
- heading interpolation takes the shortest wrapped route;
- guidance is an input program, **not** an optimizer or closed-loop controller.

### Staging and mass continuity

At liftoff the wet mass is the sum of all dry masses, propellant, payload and fairing.

During a stage burn, fuel consumption is obtained from mass flow; after burnout the dry mass of an exhausted **nonfinal** stage is dropped. The next stage ignition can be delayed by `coastAfterSeparationSeconds`. The last upper-stage dry mass remains with the payload after its cutoff. Fairing jettison drops its mass instantaneously at the configured time.

RK4 steps are shortened at guidance knots, staging-related fuel exhaustion estimates, coast boundaries and the fairing event. This is a finite-step model; exact event timing, max-Q and ground impact are numerical approximations that depend on step size.

The simulator stops at the configured duration, optional burnout termination or a simple ground-intersection test. Ground impact is approximated against launch-site altitude; there is no terrain model.

### Telemetry and events

The result includes:
- UTC timestamp and elapsed seconds;
- TEME-approx position (km) and velocity (km/s);
- WGS84-like geodetic position and altitude;
- remaining stage propellant, vehicle mass and stage index;
- gravity, thrust, drag, resultant acceleration;
- inertial speed and atmospheric-relative speed;
- dynamic pressure `q = 0.5 rho v²`, Mach and radial vertical speed;
- liftoff, engine ignition/cutoff, stage separation, fairing release, max-Q and simulation end.

The `maxQPa` value is the maximum **sampled** dynamic pressure; it is not necessarily the continuous-time peak.

## Space traffic interoperability

v0.7 supplies `SampledTemeTrajectory` and numerical nearest-approach screening against catalog orbit states. v0.8 connects the simulator to that pathway:

```ts
const satellite = await space.orbit.byCatalogNumber(25544);
if (!satellite) throw new Error("Satellite not found");

const result = space.trajectory.screenSatellites(
  model,
  [satellite],
  { thresholdKm: 100, maxResults: 20 },
);

console.table(result.approaches);
console.log(result.warning);
```

The inputs must represent the **same physical epoch**. Historical public TLEs cannot be used for a future launch without extreme propagated-element staleness. A geometric modeled miss distance is **not** a collision probability or an operational clearance. The current trajectory-to-satellite screen can miss brief encounters if source trajectory samples are too sparse; check numerical convergence and independently validate ephemerides.

At present, supplying a well-defined vehicle, guidance and launch date is mandatory. A Launch Library 2 record is not a flight plan. Explicit mission parameters should never be silently invented by OpenLaunch.

## Monte Carlo uncertainty

```ts
const ensemble = space.trajectory.monteCarlo(model, {
  runs: 30,
  seed: 202608,
  thrustSigmaFraction: 0.01,
  ispSigmaFraction: 0.005,
  dragSigmaFraction: 0.08,
  pitchSigmaDeg: 0.25,
  headingSigmaDeg: 0.15,
});

console.log(ensemble.dispersion);
```

The seeded ensemble perturbs model inputs with Gaussian draws and computes position dispersion versus the nominal path at fixed UTC times. It reports minimum, median, p95 and maximum **deviation magnitude**, not a certified containment corridor, collision probability or state covariance.

For production analysis, the perturbation distributions, their correlations, model discrepancy, atmospheric winds, maneuver uncertainty and sampling adequacy must be characterized from real evidence. Low-run percentiles are especially noisy.

`maxRuns` defaults to 200 to cap accidental CPU consumption.

## Cesium 3D visualization

```ts
import { launchToCzml } from "openlaunch-sdk";

const czml = launchToCzml(result, { includeEvents: true });
```

This generates sampled Earth-fixed Cartesian positions, a time interval and markers for flight events. It can be used with Cesium for **visualization**. Interpolating sparsely spaced samples with a smooth curve does not add physical fidelity.

## Live data and next steps

v0.8 remains usable offline: the demo `npm run example:launch` is deterministic and requires no keys or network. It includes a historical TLE from 2019 to exercise a matching-epoch satellite screen. For real catalog analysis, fetch fresh OMM/TLE through `space.orbit` separately and ensure the modeled launch epoch is consistent.

Run:

```bash
npm ci
npm run check
npm run example:launch
npm run example:launch -- --czml
```

The last command writes `launch-demo.czml` to the current directory.

Not yet implemented:
- stage-specific flight control (TVC), aerodynamic attitude and 6DOF;
- closed-loop targeting of altitude, inclination, RAAN or orbit insertion state;
- throttle to max-Q/axial g constraints and booster recovery;
- calibrated atmosphere/winds, Earth orientation parameters and numerical state covariance;
- verified actual launches/flight tracks, range safety and mission specific launch corridor.

These are deliberate boundaries, not hidden assumptions.
