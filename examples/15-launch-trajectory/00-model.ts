import type { LaunchModel } from "../../src/index.js";

/** An illustrative engineering case, NOT Falcon 9 or any real vehicle. */
export const genericLaunchModel = {
  liftoff: new Date("2019-06-05T12:00:00Z"),
  site: {
    name: "Generic eastward launch pad",
    latitudeDeg: 28.56,
    longitudeDeg: -80.58,
    altitudeM: 3,
  },
  durationSeconds: 170,
  stepSeconds: 1,
  guidance: [
    { timeSeconds: 0, pitchDeg: 90, headingDeg: 90, throttle: 1 },
    { timeSeconds: 20, pitchDeg: 85, headingDeg: 90, throttle: 1 },
    { timeSeconds: 80, pitchDeg: 50, headingDeg: 90, throttle: 1 },
    { timeSeconds: 170, pitchDeg: 15, headingDeg: 90, throttle: 0.9 },
  ],
  vehicle: {
    name: "Generic two-stage test vehicle",
    payloadMassKg: 100,
    fairingMassKg: 30,
    fairingJettisonSeconds: 25,
    dragCoefficient: 0.25,
    referenceAreaM2: 2,
    stages: [
      {
        name: "Booster", dryMassKg: 1000, propellantMassKg: 5000,
        thrustSeaLevelN: 300_000, thrustVacuumN: 330_000,
        ispSeaLevelS: 250, ispVacuumS: 280,
        coastAfterSeparationSeconds: 3,
      },
      {
        name: "Upper stage", dryMassKg: 300, propellantMassKg: 1000,
        thrustSeaLevelN: 60_000, thrustVacuumN: 65_000,
        ispSeaLevelS: 280, ispVacuumS: 310,
      },
    ],
  },
} satisfies LaunchModel;
