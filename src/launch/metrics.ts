import type { AscentSimulationResult } from "./types.js";
import type { CzmlPacket } from "../scenario/czml.js";

/**
 * Cesium-compatible rocket track. The time samples use Earth-fixed Cartesian
 * coordinates already present in the 3DOF solver output, so no TEME
 * conversion is performed during visualization.
 */
export function launchToCzml(result:AscentSimulationResult,id="launch-vehicle"):CzmlPacket[]{
  if(result.samples.length<2)throw new RangeError("Launch scenario needs at least two samples");
  const first=result.samples[0]!;
  const last=result.samples[result.samples.length-1]!;
  const availability=`${first.time.toISOString()}/${last.time.toISOString()}`;
  const cartesian:number[]=[];
  for(const s of result.samples){
    cartesian.push(s.tSeconds,s.positionEcefM.x,s.positionEcefM.y,s.positionEcefM.z);
  }
  return [
    {
      id:"document",name:`OpenLaunch v0.8: ${result.vehicleName}`,version:"1.0",
      clock:{interval:availability,currentTime:first.time.toISOString(),multiplier:10,range:"CLAMPED",step:"SYSTEM_CLOCK_MULTIPLIER"},
    },
    {
      id,name:result.vehicleName,availability,
      position:{epoch:first.time.toISOString(),referenceFrame:"FIXED",interpolationAlgorithm:"LAGRANGE",
        interpolationDegree:3,cartesian},
      point:{pixelSize:9,outlineWidth:1},
      label:{text:result.vehicleName,show:true,font:"12px sans-serif"},
      path:{show:true,width:3,leadTime:0,trailTime:result.summary.elapsedSeconds,
        resolution:Math.max(0.1, result.summary.elapsedSeconds/result.samples.length)},
      properties:{
        model:result.model,frameAccuracy:result.frameAccuracy,
        assumptions:result.limitations,
        maxDynamicPressurePa:result.summary.maxDynamicPressurePa,
      },
    },
  ];
}

/** GeoJSON LineString ground track; discontinuities across the dateline are not split in v0.8. */
export function launchGroundTrackGeoJson(result:AscentSimulationResult){
  return {
    type:"Feature" as const,
    properties:{vehicle:result.vehicleName,model:result.model},
    geometry:{type:"LineString" as const,
      coordinates:result.samples.map(s=>[s.longitudeDeg,s.latitudeDeg,s.altitudeM] as [number,number,number])},
  };
}
