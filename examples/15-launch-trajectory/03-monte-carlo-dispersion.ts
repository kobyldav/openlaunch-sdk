import { OpenLaunch } from "../../src/index.js";
import { genericLaunchModel } from "./00-model.js";

const study = new OpenLaunch().trajectory.monteCarlo(genericLaunchModel, {
  runs: 30,
  seed: 202608,
  thrustSigmaFraction: 0.01,
  ispSigmaFraction: 0.005,
  dragSigmaFraction: 0.08,
  pitchSigmaDeg: 0.25,
  headingSigmaDeg: 0.15,
});
console.log(study.successfulRuns, study.failedRuns);
console.table(study.dispersion.filter((_, index) => index % 10 === 0));
