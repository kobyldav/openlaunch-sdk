/** No live network or fabricated Sentinel COGs. The local Stage 16 server
 * must return real missing-data states when invoked with an empty offline cache.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

test("Stage 16: offline regional NDJSON has bounded ordered tile events and honest NoData",{
 timeout:45000
},async()=>{
 const folder=await mkdtemp(join(tmpdir(),"openlaunch-region-"));
 const server=spawn(process.execPath,[
   fileURLToPath(new URL("../scripts/terrain-prague-stream.mjs",import.meta.url)),
   "--port","0","--no-open","--offline","--cache",folder
 ],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="";
 server.stderr.on("data",d=>stderr+=d.toString());
 try{
   const origin=await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error("Regional localhost startup timeout: "+stderr)),18000);
     server.once("error",error=>{clearTimeout(timer);reject(error);});
     server.once("exit",code=>{clearTimeout(timer);reject(Error("Server exited "+code+": "+stderr));});
     server.stdout.on("data",chunk=>{
       stdout+=chunk.toString();
       const matched=stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
       if(matched){clearTimeout(timer);resolve("http://127.0.0.1:"+matched[1]);}
     });
   });
   const invalid=await fetch(origin+"/api/observations/multiyear/region.ndjson?"+
     "x=5&y=5&cols=4&rows=4&from=2023&to=2025&month=8");
   assert.equal(invalid.status,400);
   const excessive=await fetch(origin+"/api/observations/multiyear/region.ndjson?"+
     "x=2&y=2&cols=2&rows=2&from=2023&to=2025&month=8&rssLimitMiB=128");
   assert.equal(excessive.status,400,
     "Regional budget below the 256 MiB lower bound must be rejected");
   const response=await fetch(origin+"/api/observations/multiyear/region.ndjson?"+
     "x=2&y=2&cols=2&rows=2&from=2023&to=2025&month=8&cloud=50");
   assert.equal(response.status,200);
   assert.match(response.headers.get("content-type"),/ndjson/);
   const txt=await response.text();
   const items=txt.trim().split("\n").map(line=>JSON.parse(line));
   assert.equal(items.length,7);
   assert.equal(items[0].type,"start");
   assert.equal(items[1].type,"source-lock");
   assert.equal(items[1].status,"unavailable");
   assert.match(items[1].reason,/No real Sentinel catalog is cached/);
   assert.deepEqual(items.slice(2,6).map(e=>e.type),Array(4).fill("tile"));
   assert.deepEqual(items.slice(2,6).map(e=>e.tile.key),
     ["0-2-2","0-3-2","0-2-3","0-3-3"]);
   for(const event of items.slice(2,6)){
     assert.equal(event.tile.status,"error");
     assert.match(event.tile.reason,/No real Sentinel catalog is cached/);
     assert.equal(event.tile.commonValidPixels,null);
     assert.equal(event.metrics.key,event.tile.key);
     assert.equal(event.metrics.sourceCache,"unavailable");
     assert.ok(event.metrics.durationMs>=0);
     assert.ok(event.metrics.rssBytes>0);
     assert.ok(event.metrics.heapUsedBytes>0);
   }
   const finished=items[6];
   assert.equal(finished.type,"complete");
   assert.equal(finished.result.regionFullyAnalyzed,false);
   assert.equal(finished.result.sourceLockId,null);
   assert.equal(finished.result.sourceSelectionStatus,"unavailable");
   assert.deepEqual(finished.result.lockedSourceYears,[]);
   assert.equal(finished.result.commonValidPixels,0);
   assert.equal(finished.result.analyzedPixels,0);
   assert.equal(finished.result.requestedTiles,4);
   assert.equal(finished.result.pendingTiles,0);
   assert.equal(finished.result.meanSlopeOnObservedPixels,null);
   assert.deepEqual(finished.result.seams,[],
     "No edge metrics may be invented if all source rasters are missing");
   assert.equal(finished.result.seamWarningCount,0);
   assert.match(finished.result.seamDiagnostics,/no interpolation/);

   assert.equal(finished.result.percentValidWithinAnalyzedTiles,null);
   const q=finished.result.quality;
   assert.equal(q.status,"real-sentinel-region-runtime-quality");
   assert.equal(q.version,1);
   assert.equal(q.requestedTiles,4);
   assert.equal(q.measuredTileCount,4);
   assert.equal(q.rasterCacheHits,0);
   assert.equal(q.rasterCacheMisses,0);
   assert.equal(q.rasterCacheUnavailable,4);
   assert.equal(q.wholeRegionSclPixelCoveragePercent,null);
   assert.equal(q.outcome,"no-observed-tiles");
   assert.equal(q.analyzedTilePercent,0);
   assert.ok(q.elapsedMs>=0);
   assert.ok(q.peakRssMiB>0);
   assert.ok(q.peakHeapUsedMiB>0);
   assert.equal(q.samplingIntervalMs,100);
   assert.equal(q.memorySoftLimitMiB,1536);
   assert.equal(q.scenePairConcurrency,2);
   assert.equal(q.maxObservedConcurrentSourceJobs,0,
     "Offline absent-source region cannot have fabricated active Sentinel reads");
   assert.match(q.sourceLoadPolicy,/two genuine source acquisitions/);
   assert.equal(q.cogRangeCache.maxResidentMiB,64);
   assert.equal(q.cogRangeCache.rangeCacheHits,0);
   assert.equal(q.cogRangeCache.httpRequests,0);
   assert.equal(q.cogRangeCache.httpBytesRead,0);
   assert.equal(q.cogRangeCache.verifiedObjects,0);
   assert.equal(q.cogRangeCache.reusedBytes,0,
     "Offline absent sources cannot claim HTTP transfers or original ETag reuse");

   const page=await (await fetch(origin+"/")).text();
   assert.match(page,/id="region-coverage"/);
   assert.match(page,/async function runRegionCoverage/);
   assert.match(page,/region\.ndjson/);
 }finally{
   server.kill();
   await rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});
