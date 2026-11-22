/** Stage 22: real original Sentinel COG HTTPS Range A/B on a cold 4×4.
 * Baseline no byte-range cache vs 16 MiB strong-ETag-only in-memory cache.
 * Each mode uses isolated empty source disk caches and two new Node servers.
 * A/B scientific result SHA-256 must be identical across both modes.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,readdir,readFile,writeFile} from "node:fs/promises";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const args=process.argv.slice(2);
const get=(key,def)=>{const i=args.indexOf("--"+key);return i<0?def:args[i+1];};
const root=resolve(get("cache","test-results/terrain-prague-stage22-range-ab-cache"));
const output=resolve(get("output","test-results/terrain-prague-stage22-range-ab-report.json"));
const timeoutMs=Number(get("timeout-ms","1000000"));
if(!Number.isInteger(timeoutMs)||timeoutMs<10000||timeoutMs>3600000)
 throw RangeError("Stage 22 genuine COG A/B timeout must be 10s..1h");
const defaults={x:"1",y:"1",cols:"4",rows:"4",from:"2023",to:"2025",month:"8",cloud:"50"};
const options=Object.entries(defaults).flatMap(([key,def])=>["--"+key,get(key,def)]);
await mkdir(root,{recursive:true});await mkdir(dirname(output),{recursive:true});
const report={status:"incomplete",
 source:"true-Sentinel-2-L2A-STAC-COG-HTTPS-206",
 methodology:"independent EMPTY original source disk caches for both treatments, each with cold and cache replay in fresh Node processes",
 note:"Strong ETag is mandatory for in-process reuse; cache entries are exact STAC full URL + native requested TIFF byte range and expire by LRU within 64 MiB.",
 risks:["CDN and public STAC network conditions are not guaranteed identical across sequential A/B treatments",
   "Original scientific source data must match, or benchmark rejects; source catalog can change between treatments",
   "Reported RSS is Node only, sampled at 100ms; actual browser GPU not measured",
   "A reused byte is originally downloaded compressed COG data, never interpolated or fabricated reflectance"],
 runs:[]};
const persist=()=>writeFile(output,JSON.stringify(report,null,2));
try{
 for(const budget of [0,64]){
   const mode=budget===0?"no-range-cache":"strong-etag-64mib";
   const cache=join(root,mode);
   await mkdir(cache,{recursive:true});
   assert.deepEqual(await readdir(cache),[],
     "True cold comparison requires EMPTY "+mode+" cache; choose a new --cache directory");
   const auditPath=join(cache,"source-audit.json");
   const child=spawn(process.execPath,[
     fileURLToPath(new URL("./terrain-prague-region-benchmark.mjs",import.meta.url)),
     "--live",...options,"--repeat","2",
     "--scene-pair-concurrency","2",
     "--cog-range-cache-mib",String(budget),
     "--timeout-ms",String(timeoutMs),"--rss-limit-mib","1536",
     "--require-complete","--require-cached-replay",
     "--cache",cache,"--output",auditPath
   ],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
   let out="",err="";
   child.stdout.on("data",v=>{out=(out+v.toString()).slice(-18000);});
   child.stderr.on("data",v=>{err=(err+v.toString()).slice(-4000);});
   const exit=await new Promise((res,rej)=>{
     const timer=setTimeout(()=>{
       child.kill();rej(Error("Original cold COG A/B timed out in "+mode));
     },Math.min(2*timeoutMs+120000,3600000));
     child.once("error",e=>{clearTimeout(timer);rej(e);});
     child.once("exit",code=>{clearTimeout(timer);res(code);});
   });
   let audit;
   try{audit=JSON.parse(await readFile(auditPath,"utf8"));}
   catch{audit={status:"failed",error:err};}
   report.runs.push({mode,budgetMiB:budget,exitCode:exit,
     sourceAudit:audit,stdoutTail:out.slice(-1700),stderrTail:err.slice(-1200)});
   await persist();
   if(exit!==0||audit.status!=="completed-source-faithful"){
     throw Error("Original Stage22 "+mode+" failed: "+
       String(audit.error??err).slice(-1300));
   }
   assert.equal(audit.runs.length,2);
   assert.equal(audit.runs[0].coverage.analyzedTiles,16);
   assert.equal(audit.runs[0].metrics.rasterCacheMisses,16);
   assert.equal(audit.runs[1].metrics.rasterCacheHits,16);
   assert.equal(audit.runs[0].metrics.cogRangeCache.maxResidentMiB,budget);
   console.log("Stage 22 "+mode+": original 4x4 cold "+
     audit.runs[0].fullRequestWallMs.toFixed(0)+"ms, "+
     audit.runs[0].metrics.cogRangeCache.httpRequests+" actual 206 requests, "+
     audit.runs[0].metrics.cogRangeCache.httpBytesRead+" HTTP bytes, "+
     audit.runs[0].metrics.cogRangeCache.rangeCacheHits+" verified range reuses, "+
     audit.runs[0].metrics.peakRssMiB.toFixed(1)+" MiB Node RSS peak; "+
     audit.runs[0].scientificFingerprint.slice(0,16));
 }
 const baseline=report.runs[0].sourceAudit.runs[0];
 const optimized=report.runs[1].sourceAudit.runs[0];
 report.scientificSourceIdentical=
   baseline.scientificFingerprint===optimized.scientificFingerprint;
 report.comparison={
   sourceBackedTiles:optimized.coverage.analyzedTiles,
   genuineCommonValidPixels:optimized.coverage.commonValidPixels,
   baselineWallMs:baseline.fullRequestWallMs,
   optimizedWallMs:optimized.fullRequestWallMs,
   baseline206Requests:baseline.metrics.cogRangeCache.httpRequests,
   optimized206Requests:optimized.metrics.cogRangeCache.httpRequests,
   baselineActualHttpBytes:baseline.metrics.cogRangeCache.httpBytesRead,
   optimizedActualHttpBytes:optimized.metrics.cogRangeCache.httpBytesRead,
   validatedCacheHits:optimized.metrics.cogRangeCache.rangeCacheHits,
   verifiedSourceObjects:optimized.metrics.cogRangeCache.verifiedObjects,
   residentCacheMiB:optimized.metrics.cogRangeCache.residentMiB,
   baselinePeakRssMiB:baseline.metrics.peakRssMiB,
   optimizedPeakRssMiB:optimized.metrics.peakRssMiB,
   sourceFingerprint:optimized.scientificFingerprint,
   identicalScientificSource:report.scientificSourceIdentical,
   observedColdSpeedup:baseline.fullRequestWallMs/optimized.fullRequestWallMs,
   observedRequestReductionPercent:
     baseline.metrics.cogRangeCache.httpRequests>0?
       100*(baseline.metrics.cogRangeCache.httpRequests-
         optimized.metrics.cogRangeCache.httpRequests)/
         baseline.metrics.cogRangeCache.httpRequests:null,
   observedTransferredByteReductionPercent:
     baseline.metrics.cogRangeCache.httpBytesRead>0?
       100*(baseline.metrics.cogRangeCache.httpBytesRead-
         optimized.metrics.cogRangeCache.httpBytesRead)/
         baseline.metrics.cogRangeCache.httpBytesRead:null
 };
 assert.equal(report.scientificSourceIdentical,true,
   "Original Sentinel NDVI and edge pixels changed across source byte-range cache modes");
 assert.equal(optimized.coverage.commonValidPixels,baseline.coverage.commonValidPixels);
 assert.equal(baseline.metrics.cogRangeCache.rangeCacheHits,0);
 assert.ok(optimized.metrics.cogRangeCache.rangeCacheHits>0,
   "Real COG source lacked any strong-ETag-verified reusable native ranges");
 assert.ok(optimized.metrics.cogRangeCache.httpRequests<
   baseline.metrics.cogRangeCache.httpRequests,
   "Range cache did not eliminate any real HTTPS 206 requests");
 assert.ok(optimized.metrics.cogRangeCache.httpBytesRead<
   baseline.metrics.cogRangeCache.httpBytesRead,
   "Range cache did not eliminate any real transferred TIFF bytes");
 report.status="verified-original-source-range-ab";
 await persist();
 console.log("PASS Stage 22 real Sentinel 4x4 A/B: "+
  report.comparison.genuineCommonValidPixels+" identical original pixels, "+
  report.comparison.observedRequestReductionPercent.toFixed(1)+"% fewer original 206 requests, "+
  report.comparison.observedTransferredByteReductionPercent.toFixed(1)+"% fewer TIFF transfer bytes, "+
  "measured cold time "+report.comparison.baselineWallMs.toFixed(0)+"ms -> "+
  report.comparison.optimizedWallMs.toFixed(0)+"ms; "+output);
}catch(error){
 report.status="failed";report.error=String(error?.stack??error).slice(0,1800);
 await persist();throw error;
}
