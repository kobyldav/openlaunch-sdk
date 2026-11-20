import {reconstructTerrain,type TerrainReconstructionOptions} from "./reconstruct.js";
/** A robust, image-only pilot. A broad search must reveal a consistent height mode.
 * No reference DEM, assumed sea-level terrain or externally supplied height map. */
export function estimateTerrainHeightBand(o:TerrainReconstructionOptions,options:{pilotStepM?:number;clusterRadiusM?:number;marginM?:number}={}){
 const step=options.pilotStepM??15,radius=options.clusterRadiusM??120,margin=options.marginM??180;
 if(![step,radius,margin].every(v=>Number.isFinite(v)&&v>0))throw new RangeError("Invalid pilot settings");
 const stride=Math.max(1,Math.ceil(Math.max(o.grid.width,o.grid.height)/10));
 const pilot=reconstructTerrain({...o,matcher:"height-sweep",recoverMissing:false,recoveryExpansionRounds:1,peakRefinement:"parabolic",heightStepM:Math.max(step,(o.maxHeightM-o.minHeightM)/1000),sampleStride:stride,patchRadius:4,minCorrelation:.75,minPeakGap:.035,peakExclusionM:45,maxWork:100_000_000});
 const candidates=Array.from(pilot.elevationMap.values).flatMap((h,i)=>Number.isFinite(h)?[{h,q:pilot.confidenceMap.values[i]!}]:[]).sort((a,b)=>a.h-b.h);
 let best:typeof candidates=[],weight=0;
 for(const p of candidates){const group=candidates.filter(v=>Math.abs(v.h-p.h)<=radius),w=group.reduce((s,v)=>s+Math.max(.05,v.q),0);if(w>weight){best=group;weight=w;}}
 const share=best.length/Math.max(1,candidates.length);
 if(best.length<6||share<.3)throw new Error("Image-only pilot did not find a coherent height band; supply a narrower independently justified search or change AOI");
 const median=best[Math.floor(best.length/2)]!.h;
 return {minHeightM:Math.max(o.minHeightM,best[0]!.h-margin),maxHeightM:Math.min(o.maxHeightM,best[best.length-1]!.h+margin),medianHeightM:median,pilotMatches:candidates.length,clusterMatches:best.length,clusterShare:share};
}
