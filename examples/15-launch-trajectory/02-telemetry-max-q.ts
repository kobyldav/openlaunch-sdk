import { OpenLaunch } from "../../src/index.js";
import { genericLaunchModel } from "./00-model.js";

const result = new OpenLaunch().trajectory.simulate(genericLaunchModel);
const maxQ = result.telemetry.reduce((best, sample) =>
  sample.dynamicPressurePa > best.dynamicPressurePa ? sample : best,
);
console.log({
  maxQTime: maxQ.time.toISOString(),
  maxQkPa: maxQ.dynamicPressurePa / 1_000,
  mach: maxQ.mach,
  altitudeKm: maxQ.altitudeKm,
  thrustN: maxQ.thrustN,
  dragN: maxQ.dragN,
});
