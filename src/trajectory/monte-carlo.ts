import { SampledTemeTrajectory } from "../traffic/trajectory.js";
import { norm, sub } from "./math.js";
import { simulateLaunch } from "./simulate.js";
import type {
  LaunchModel, LaunchMonteCarloResult, LaunchSimulation, MonteCarloConfig,
  TrajectoryDispersion,
} from "./types.js";

export function launchMonteCarlo(model: LaunchModel, config: MonteCarloConfig): LaunchMonteCarloResult {
  if (!Number.isInteger(config.runs) || config.runs < 1) throw new RangeError("runs must be a positive integer");
  const maxRuns = config.maxRuns ?? 200;
  if (config.runs > maxRuns) throw new RangeError("runs exceeds maxRuns");
  for (const [key,val] of Object.entries({
    thrustSigmaFraction:config.thrustSigmaFraction ?? 0.01,
    ispSigmaFraction:config.ispSigmaFraction ?? 0.005,
    dragSigmaFraction:config.dragSigmaFraction ?? 0.08,
    pitchSigmaDeg:config.pitchSigmaDeg ?? 0.25,
    headingSigmaDeg:config.headingSigmaDeg ?? 0.15,
  })) {
    if (!(Number.isFinite(val) && val>=0)) throw new RangeError(key+" must be finite and non-negative");
  }
  const seed=(config.seed ?? 42)>>>0;
  const random=createSeededGaussian(seed);
  const nominal=simulateLaunch(model);
  const comparisonTimes=nominal.trajectory.map(p=>p.time);
  const deviations: number[][]=comparisonTimes.map(()=>[]);
  let successfulRuns=0;
  let failedRuns=0;

  for(let i=0;i<config.runs;i++){
    try {
      const variant=perturbModel(model,config,random);
      const simulation=simulateLaunch(variant);
      if(simulation.trajectory.length < 2) throw new Error("too few trajectory samples");
      const sampled=new SampledTemeTrajectory(simulation.trajectory);
      for(let j=0;j<comparisonTimes.length;j++){
        const time=comparisonTimes[j]!;
        if(time>sampled.end || time<sampled.start) continue;
        const position=sampled.stateAt(time).positionTemeKm;
        const reference=nominal.trajectory[j]!.positionTemeKm;
        deviations[j]!.push(norm(sub(position,reference)));
      }
      successfulRuns++;
    } catch {
      failedRuns++;
    }
  }

  const dispersion:TrajectoryDispersion[]=comparisonTimes.map((time,index)=>{
    const sorted=deviations[index]!.sort((a,b)=>a-b);
    return {
      time,elapsedSeconds:nominal.telemetry[index]!.elapsedSeconds,
      contributingRuns:sorted.length,
      minDeviationKm:sorted[0] ?? 0,
      p50DeviationKm:percentile(sorted,0.5),
      p95DeviationKm:percentile(sorted,0.95),
      maxDeviationKm:sorted[sorted.length-1] ?? 0,
    };
  });

  return {nominal,successfulRuns,failedRuns,dispersion,seed};
}

function percentile(sorted:readonly number[],p:number):number {
  if(!sorted.length) return 0;
  const at=p*(sorted.length-1);
  const lower=Math.floor(at),upper=Math.ceil(at);
  return sorted[lower]!+(sorted[upper]!-sorted[lower]!)*(at-lower);
}

function perturbModel(model:LaunchModel,config:MonteCarloConfig,gaussian:()=>number):LaunchModel {
  const thrust=1+(config.thrustSigmaFraction ?? 0.01)*gaussian();
  const isp=1+(config.ispSigmaFraction ?? 0.005)*gaussian();
  const drag=1+(config.dragSigmaFraction ?? 0.08)*gaussian();

  return {
    ...model,
    vehicle:{
      ...model.vehicle,
      dragCoefficient:Math.max(0,model.vehicle.dragCoefficient*drag),
      stages:model.vehicle.stages.map(stage=>({
        ...stage,
        thrustSeaLevelN:Math.max(1,stage.thrustSeaLevelN*thrust),
        thrustVacuumN:Math.max(1,stage.thrustVacuumN*thrust),
        ispSeaLevelS:Math.max(1,stage.ispSeaLevelS*isp),
        ispVacuumS:Math.max(1,stage.ispVacuumS*isp),
      })),
    },
    guidance:model.guidance.map(knot=>({
      ...knot,
      pitchDeg:Math.max(-90,Math.min(90,knot.pitchDeg+(config.pitchSigmaDeg ?? 0.25)*gaussian())),
      headingDeg:knot.headingDeg+(config.headingSigmaDeg ?? 0.15)*gaussian(),
    })),
  };
}

function createSeededGaussian(seed:number):()=>number {
  let state=seed || 0x9e3779b9;
  let cached:number|null=null;
  const uniform=():number=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return ((state>>>0)+1)/4_294_967_297;
  };
  return ()=>{
    if(cached!==null){const n=cached;cached=null;return n;}
    const r=Math.sqrt(-2*Math.log(uniform()));
    const theta=2*Math.PI*uniform();
    cached=r*Math.sin(theta);
    return r*Math.cos(theta);
  };
}
