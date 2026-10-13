import { simulateLaunch } from "../../src/index.js";
import { genericLaunchModel } from "./00-model.js";

for (const pitchOffsetDeg of [-4, 0, 4]) {
  const model = {
    ...genericLaunchModel,
    guidance: genericLaunchModel.guidance.map(knot => ({
      ...knot,
      pitchDeg: Math.max(-90, Math.min(90, knot.pitchDeg + pitchOffsetDeg)),
    })),
  };
  const result = simulateLaunch(model);
  console.log({
    pitchOffsetDeg,
    maxAltitudeKm: result.maxAltitudeKm,
    finalMassKg: result.finalMassKg,
    termination: result.termination,
  });
}
