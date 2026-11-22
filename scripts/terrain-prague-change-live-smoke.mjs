/** Live Stage 12 proof: compare TWO real Czech Sentinel-2 acquisitions.
 * Reuses a verified newer STAC scene and its source-qualified NDVI raster
 * from the Stage 11 live test; retrieves a separate historical source scene.
 * Reports no result if external COGs are unavailable or overlap is insufficient.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
const cache=resolve("test-results/terrain-prague-stream-ci");
await mkdir(cache,{recursive:true});
const latest=JSON.parse(await readFile(join(cache,"observations-live-report.json"),"utf8"));
assert.equal(latest.status,"real-sentinel-verified");
const server=spawn(process.execPath,[
 fileURLToPath(new URL("./terrain-prague-stream.mjs",import.meta.url)),
 "--port","0","--no-open","--cache",cache
],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let stdout="",stderr="";
server.stderr.on("data",x=>stderr+=x.toString());
try{
 const origin=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error("Stage12 server did not start "+stderr)),20000);
   const output=x=>{
     stdout+=x.toString();
     const m=stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
     if(m){clearTimeout(timer);server.stdout.off("data",output);
       resolve("http://127.0.0.1:"+m[1]);}
   };
   server.stdout.on("data",output);
   server.once("error",reject);
 });
 const tile="0/3/3";
 const catalogResponse=await fetch(origin+"/api/observations/scenes/"+tile+
   ".json?from=2025-08-01&to=2025-08-31&cloud=35",
   {signal:AbortSignal.timeout(50000)});
 assert.equal(catalogResponse.status,200);
 const catalog=await catalogResponse.json();
 const candidates=catalog.scenes.filter(s=>s.id!==latest.sceneId&&
   Date.parse(s.acquiredAt)<Date.parse(latest.acquiredAt))
   .sort((a,b)=>(a.cloudPercent??100)-(b.cloudPercent??100)).slice(0,3);
 assert.ok(candidates.length>0,"No separate dated real STAC scene in test range");
 let result=null,lastError=null;
 for(const older of candidates){
   const path="/api/observations/compare/"+tile+"/"+older.id+"/"+latest.sceneId;
   try{
     const response=await fetch(origin+path+".json",
       {signal:AbortSignal.timeout(150000)});
     if(!response.ok)throw Error("Real dual-source API HTTP "+response.status+
       ": "+(await response.text()).slice(0,270));
     const meta=await response.json();
     assert.equal(meta.status,"real-sentinel-ndvi-comparison");
     assert.equal(meta.version,1);
     assert.equal(meta.key,"0-3-3");
     assert.equal(meta.before.sceneId,older.id);
     assert.equal(meta.after.sceneId,latest.sceneId);
     assert.equal(meta.qa.sameGrid,true);
     assert.equal(meta.qa.bothSclMasked,true);
     assert.equal(meta.terrainElevationUnchanged,true);
     assert.ok(meta.statistics.overlapPixels>=16);
     assert.ok(meta.statistics.overlapPixels<=meta.statistics.totalPixels);
     assert.equal(meta.statistics.increasedPixels+
       meta.statistics.decreasedPixels+meta.statistics.stablePixels,
       meta.statistics.overlapPixels);
     const raw=Buffer.from(meta.deltaF32LE,"base64");
     assert.equal(raw.byteLength,meta.width*meta.height*4);
     const diff=new Float32Array(raw.buffer.slice(raw.byteOffset,
       raw.byteOffset+raw.byteLength));
     assert.equal(diff.filter(Number.isFinite).length,meta.statistics.overlapPixels);
     const png=await fetch(origin+path+".png",
       {signal:AbortSignal.timeout(20000)});
     assert.equal(png.status,200);
     const bytes=Buffer.from(await png.arrayBuffer());
     assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
     result=meta;break;
   }catch(error){
     lastError=error;console.error("Unusable historical Sentinel pair: "+
       older.id+" "+error);
   }
 }
 if(!result)throw Error("No comparable actual historical scene: "+lastError);
 const proof={status:"real-sentinel-change-verified",
   key:result.key,before:result.before,after:result.after,
   statistics:result.statistics,qa:result.qa,
   source:result.source,terrainElevationUnchanged:true,
   note:"Two original Sentinel-2 L2A COGs, independently masked, exact EPSG:3857 grid and numeric delta (not color difference)."};
 await writeFile(join(cache,"changes-live-report.json"),JSON.stringify(proof,null,2));
 console.log("PASS real paired Sentinel-2 Prague ΔNDVI: "+
   result.before.acquiredAt+" -> "+result.after.acquiredAt+
   "; "+result.statistics.overlapPixels+" jointly valid pixels / "+
   result.statistics.totalPixels+", Δmean "+result.statistics.meanDeltaNdvi+
   ", gains "+result.statistics.increasedPixels+
   ", losses "+result.statistics.decreasedPixels+
   ", all source-calibrated/cloud-masked, no synthetic data");
}finally{server.kill();}
