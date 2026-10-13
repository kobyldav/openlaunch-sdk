import { OpenLaunch } from "../../src/index.js";
import { genericLaunchModel } from "./00-model.js";

const space = new OpenLaunch();
const simulation = space.trajectory.simulate(genericLaunchModel);
console.log(simulation.events);
console.log({
  initialMassKg: simulation.initialMassKg,
  finalMassKg: simulation.finalMassKg,
  totalSimulatedSeconds: simulation.totalSimulatedSeconds,
  maxAltitudeKm: simulation.maxAltitudeKm,
  maxQPa: simulation.maxQPa,
  samples: simulation.telemetry.length,
});
