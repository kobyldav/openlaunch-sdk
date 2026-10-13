import { OpenLaunch } from "../../src/index.js";
import { genericLaunchModel } from "../15-launch-trajectory/00-model.js";

// NETWORK: no. Engineering comparison, NOT a real-world flight optimizer.
const space=new OpenLaunch();
const target={perigeeAltitudeKm:350,apogeeAltitudeKm:350,inclinationDeg:51.6};
const result=space.mission.sweep(genericLaunchModel,target,{
  pitchOffsetsDeg:[-3,0,3],headingOffsetsDeg:[-2,0,2],maxCandidates:16,
});
console.log({
  evaluated:result.evaluated,
  achieved:result.achieved,
  bestPitch:result.best.pitchOffsetDeg,
  bestHeading:result.best.headingOffsetDeg,
  bestOrbitClass:result.best.simulation.finalOrbit?.classification,
  bestPerigeeKm:result.best.simulation.finalOrbit?.perigeeAltitudeKm,
  idealVacuumDeltaVMps:space.mission.idealDeltaV(genericLaunchModel),
  targetCircularSpeedMps:space.mission.circularSpeed(350),
  warning:result.warning,
});
