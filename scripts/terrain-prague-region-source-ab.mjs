/** Stage 21: genuine cold-source A/B, same original Sentinel region and
 * original observation calendar, never fabricated pixels or speedup numbers.
 * Serial and paired modes use isolated fresh disk caches; each is repeated
 * in a fresh Node server to verify scientific identity and real cache reuse.
 */
import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
const args=process.argv.slice(2);
const get=(name,defaultValue)=>{
 const i=args.indexOf("--"+name);return i<0?defaultValue:args[i+1];
};
const out=resolve(get("output","test-results/terrain-prague-region-stage21-ab.json")),
 root=resolve(get("cache","test-results/terrain-prague-stage21-ab-cache"));
const region=["x","y","cols","rows","from","to","month","cloud"].flatMap(name=>[
 "--"+name,get(name,({x:"1",y:"1",cols:"4",rows:"4",from:"2023",to:"2025",
 month:"8",cloud:"50"})[name])]);
const timeout=Number(get("timeout-ms","1000000"));
if(!Number.isInteger(timeout)||timeout<10000||timeout>3600000)
 throw RangeError("Stage 21 benchmark timeout must be 10s..1h");
await mkdir(root,{recursive:true});
await mkdir(dirname(out),{recursive:true});
const report={
 status:"incomplete",source:"original-Sentinel-2-L2A-COG",
 design:"A/B with separate empty disk source caches and two fresh Node server processes per mode",
 reproducibility:"Both 4x4 scientific SHA-256 fingerprints must match across concurrency and restart",
 caveats:[
  "Different requests are separated in time: STAC/CDN latency and server conditions may change between A and B.",
  "Cold source load includes original STAC queries, COG byte-range reads, PNG conversion and disk writes.",
  "Peak RSS is observed process-wide at 100ms intervals and excludes GPU and network transfer metrics.",
  "A faster wall-clock time is an observed engineering benchmark, not a guarantee for every user or region."
 ],runs:[]
};
const persist=()=>writeFile(out,JSON.stringify(report,null,2));
for(const concurrency of [1,2]){
 const mode=concurrency===1?"serial":"bounded-dual-original-acquisitions";
 const target=join(root,"cold-"+mode);
 await mkdir(target,{recursive:true});
 // Abort rather than reuse an old audit cache: the A/B comparison must
 // measure source downloads and products computed from a clean cache.
 const {readdir}=await import("node:fs/promises");
 const existing=await readdir(target);
 assert.equal(existing.length,0,
   "Stage 21 cold A/B cache is not empty for "+mode+
   "; pass a new --cache path to avoid a fictitious cold timing");
 const resultFile=join(target,"benchmark.json");
 const command=fileURLToPath(new URL("./terrain-prague-region-benchmark.mjs",import.meta.url));
 const child=spawn(process.execPath,[command,"--live",
   ...region,"--repeat","2","--timeout-ms",String(timeout),
   "--scene-pair-concurrency",String(concurrency),
   "--rss-limit-mib","1536","--require-complete","--require-cached-replay",
   "--cache",target,"--output",resultFile
 ],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="";
 child.stdout.on("data",data=>{stdout+=data.toString();
   if(stdout.length>20000)stdout=stdout.slice(-20000);});
 child.stderr.on("data",data=>{stderr+=data.toString();
   if(stderr.length>10000)stderr=stderr.slice(-10000);});
 const exitCode=await new Promise((res,rej)=>{
   const timer=setTimeout(()=>{child.kill();rej(Error("Timed out authentic "+
     mode+" source A/B: "+stderr.slice(-1500)));},Math.min(2*timeout+120000,3600000));
   child.once("error",e=>{clearTimeout(timer);rej(e);});
   child.once("exit",code=>{clearTimeout(timer);res(code);});
 });
 let audit;
 try{audit=JSON.parse(await readFile(resultFile,"utf8"));}catch{
   audit={status:"failed",error:stderr.slice(-1500)};
 }
 report.runs.push({mode,scenePairConcurrency:concurrency,
   sourceAudit:audit,exitCode,stdoutTail:stdout.slice(-1800),
   stderrTail:stderr.slice(-1800)});
 await persist();
 if(exitCode!==0||audit.status!=="completed-source-faithful"){
   report.status="failed";await persist();
   throw Error("Stage 21 "+mode+" original source A/B failed; see source audit: "+
     String(audit.error??stderr).slice(-1200));
 }
 assert.equal(audit.runs.length,2);
 assert.ok(audit.runs.every(r=>
   r.coverage.regionFullyAnalyzed&&r.coverage.requestedTiles===16&&
   r.metrics.scenePairConcurrency===concurrency));
 assert.equal(audit.runs[0].metrics.rasterCacheMisses,16,
   "Original A/B first run must download and compute 16 real source products");
 assert.equal(audit.runs[1].metrics.rasterCacheHits,16,
   "Original A/B replay must restore all 16 real source products");
 console.log("Stage 21 "+mode+": cold "+
   audit.runs[0].fullRequestWallMs.toFixed(0)+"ms, replay "+
   audit.runs[1].fullRequestWallMs.toFixed(0)+"ms, peak Node RSS "+
   audit.runs[0].metrics.peakRssMiB.toFixed(1)+" MiB, "+
   audit.runs[0].coverage.commonValidPixels+
   " original SCL-qualified pixels, fingerprint "+
   audit.runs[0].scientificFingerprint.slice(0,16));
}
const serial=report.runs[0].sourceAudit.runs[0],
 parallel=report.runs[1].sourceAudit.runs[0];
report.sameOriginalSourceIdsAndNumericResults=
 serial.scientificFingerprint===parallel.scientificFingerprint;
report.comparison={
 serialColdWallMs:serial.fullRequestWallMs,
 boundedDualColdWallMs:parallel.fullRequestWallMs,
 serialPeakRssMiB:serial.metrics.peakRssMiB,
 boundedDualPeakRssMiB:parallel.metrics.peakRssMiB,
 serialObservedPeakSourceJobs:serial.metrics.maxObservedConcurrentSourceJobs,
 boundedDualObservedPeakSourceJobs:parallel.metrics.maxObservedConcurrentSourceJobs,
 originalValidPixels:serial.coverage.commonValidPixels,
 identicalScientificFingerprint:report.sameOriginalSourceIdsAndNumericResults,
 observedWallSpeedup:serial.fullRequestWallMs/parallel.fullRequestWallMs,
 observedReductionPercent:100*(serial.fullRequestWallMs-parallel.fullRequestWallMs)/
   serial.fullRequestWallMs
};
report.status=report.sameOriginalSourceIdsAndNumericResults?
 "verified-original-source-ab":"scientific-source-mismatch";
await persist();
assert.equal(report.sameOriginalSourceIdsAndNumericResults,true,
 "Serial and paired COG scheduling must never change the original Sentinel measurements");
assert.equal(serial.metrics.maxObservedConcurrentSourceJobs,1,
 "Serial benchmark unexpectedly loaded more than one scene concurrently");
assert.ok(parallel.metrics.maxObservedConcurrentSourceJobs<=2&&
 parallel.metrics.maxObservedConcurrentSourceJobs>=1,
 "Dual-source benchmark exceeded source load ceiling");
console.log("PASS Stage 21 original 4x4 serial-vs-two-source A/B; "+
 report.comparison.observedReductionPercent.toFixed(1)+
 "% observed cold-time reduction (may be negative), "+
 report.comparison.originalValidPixels+" identical genuine pixels; report "+out);
