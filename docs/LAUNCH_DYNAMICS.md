# Launch Dynamics v0.8 — 3DOF Ascent & Satellite Traffic

v0.8 implements a **numerical, preliminary point-mass launch simulator**. It is not a flight-qualified ascent simulator and **does not reconstruct SpaceX/Falcon trajectories from launch metadata**.

## What actually exists

- time-based 3DOF launch dynamics in rotating Earth-fixed Cartesian coordinates (ECEF)
- WGS84 launch-site position, local ENU pitch/azimuth control, linearly interpolated throttle
- fixed-step, fourth-order Runge–Kutta integration (RK4) with additional steps at known events
- pressure-dependent thrust and specific impulse, continuous propellant depletion
- multiple stages, dry-mass separation, user-specified staging coast and fairing jettison
- central gravity or central + J2 zonal perturbation
- ISA atmospheric pressure/density/speed of sound, exponentially extended above 84,852 m
- pressure-based engine interpolation, optional uniform ENU wind, quadratic drag, Mach and dynamic pressure
- timestamped 3D states, mass, diagnostics, max-Q sample, burnout/staging/ignition events
- two-body osculating orbit diagnostics (periapsis/apoapsis altitude, eccentricity, inclination)
- strict LL2 pad-time adapter **that requires vehicle/guidance supplied separately**
- approximate ECEF -> TEME-like positions/velocities and integration with v0.7 `SampledTemeTrajectory`
- direct Cesium CZML (ECEF FIXED) and GeoJSON ground-track export

## Coordinate frames and governing equations

Integration state: Earth-fixed `r_ECEF, v_ECEF` in meters and meters/second, with separate remaining current-stage propellant in kg.

In rotating coordinates (angular velocity vector `omega`):

```text
dr/dt = v

dv/dt = g(r) + thrust/m + drag/m - 2 (omega x v)
        - omega x (omega x r)

dm_prop/dt = -throttle * thrust / (Isp * g0)
```

The initial vehicle is stationary in ECEF at the WGS84 launch pad. Earth rotation is automatically included in the inertialized velocity.

### Gravity

The base model uses a point-mass Earth with `mu = 3.986004418e14 m^3/s^2`. Set `environment.useJ2=true` to include Earth's first oblateness correction. J2 is not a high-order gravity model and does not substitute for a detailed geopotential.

### Thrust & mass flow

Sea-level and vacuum thrust/ISP are interpolated from local modeled atmospheric pressure, and a piecewise-linear user-supplied throttle scales both thrust and propellant flow.

```text
massFlow = throttle * thrust(P) / (Isp(P) * g0)
```

The active stage fuel declines continuously. Upper stages still contribute full dry/propellant mass until they ignite. The depleted stage's dry mass stays attached until stage separation; at separation it is removed from the integrated vehicle mass. Fairing mass is removed at the explicitly configured jettison time.

Stage coast delays are supported. Complex coast phases, multiple burns/restarts of the same stage, booster landings and parallel booster staging are not modeled in v0.8.

### Atmosphere & wind

Below 84.852 km, density and speed of sound are derived from the project's ISA implementation. Above that the density follows an exponential tail controlled by `upperAtmosphereScaleHeightM`.

Wind is an optional **constant local ENU vector at all altitudes**. This is deliberately simple; v0.8 does not ingest radiosondes, meteorological wind profiles or large-scale weather models for ascent.

Air relative velocity is ECEF velocity minus wind vector. Drag opposes air relative motion:

```text
F_drag = -0.5 * rho * C_D * A * |v_air| * v_air
```

`referenceAreaM2` and `dragCoefficient` are fixed for the vehicle in v0.8; there is no Mach/AoA-dependent `C_D` table.

### Guidance

`guidance.program` is an array of time-ordered points:

```ts
[
  { tSeconds: 0, elevationDeg: 90, azimuthDeg: 90, throttle: 1 },
  { tSeconds: 70, elevationDeg: 75, azimuthDeg: 90, throttle: 1 },
  { tSeconds: 180, elevationDeg: 35, azimuthDeg: 90, throttle: 1 },
]
```

- `elevationDeg=90`: straight up along the local ellipsoidal vertical
- `elevationDeg=0`: horizontal tangent
- `azimuthDeg=0`: local north
- `azimuthDeg=90`: local east
- `throttle`: 0 to 1

Control inputs are interpolated against **time since liftoff**. This is a simplified thrust-direction program, not a closed-loop guidance law, optimal gravity turn or GNC implementation.

## Public API

```ts
import { OpenLaunch } from "openlaunch-sdk";

const sdk = new OpenLaunch();

const simulation = sdk.dynamics.simulate({
  liftoff: new Date("2026-10-12T12:00:00Z"),
  site: {
    latitudeDeg: 28.5,
    longitudeDeg: -80.5,
    altitudeM: 3,
  },
  vehicle: {
    name: "My user-defined test vehicle",
    payloadMassKg: 2500,
    referenceAreaM2: 11,
    dragCoefficient: 0.33,
    fairingMassKg: 1200,
    fairingJettisonAtSeconds: 200,
    stages: [
      {
        name: "booster",
        dryMassKg: 24000,
        propellantMassKg: 285000,
        thrustSeaLevelN: 5000000,
        thrustVacuumN: 5550000,
        ispSeaLevelS: 292,
        ispVacuumS: 322,
        coastAfterBurnSeconds: 5,
      },
      {
        name: "upper stage",
        dryMassKg: 4300,
        propellantMassKg: 71000,
        thrustSeaLevelN: 720000,
        thrustVacuumN: 820000,
        ispSeaLevelS: 310,
        ispVacuumS: 348,
      },
    ],
  },
  guidance: {
    program: [
      { tSeconds: 0, elevationDeg: 90, azimuthDeg: 90 },
      { tSeconds: 60, elevationDeg: 80, azimuthDeg: 90 },
      { tSeconds: 180, elevationDeg: 40, azimuthDeg: 90 },
      { tSeconds: 500, elevationDeg: 5, azimuthDeg: 90 },
    ],
  },
  durationSeconds: 570,
  stepSeconds: 1,
  environment: {
    useJ2: true,
    windEastMps: 3,
    windNorthMps: -2,
  },
});

console.log(simulation.summary);
console.log(simulation.events);
console.log(simulation.samples);
```

The sample list includes position, velocity, mass, altitude, Mach, dynamic pressure, g-load-like proper acceleration, thrust, stage and remaining propellant. The `summary.finalOrbit` field is a two-body end-state diagnostic; a positive apogee alone does not mean a sustained stable orbit. A periapsis below Earth's surface means suborbital geometry.

## First-order orbital inclination / launch azimuth

v0.8 includes a preliminary heading solver for a **specified target orbital inclination** at a given launch site and assumed local horizontal velocity.

```ts
const solutions = candidateLaunchAzimuths({
  site,
  inclinationDeg: 53,
  horizontalSpeedMps: 7600,
});
```

The solver computes inertial angular momentum from WGS84 launch-pad position, a tangent-plane horizontal velocity at each candidate heading, and Earth's rotational surface velocity. It searches possible headings numerically and returns northbound and southbound branches where available. Inclinations inaccessible from the specified pad/assumed horizontal-speed model return an empty list.

**Important:** this is *not* a launch trajectory optimization or an actual Falcon 9 launch azimuth. It does not target RAAN, perform a gravity turn, account for orbital insertion latitude, Earth rotation drift during flight, range-safety geography, doglegs or time-varying vehicle performance. It is only an initial geometry feasibility tool.

## Linking LL2

LL2's normalized launch object includes name, time (`net`) and usually launch pad latitude/longitude. It does **not** provide an authoritative thrust schedule, mass depletion, target orbit, ascent profile or published telemetry.

```ts
const launch = await sdk.launches.next();
if (launch) {
  const result = sdk.dynamics.fromLaunch({
    launch,
    vehicle: userSuppliedVehicle,
    guidance: userSuppliedGuidance,
    durationSeconds: 600,
  });
}
```

`fromLaunch()` refuses absent/non-numeric pad coordinates. It only maps LL2 pad/time into the input; it does not infer rocket engineering parameters from the launch name or vehicle label. Pad altitude is assumed zero if LL2 has no altitude.

Do not label the resulting trajectory "actual SpaceX flight path" without independent, verified flight profile data.

## Cross-engine space traffic

```ts
const trajectory = simulation.toTrajectory();
const objects = await sdk.orbit.group("STATIONS", 100);

const closest = sdk.traffic.screenTrajectory(
  trajectory,
  objects,
  500,   // modeled threshold km
  10,    // max results
);
```

The v0.8 rocket state is integrated in ECEF, then rotated into an approximate inertial/TEME-like state using GMST and Earth's rotation velocity. The v0.7 catalog propagator returns SGP4 TEME states.

**This is only an exploratory compatibility bridge** — v0.8 does not yet implement precision IERS Earth orientation, calibrated navigation states, uncertainty tubes or operational conjunction probability. Numerically precise miss distances calculated from illustrative launch inputs and public GP elements are not certified hazard/clearance results. `toTrajectory()` uses cubic-Hermite interpolation between the generated samples.

A true operational workflow needs: authoritative rocket trajectory telemetry/predicted ephemerides; current catalog GP elements or precision ephemerides; reference-frame/time-scale validation; covariance, dispersion and maneuver models; quality-of-service/performance and independent verification.

## Cesium and GIS

```ts
import { launchToCzml, launchGroundTrackGeoJson } from "openlaunch-sdk";

const czml = launchToCzml(simulation);
const groundTrack = launchGroundTrackGeoJson(simulation);
```

CZML uses `FIXED` Earth-fixed positions, meters and UTC epoch offsets. It is not necessary to convert through TEME for map visualization. GeoJSON contains WGS84 lon/lat and height, but the v0.8 line does not yet split at the antimeridian.

## Precision & validation

**In scope**: RK4 3DOF point-mass ascent, external force budgets, staged mass flow, event chronology, approximate satellite encounter *exploration*.

**Out of scope**: 6DOF rigid-body dynamics, attitude quaternion integration, mass moments of inertia, aerodynamic stability, detailed engine curves, nozzle dynamics, finite stage separation forces, stage recovery, aerodynamic heating, high-fidelity winds/weather, verified operational target trajectories, live launch state estimation, precision frame chaining, IERS EOP, rigorous Monte Carlo uncertainty corridor, covariance/CdM/Pc, collision avoidance and flight-qualified use.

Numerical accuracy depends on timestep and input fidelity. The fixed RK4 integrator must be checked by decreasing `stepSeconds`. Stage events and guidance knots are explicitly segmented, but the RK4 solution does not provide embedded local error estimates. v0.9 may add adaptive step integration and dispersion modeling.

For tests, run:

```bash
npm run check
npm run example:launch
OPENLAUNCH_LIVE=1 npm run example:launch
```

The last command makes public API calls and can fail due to network/rate limits.

See `examples/15-launch-dynamics/` for self-contained, typechecked examples.
