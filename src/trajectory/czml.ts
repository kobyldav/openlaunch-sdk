import { temeToEcfPositionApprox } from "../orbit/frames.js";
import type { CzmlPacket } from "../scenario/czml.js";
import type { LaunchSimulation } from "./types.js";

export interface LaunchCzmlOptions {
  id?: string;
  name?: string;
  includeEvents?: boolean;
  pathWidth?: number;
}

/** Time-tagged, sampled Earth-fixed CZML path for research-grade visualization. */
export function launchToCzml(simulation: LaunchSimulation, options: LaunchCzmlOptions = {}): CzmlPacket[] {
  if (simulation.trajectory.length < 2) throw new RangeError("Launch CZML needs at least two trajectory samples");
  const start=simulation.trajectory[0]!.time;
  const end=simulation.trajectory[simulation.trajectory.length-1]!.time;
  const epoch=start.toISOString();
  const interval=epoch+"/"+end.toISOString();
  const id=options.id ?? "launch-vehicle";
  const name=options.name ?? simulation.model.vehicle.name;
  const cartesian:number[]=[];

  for(const state of simulation.trajectory) {
    const p=temeToEcfPositionApprox(state.positionTemeKm,state.time);
    cartesian.push((state.time.getTime()-start.getTime())/1000,p.x*1000,p.y*1000,p.z*1000);
  }

  const packets:CzmlPacket[]=[
    {
      id:"document",name:"OpenLaunch v0.8 launch scenario",version:"1.0",
      clock:{interval,currentTime:epoch,multiplier:1,range:"CLAMPED",step:"SYSTEM_CLOCK_MULTIPLIER"},
    },
    {
      id,name,availability:interval,
      position:{epoch,referenceFrame:"FIXED",interpolationAlgorithm:"LAGRANGE",interpolationDegree:3,cartesian},
      point:{pixelSize:8,outlineWidth:1},
      path:{show:true,width:options.pathWidth ?? 3,trailTime:simulation.totalSimulatedSeconds,leadTime:0,resolution:10},
      label:{text:name,show:true,font:"12px sans-serif",pixelOffset:{cartesian2:[12,-12]}},
      properties:{
        model:"generic-3dof",
        frame:simulation.frame,
        launchTime:simulation.model.liftoff.toISOString(),
        provenance:"OpenLaunch simulated dynamics; NOT real observed trajectory",
      },
    },
  ];

  if(options.includeEvents !== false) {
    simulation.events.forEach((event,index)=>{
      if(event.kind === "simulation-end" || event.kind === "max-q" || event.kind === "liftoff" || event.kind === "engine-cutoff" || event.kind === "stage-separation" || event.kind === "fairing-jettison") {
        const matched=simulation.telemetry.reduce((closest,item)=>{
          const d=Math.abs(item.time.getTime()-event.time.getTime());
          return d < Math.abs(closest.time.getTime()-event.time.getTime()) ? item : closest;
        },simulation.telemetry[0]!);
        const ecf=temeToEcfPositionApprox(matched.positionTemeKm,matched.time);
        packets.push({
          id:id+"-event-"+index,name:event.kind,
          position:{cartesian:[ecf.x*1000,ecf.y*1000,ecf.z*1000]},
          point:{pixelSize:5},
          label:{text:event.kind+" T+"+event.elapsedSeconds.toFixed(1)+" s",show:true,font:"11px sans-serif"},
          properties:{kind:event.kind,elapsedSeconds:event.elapsedSeconds,detail:event.detail ?? ""},
        });
      }
    });
  }
  return packets;
}
