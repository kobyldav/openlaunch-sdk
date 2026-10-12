/**
 * Compare two numerical scenarios with and without wind/J2 gravity.
 * Simplified uniform wind is a scenario input, not a weather forecast.
 * Network: no
 */
import { LaunchDynamicsEngine } from "../../src/index.js";

const baseline={
  site:{latitudeDeg:28.5,longitudeDeg:-80.5,altitudeM:3},
  liftoff:new Date("2026-10-12T12:00:00Z"),
  vehicle:{
    name:"Fictional demonstrator",payloadMassKg:100,referenceAreaM2:0.7,
    dragCoefficient:0.3,
    stages:[{name:"stage",dryMassKg:250,propellantMassKg:750,
      thrustSeaLevelN:35000,thrustVacuumN:39000,
      ispSeaLevelS:285,ispVacuumS:315}],
  },
  guidance:{program:[
    {tSeconds:0,elevationDeg:90,azimuthDeg:100},
    {tSeconds:65,elevationDeg:78,azimuthDeg:100},
  ]},
  durationSeconds:70,stepSeconds:1,
};
const engine=new LaunchDynamicsEngine();
const a=engine.simulate(baseline);
const b=engine.simulate({...baseline,environment:{
  useJ2:true,windEastMps:20,windNorthMps:-8,
}});
console.log({
  baselineMaxQ:a.summary.maxDynamicPressurePa,
  windyMaxQ:b.summary.maxDynamicPressurePa,
  baselineFinalAltitudeM:a.samples.at(-1)?.altitudeM,
  windyFinalAltitudeM:b.samples.at(-1)?.altitudeM,
});
