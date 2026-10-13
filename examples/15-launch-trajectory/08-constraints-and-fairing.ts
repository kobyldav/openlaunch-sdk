import { OpenLaunch } from "../../src/index.js";
import { genericLaunchModel } from "./00-model.js";

/** First-order engineering throttle model. NOT a certified safety controller. */
const study = {
  ...genericLaunchModel,
  durationSeconds:240,
  stepSeconds:0.5,
  flightConstraints:{
    maxDynamicPressurePa:45_000,
    maxAxialAccelerationG:4.5,
    maxQResponseSeconds:6,
  },
  vehicle:{
    ...genericLaunchModel.vehicle,
    fairingJettisonSeconds:undefined,
    fairingSeparation:{
      earliestSeconds:30,
      minAltitudeKm:80,
      maxDynamicPressurePa:1500,
    },
  },
};

const flight=new OpenLaunch().trajectory.simulate(study);

console.log({
  maxQkPa:flight.maxQPa/1000,
  maxAxialAccelerationG:flight.maxAxialAccelerationG,
  throttledSamples:flight.throttledSamples,
  constraintViolations:flight.constraintViolations,
  finalOrbitClassification:flight.finalOrbit?.classification,
  finalPerigeeAltitudeKm:flight.finalOrbit?.perigeeAltitudeKm,
});

console.table(flight.events.map(event=>({
  name:event.kind,
  t:event.elapsedSeconds,
  altitudeKm:event.altitudeKm,
  releasedMassKg:event.massBeforeKg === undefined ? 0 : event.massBeforeKg-event.massAfterKg!,
})));
