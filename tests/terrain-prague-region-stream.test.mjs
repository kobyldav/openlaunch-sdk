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
   const response=await fetch(origin+"/api/observations/multiyear/region.ndjson?"+
     "x=2&y=2&cols=2&rows=2&from=2023&to=2025&month=8&cloud=50");
   assert.equal(response.status,200);
   assert.match(response.headers.get("content-type"),/ndjson/);
   const txt=await response.text();
   const items=txt.trim().split("\n").map(line=>JSON.parse(line));
   assert.equal(items.length,6);
   assert.equal(items[0].type,"start");
   assert.deepEqual(items.slice(1,5).map(e=>e.type),Array(4).fill("tile"));
   assert.deepEqual(items.slice(1,5).map(e=>e.tile.key),
     ["0-2-2","0-3-2","0-2-3","0-3-3"]);
   for(const event of items.slice(1,5)){
     assert.equal(event.tile.status,"error");
     assert.match(event.tile.reason,/No real Sentinel catalog is cached/);
     assert.equal(event.tile.commonValidPixels,null);
   }
   const finished=items[5];
   assert.equal(finished.type,"complete");
   assert.equal(finished.result.regionFullyAnalyzed,false);
   assert.equal(finished.result.commonValidPixels,0);
   assert.equal(finished.result.analyzedPixels,0);
   assert.equal(finished.result.requestedTiles,4);
   assert.equal(finished.result.pendingTiles,0);
   assert.equal(finished.result.meanSlopeOnObservedPixels,null);
   assert.equal(finished.result.percentValidWithinAnalyzedTiles,null);
   const page=await (await fetch(origin+"/")).text();
   assert.match(page,/id="region-coverage"/);
   assert.match(page,/async function runRegionCoverage/);
   assert.match(page,/region\.ndjson/);
 }finally{
   server.kill();
   await rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});
