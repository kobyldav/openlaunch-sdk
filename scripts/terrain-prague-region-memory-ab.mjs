/** Stage 23 strict ORIGINAL Sentinel-2 4x4 memory policy A/B.
 * Each mode starts with its own EMPTY original STAC/COG disk cache and
 * independently replays from real persisted source data in a new Node process.
 * Only actual measured Node RSS, host memory and COG response bytes count.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,readdir,readFile,writeFile} from "node:fs/promises";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const args=process.argv.slice(2);
const get=(name,def)=>{const i=args.indexOf("--"+name);return i<0?def:args[i+1];};
const numeric=(name,def)=>Number(get(name,String(def)));
const root=resolve(get("cache","test-results/terrain-prague-stage23-memory-ab-cache"));
const output=resolve(get("output","test-results/terrain-prague-stage23-memory-ab-report.json"));
const rssTargetMiB=numeric("rss-target-mib",320),
 timeoutMs=numeric("timeout-ms",1000000);
if(!Number.isInteger(rssTargetMiB)||rssTargetMiB<256||rssTargetMiB>8192||
 !Number.isInteger(timeoutMs)||timeoutMs<10000||timeoutMs>3600000)
 throw RangeError("Stage 23 genuine source A/B requires RSS target 256..8192MiB and time 10s..1h");
const defaults={x:"1",y:"1",cols:"4",rows:"4",from:"2023",to:"2025",month:"8",cloud:"50"};
const scope=Object.entries(defaults).flatMap(([k,v])=>["--"+k,get(k,v)]);
await mkdir(root,{recursive:true});await mkdir(dirname(output),{recursive:true});
const report={
 status:"incomplete",source:"real-Sentinel-2-L2A-original-COG-206",
 methodology:"two isolated EMPTY source caches and four distinct Node processes (fixed/low-RAM adaptive, cold+replay)",
 rssTargetMiB,cogRangeCacheMaxMiB:64,runs:[],
 caveats:[
  "RSS target is SOFT. Process RSS sampled every 100ms may exceed the limit briefly or remain high after buffer eviction.",
  "Only original HTTP 206 TIFF bytes with valid strong ETag qualify for caching; SCL mask, source ID and original annual scenes are unchanged.",
  "Host free memory from Node os.freemem() may fluctuate due to unrelated processes.",
  "A lower cache budget can increase actual TIFF downloads and elapsed time. This benchmark reports both sides rather than promising a speed gain.",
  "Browser Edge GPU memory and network/TLS overhead are not counted in Node RSS or HTTP response-body statistics."
 ]
};
const persist=()=>writeFile(output,JSON.stringify(report,null,2));
try{
 for(const mode of ["fixed","adaptive"]){
   const path=join(root,"cold-"+mode);
   await mkdir(path,{recursive:true});
   assert.deepEqual(await readdir(path),[],
     "Stage 23 requires a previously EMPTY original COG source cache. Choose new --cache root");
   const auditPath=join(path,"source-report.json");
   const child=spawn(process.execPath,[
     fileURLToPath(new URL("./terrain-prague-region-benchmark.mjs",import.meta.url)),
     "--live",...scope,"--repeat","2","--timeout-ms",String(timeoutMs),
     "--rss-limit-mib","1536","--cog-range-cache-mib","64",
     "--scene-pair-concurrency","2",
     "--cog-memory-mode",mode,
     "--cog-rss-target-mib",String(rssTargetMiB),
     "--require-complete","--require-cached-replay",
     "--cache",path,"--output",auditPath
   ],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
   let stdout="",stderr="";
   child.stdout.on("data",chunk=>{stdout=(stdout+chunk.toString()).slice(-18000);});
   child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-9000);});
   const exit=await new Promise((res,rej)=>{
     const timer=setTimeout(()=>{
       child.kill();rej(Error("Measured original Sentinel memory policy A/B timed out: "+mode));
     },Math.min(2*timeoutMs+120000,3600000));
     child.once("error",e=>{clearTimeout(timer);rej(e);});
     child.once("exit",code=>{clearTimeout(timer);res(code);});
   });
   let audit;
   try{audit=JSON.parse(await readFile(auditPath,"utf8"));}
   catch{audit={status:"failed",error:stderr.slice(-1800)};}
   report.runs.push({mode,exitCode:exit,sourceAudit:audit,
     stdoutTail:stdout.slice(-1500),stderrTail:stderr.slice(-1500)});
   await persist();
   if(exit!==0||audit.status!=="completed-source-faithful")
     throw Error("Stage 23 genuine "+mode+" source run failed: "+
       String(audit.error??stderr).slice(-1200));
   assert.equal(audit.runs.length,2);
   assert.ok(audit.runs.every(r=>r.coverage.regionFullyAnalyzed&&
     r.coverage.analyzedTiles===16&&r.metrics.cogMemory.mode===mode));
   assert.equal(audit.runs[0].metrics.rasterCacheMisses,16);
   assert.equal(audit.runs[1].metrics.rasterCacheHits,16);
   console.log("Stage 23 "+mode+" genuine 4x4: "+
     audit.runs[0].fullRequestWallMs.toFixed(0)+"ms cold, "+
     audit.runs[0].metrics.peakRssMiB.toFixed(1)+" MiB Node RSS peak, "+
     audit.runs[0].metrics.cogMemory.shrinkEvents+" actual cache pressure shrinks, "+
     audit.runs[0].metrics.cogMemory.minimumBudgetMiB.toFixed(0)+" MiB min original COG budget, "+
     audit.runs[0].metrics.cogRangeCache.httpRequests+" original range requests, "+
     audit.runs[0].coverage.commonValidPixels+" genuine source pixels, hash "+
     audit.runs[0].scientificFingerprint.slice(0,16));
 }
 const fixed=report.runs[0].sourceAudit.runs[0],
   adaptive=report.runs[1].sourceAudit.runs[0];
 report.scientificResultsIdentical=fixed.scientificFingerprint===
   adaptive.scientificFingerprint;
 report.comparison={
   genuineCommonSclValidPixels:fixed.coverage.commonValidPixels,
   fullySourceBackedTiles:fixed.coverage.analyzedTiles,
   sourceFingerprint:fixed.scientificFingerprint,
   identicalSourceAndScientificOutputs:report.scientificResultsIdentical,
   fixedColdMs:fixed.fullRequestWallMs,
   adaptiveColdMs:adaptive.fullRequestWallMs,
   fixedPeakSampledNodeRssMiB:fixed.metrics.peakRssMiB,
   adaptivePeakSampledNodeRssMiB:adaptive.metrics.peakRssMiB,
   fixedNetwork206Requests:fixed.metrics.cogRangeCache.httpRequests,
   adaptiveNetwork206Requests:adaptive.metrics.cogRangeCache.httpRequests,
   fixedActualTiffBodyBytes:fixed.metrics.cogRangeCache.httpBytesRead,
   adaptiveActualTiffBodyBytes:adaptive.metrics.cogRangeCache.httpBytesRead,
   adaptiveCacheShrinkEvents:adaptive.metrics.cogMemory.shrinkEvents,
   adaptiveRecoveryEvents:adaptive.metrics.cogMemory.recoveryEvents,
   adaptivePressureChecks:adaptive.metrics.cogMemory.pressureChecks,
   adaptiveLowestResidentLimitMiB:adaptive.metrics.cogMemory.minimumBudgetMiB,
   adaptiveEvictedFromVerifiedCacheBytes:adaptive.metrics.cogMemory.freedFromCacheBytes,
   rssDifferenceMiB:adaptive.metrics.peakRssMiB-fixed.metrics.peakRssMiB,
   coldTimeDifferenceMs:adaptive.fullRequestWallMs-fixed.fullRequestWallMs,
   originalRangeRequestDifference:adaptive.metrics.cogRangeCache.httpRequests-
     fixed.metrics.cogRangeCache.httpRequests
 };
 assert.equal(report.scientificResultsIdentical,true,
   "Adaptive memory pressure cannot change real original STAC source IDs, native seam pixels or NDVI");
 assert.equal(adaptive.coverage.commonValidPixels,fixed.coverage.commonValidPixels);
 assert.equal(fixed.metrics.cogMemory.shrinkEvents,0);
 if(args.includes("--require-pressure"))
   assert.ok(adaptive.metrics.cogMemory.shrinkEvents>0&&
     adaptive.metrics.cogMemory.minimumBudgetMiB<64,
     "Strict low-RAM policy A/B must actually observe cache shrink on the source job");
 report.status="verified-original-source-memory-ab";
 await persist();
 console.log("PASS Stage 23 measured 4x4 original Sentinel source identity across fixed and adaptive cache; "+
   report.comparison.genuineCommonSclValidPixels+
   " actual common NDVI pixels, "+report.comparison.adaptiveCacheShrinkEvents+
   " memory pressure shrinks; report "+output);
}catch(error){
 report.status="failed";report.error=String(error?.stack??error).slice(0,1800);
 await persist();throw error;
}
