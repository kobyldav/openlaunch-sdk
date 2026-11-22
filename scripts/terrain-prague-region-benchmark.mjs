/** Stage 20: bounded REAL 4×4 source coverage + runtime/cache repeat audit.
 * Default OFFLINE: only stored source products qualify, never synthetic COGs.
 * --live intentionally downloads original STAC/COG data and can take time.
 * Every repetition starts a fresh Node server to test persistent cache reuse.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";

const args=process.argv.slice(2);
const arg=(key,def)=>{const i=args.indexOf("--"+key);return i<0?def:args[i+1];};
const numeric=(key,def)=>Number(arg(key,String(def)));
const live=args.includes("--live"),offline=!live;
const x=numeric("x",1),y=numeric("y",1),cols=numeric("cols",4),rows=numeric("rows",4),
 from=numeric("from",2023),to=numeric("to",2025),
 month=numeric("month",8),cloud=numeric("cloud",50),
 repeat=numeric("repeat",2),rssLimitMiB=numeric("rss-limit-mib",1536),
 scenePairConcurrency=numeric("scene-pair-concurrency",2),
 cogRangeCacheMiB=numeric("cog-range-cache-mib",64),
 timeoutMs=numeric("timeout-ms",live?900000:60000);
const cache=resolve(arg("cache","test-results/terrain-prague-stream-cache"));
const output=resolve(arg("output","test-results/terrain-prague-region-4x4-benchmark.json"));
if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(cols)||!Number.isInteger(rows)||
 x<0||y<0||cols<1||rows<1||cols>4||rows>4||cols*rows>16||
 x+cols>6||y+rows>6||!Number.isInteger(from)||!Number.isInteger(to)||
 from<2017||to>2100||to-from<2||to-from>4||
 !Number.isInteger(month)||month<1||month>12||
 !Number.isFinite(cloud)||cloud<0||cloud>100||
 !Number.isInteger(repeat)||repeat<1||repeat>4||
 !Number.isInteger(rssLimitMiB)||rssLimitMiB<256||rssLimitMiB>8192||
 ![1,2].includes(scenePairConcurrency)||
 !Number.isInteger(cogRangeCacheMiB)||cogRangeCacheMiB<0||cogRangeCacheMiB>128||
 !Number.isInteger(timeoutMs)||timeoutMs<10000||timeoutMs>3600000)
 throw new RangeError("Benchmark requires 1..4x1..4 Prague tiles, 3..5 years, repeat 1..4, bounded memory/time");

const report={status:"incomplete",mode:live?"live-original-STAC-COG":"offline-original-cache-only",
 area:{x,y,cols,rows},season:{from,to,month,cloud},
 repeat,rssLimitMiB,timeoutMs,scenePairConcurrency,cogRangeCacheMiB,
 note:"All timing and Node RSS/heap counters are actual measured values, not reference numbers. Missing original source tiles never count as valid observations.",
 runs:[]};
await mkdir(dirname(output),{recursive:true});
async function persist(){await writeFile(output,JSON.stringify(report,null,2));}
const requestPath="/api/observations/multiyear/region.ndjson?"+
 new URLSearchParams({x:String(x),y:String(y),cols:String(cols),rows:String(rows),
 from:String(from),to:String(to),month:String(month),cloud:String(cloud),
 rssLimitMiB:String(rssLimitMiB)});
const fingerprint=result=>{
 const source={lock:result.sourceLockId,status:result.sourceSelectionStatus,
  tiles:result.tiles.map(t=>({key:t.key,status:t.status,
   commonValidPixels:t.commonValidPixels,robustAllYearsPixels:t.robustAllYearsPixels,
   meanSlopeNdviPerYear:t.meanSlopeNdviPerYear,sourceScenes:t.sourceScenes??null})),
  annual:result.years,seams:result.seams};
 return createHash("sha256").update(JSON.stringify(source)).digest("hex");
};
async function withServer(fn){
 const child=spawn(process.execPath,[
   fileURLToPath(new URL("./terrain-prague-stream.mjs",import.meta.url)),
   "--port","0","--no-open","--cache",cache,
   "--scene-pair-concurrency",String(scenePairConcurrency),
   "--cog-range-cache-mib",String(cogRangeCacheMiB),
   ...(offline?["--offline"]:[])
 ],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="";
 child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});
 try{
  const origin=await new Promise((res,rej)=>{
   const timeout=setTimeout(()=>rej(Error("Source-only stream server startup timeout: "+stderr)),20000);
   let found=false;
   const onData=chunk=>{
    stdout+=chunk.toString();
    const match=stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if(match&&!found){found=true;clearTimeout(timeout);res("http://127.0.0.1:"+match[1]);}
   };
   child.stdout.on("data",onData);
   child.once("error",e=>{clearTimeout(timeout);rej(e);});
   child.once("exit",c=>{if(!found){clearTimeout(timeout);rej(Error("Server exited "+c+": "+stderr));}});
  });
  return await fn(origin);
 }finally{
  child.kill();
 }
}
try{
 for(let iteration=1;iteration<=repeat;iteration++){
  const started=performance.now();
  const result=await withServer(async origin=>{
   const response=await fetch(origin+requestPath,{signal:AbortSignal.timeout(timeoutMs)});
   if(!response.ok)throw Error("Region HTTP "+response.status+" "+(await response.text()).slice(0,250));
   assert.match(response.headers.get("content-type"),/ndjson/);
   const text=await response.text();
   assert.ok(text.length<2000000,"Only bounded source summaries, not entire source rasters, may be streamed");
   const events=text.trim().split("\n").map(v=>JSON.parse(v));
   assert.equal(events[0]?.type,"start");
   assert.equal(events[1]?.type,"source-lock");
   assert.equal(events.at(-1)?.type,"complete");
   const tiles=events.filter(e=>e.type==="tile");
   const complete=events.at(-1).result;
   assert.equal(tiles.length,cols*rows);
   assert.equal(complete.requestedTiles,cols*rows);
   assert.equal(complete.pendingTiles,0);
   assert.equal(complete.processedTiles,cols*rows);
   assert.deepEqual(tiles.map(e=>e.tile.key),complete.tiles.map(t=>t.key));
   assert.equal(complete.quality?.status,"real-sentinel-region-runtime-quality");
   assert.equal(complete.quality?.measuredTileCount,cols*rows);
   assert.equal(complete.quality?.scenePairConcurrency,scenePairConcurrency);
   const range=complete.quality?.cogRangeCache;
   assert.ok(range&&range.maxResidentMiB===cogRangeCacheMiB);
   assert.ok(range.residentMiB<=cogRangeCacheMiB);
   assert.ok(Number.isInteger(range.httpRequests)&&range.httpRequests>=0);
   assert.ok(Number.isInteger(range.rangeCacheHits)&&range.rangeCacheHits>=0);
   assert.ok(Number.isInteger(range.httpBytesRead)&&range.httpBytesRead>=0);
   assert.ok(range.rangeCacheHits===0||cogRangeCacheMiB>0);
   assert.ok(complete.quality.maxObservedConcurrentSourceJobs<=2);
   assert.ok(complete.quality.maxObservedConcurrentSourceJobs>=0);
   assert.ok(complete.quality.peakRssMiB>0);
   assert.ok(complete.quality.elapsedMs>=0);
   assert.equal(complete.quality.analyzedTiles,complete.analyzedTiles);
   assert.equal(complete.quality.rasterCacheHits+
     complete.quality.rasterCacheMisses+complete.quality.rasterCacheUnavailable,
     cols*rows);
   assert.ok(events.every(e=>e.type!=="seam"||e.seam.state));
   assert.equal(complete.quality.wholeRegionSclPixelCoveragePercent===null,
     !complete.regionFullyAnalyzed);
   if(complete.sourceLockId){
    assert.match(complete.sourceLockId,/^[a-f0-9]{32}$/);
    for(const tile of complete.tiles.filter(t=>t.status==="analyzed")){
     assert.deepEqual(tile.sourceScenes.map(g=>g.scenes.map(s=>s.sceneId)),
       complete.lockedSourceYears.map(g=>g.scenes.map(s=>s.id)));
    }
   }
   return complete;
  });
  const record={iteration,fullRequestWallMs:Math.round((performance.now()-started)*1000)/1000,
   coverage:{requestedTiles:result.requestedTiles,analyzedTiles:result.analyzedTiles,
    insufficientTiles:result.insufficientTiles,errorTiles:result.errorTiles,
    regionFullyAnalyzed:result.regionFullyAnalyzed,
    sourceSelectionStatus:result.sourceSelectionStatus,
    sourceLockId:result.sourceLockId,
    commonValidPixels:result.commonValidPixels,
    wholeRegionSclCoveragePercent:result.quality.wholeRegionSclPixelCoveragePercent,
    fractionMeasuredTiles:result.quality.analyzedTilePercent},
   metrics:result.quality,
   scientificFingerprint:fingerprint(result)};
  report.runs.push(record);
  report.status="partially-measured";
  await persist();
  console.log("Stage 20 "+iteration+"/"+repeat+": "+
   record.coverage.analyzedTiles+"/"+record.coverage.requestedTiles+
   " source-backed tiles, source concurrency "+scenePairConcurrency+", COG range cache "+cogRangeCacheMiB+"MiB, "+record.coverage.commonValidPixels+
   " truly observed common pixels; "+record.fullRequestWallMs.toFixed(0)+
   "ms wall, "+record.metrics.peakRssMiB.toFixed(1)+
   " MiB sampled server RSS; raster cache "+record.metrics.rasterCacheHits+
   " hits/"+record.metrics.rasterCacheMisses+" misses; "+record.scientificFingerprint.slice(0,12));
 }
 const first=report.runs[0],same=report.runs.every(r=>
   r.scientificFingerprint===first.scientificFingerprint);
 report.scientificResultsIdenticalAcrossRestarts=same;
 report.completion=first.coverage.regionFullyAnalyzed?
   "all-requested-tiles-verified":"partial-or-zero-original-observations";
 report.status=same?"completed-source-faithful":"unstable-scientific-replay";
 report.note+=" RSS peaks are sampled process-wide and exclude browser GPU. Disk and network traffic are not measured. Faster cache replay is NOT assumed; durations are measured independently.";
 await persist();
 assert.ok(same,"Identical historical tile results must remain stable across fresh-server cache replays");
 if(args.includes("--require-complete"))
  assert.ok(report.runs.every(r=>r.coverage.regionFullyAnalyzed),
   "Strict 4x4 live benchmark requires real original Sentinel observations in all 16 tiles");
 if(args.includes("--require-cached-replay")&&repeat>1)
  assert.ok(report.runs.slice(1).every(r=>
   r.metrics.rasterCacheHits===r.coverage.analyzedTiles),
   "Every analyzed source product in the second run must come from the persisted genuine cache");
 console.log("PASS Stage 20 measured "+cols+"×"+rows+
  " Prague regional stream across "+repeat+" fresh Node processes; "+
  (report.completion==="all-requested-tiles-verified"?
   "all original-source tiles verified":"missing source tiles explicitly unobserved")+
  "; report "+output);
}catch(error){
 report.status="failed";
 report.error=String(error?.stack??error).slice(0,1800);
 await persist();
 throw error;
}
