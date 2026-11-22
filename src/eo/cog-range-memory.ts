/** Stage 23: adaptive COG byte-range CACHE capacity under genuine measured
 * host / process memory pressure. This is NOT a hard OOM guard and never
 * changes original HTTPS asset identity, ETag validation, TIFF pixels or SCL.
 *
 * Pure policy: callers supply actually sampled Node RSS and host free bytes.
 * This module contains no host probes or background timer.
 */
import {CogRangeCache} from "./cog-range-cache.js";

const MiB=1048576;
const STEP=4*MiB;
export type CogMemoryMode="fixed"|"adaptive";
export interface CogMemorySample{rssBytes:number;systemFreeBytes:number;}
export interface CogMemoryPolicyOptions{
 mode:CogMemoryMode;
 processLimitBytes:number;
 /** Default reserve: 96MiB for active TIFF decompression and JS allocations. */
 processReserveBytes?:number;
 /** Default reserve: 512MiB host free memory for browser, OS and other apps. */
 systemReserveBytes?:number;
 /** 3 consecutive healthy samples before bounded restoration, by default. */
 recoverySamples?:number;
 /** Each restoration can add at most 16MiB by default. */
 recoveryStepBytes?:number;
}
export interface CogMemoryPolicyStats{
 mode:CogMemoryMode;
 samples:number;pressureSamples:number;decreases:number;increases:number;
 processLimitMiB:number;processReserveMiB:number;systemReserveMiB:number;
 configuredBudgetMiB:number;activeBudgetMiB:number;minimumBudgetMiB:number;
 maxMeasuredRssMiB:number;minMeasuredSystemFreeMiB:number|null;
 stableRecoverySamples:number;
 /** Only verified compressed TIFF range allocations were evicted; RSS may lag GC. */
 evictedOnPressureBytes:number;
 lastConstraint:"disabled"|"none"|"process-rss"|"host-free-memory"|"both";
}
function finiteBytes(value:number):boolean{
 return Number.isSafeInteger(value)&&value>=0;
}
export class AdaptiveCogRangeMemory{
 private readonly mode:CogMemoryMode;
 private readonly processReserve:number;
 private readonly systemReserve:number;
 private readonly recoverySamples:number;
 private readonly recoveryStep:number;
 private limit:number;
 private sampled=0;private pressure=0;
 private downs=0;private ups=0;private stable=0;private released=0;
 private maxRss=0;private minHostFree=Infinity;
 private constraint:CogMemoryPolicyStats["lastConstraint"]="none";

 constructor(readonly cache:CogRangeCache,options:CogMemoryPolicyOptions){
   const {mode,processLimitBytes}=options;
   if(mode!=="fixed"&&mode!=="adaptive")
     throw new RangeError("COG memory mode must be fixed or adaptive");
   const processReserve=options.processReserveBytes??96*MiB;
   const systemReserve=options.systemReserveBytes??512*MiB;
   const recoverySamples=options.recoverySamples??3;
   const recoveryStep=options.recoveryStepBytes??16*MiB;
   if(!finiteBytes(processLimitBytes)||processLimitBytes<256*MiB||
      processLimitBytes>8192*MiB||
      !finiteBytes(processReserve)||processReserve<32*MiB||
      processReserve>512*MiB||
      !finiteBytes(systemReserve)||systemReserve<128*MiB||
      systemReserve>4096*MiB||
      !Number.isInteger(recoverySamples)||recoverySamples<2||
      recoverySamples>100||
      !finiteBytes(recoveryStep)||recoveryStep<STEP||
      recoveryStep>64*MiB||recoveryStep%STEP!==0)
     throw new RangeError("Invalid bounded adaptive COG memory policy");
   this.mode=mode;
   this.limit=processLimitBytes;
   this.processReserve=processReserve;
   this.systemReserve=systemReserve;
   this.recoverySamples=recoverySamples;
   this.recoveryStep=recoveryStep;
 }
 setProcessLimitBytes(bytes:number):void{
   if(!finiteBytes(bytes)||bytes<256*MiB||bytes>8192*MiB)
     throw new RangeError("COG process RSS target must be 256..8192 MiB");
   this.limit=bytes;this.stable=0;
 }
 observe(sample:CogMemorySample):CogMemoryPolicyStats{
   if(!sample||!finiteBytes(sample.rssBytes)||
     !finiteBytes(sample.systemFreeBytes))
     throw new RangeError("Adaptive COG policy requires measured finite Node RSS and free host memory");
   this.sampled++;
   this.maxRss=Math.max(this.maxRss,sample.rssBytes);
   this.minHostFree=Math.min(this.minHostFree,sample.systemFreeBytes);
   if(this.mode==="fixed"||this.cache.configuredMaxResidentBytes===0){
     this.constraint="disabled";return this.snapshot();
   }
   // Both limits are applied to the *whole actual Node process*, not
   // just TIFF cache allocations. Retain memory for decompression and UI.
   const rssAllowed=Math.max(0,this.limit-sample.rssBytes-this.processReserve);
   const systemAllowed=Math.max(0,Math.floor((sample.systemFreeBytes-
     this.systemReserve)/2));
   const ceiling=this.cache.configuredMaxResidentBytes;
   const allowed=Math.max(0,Math.floor(Math.min(
     ceiling,rssAllowed,systemAllowed)/STEP)*STEP);
   const rssRestricts=rssAllowed<ceiling&&rssAllowed<=systemAllowed;
   const hostRestricts=systemAllowed<ceiling&&systemAllowed<=rssAllowed;
   this.constraint=rssRestricts&&hostRestricts?"both":
     rssRestricts?"process-rss":
     hostRestricts?"host-free-memory":"none";
   if(allowed<ceiling)this.pressure++;
   const active=this.cache.maxResidentBytes;
   if(allowed<active){
     this.released+=this.cache.resizeBudgetBytes(allowed);
     this.downs++;this.stable=0;
   }else if(allowed>active){
     // Hysteresis prevents oscillations when the host free-memory
     // counter or process RSS fluctuates near a threshold.
     this.stable++;
     if(this.stable>=this.recoverySamples){
       this.cache.resizeBudgetBytes(Math.min(allowed,active+this.recoveryStep));
       this.ups++;this.stable=0;
     }
   }else this.stable=0;
   return this.snapshot();
 }
 snapshot():CogMemoryPolicyStats{
   const c=this.cache.snapshot();
   return {
     mode:this.mode,samples:this.sampled,
     pressureSamples:this.pressure,decreases:this.downs,increases:this.ups,
     processLimitMiB:this.limit/MiB,processReserveMiB:this.processReserve/MiB,
     systemReserveMiB:this.systemReserve/MiB,
     configuredBudgetMiB:c.configuredMaxResidentBytes/MiB,
     activeBudgetMiB:c.maxResidentBytes/MiB,
     minimumBudgetMiB:c.minimumBudgetBytes/MiB,
     maxMeasuredRssMiB:this.maxRss/MiB,
     minMeasuredSystemFreeMiB:this.sampled?this.minHostFree/MiB:null,
     stableRecoverySamples:this.stable,
     evictedOnPressureBytes:this.released,
     lastConstraint:this.constraint
   };
 }
}
