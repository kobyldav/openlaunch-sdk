/**
 * Combine an LL2 launch pad/time with USER-SUPPLIED vehicle/guidance inputs.
 * LL2 does not provide actual ascent trajectories.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const sdk=new OpenLaunch();
const launch=await sdk.launches.next();
if(launch?.pad?.latitude!==undefined&&launch.pad.longitude!==undefined){
  const result=sdk.dynamics.fromLaunch({
    launch, durationSeconds:70,stepSeconds:1,
    vehicle:{
      name:"Illustrative rocket unrelated to actual launch vehicle",
      payloadMassKg:100,referenceAreaM2:0.7,dragCoefficient:0.3,
      stages:[{name:"test stage",dryMassKg:250,propellantMassKg:750,
        thrustSeaLevelN:35000,thrustVacuumN:39000,
        ispSeaLevelS:285,ispVacuumS:315}],
    },
    guidance:{program:[{tSeconds:0,elevationDeg:90,azimuthDeg:90}]},
  });
  console.log({
    launch:launch.name,
    source:"LL2 pad and NET only, NOT historical/real rocket flight",
    summary:result.summary,
  });
}
