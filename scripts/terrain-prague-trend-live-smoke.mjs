/** Source-backed 3+ actual Sentinel-2 multi-date NDVI time series.
 * No scene provenance, measured numeric raster, or valid cloud-masked
 * three-source overlap => no trend and no screenshot can be published.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
const cache=resolve("test-results/terrain-prague-stream-ci");
await mkdir(cache,{recursive:true});
const pair=JSON.parse(await readFile(join(cache,"changes-live-report.json"),"utf8"));
assert.equal(pair.status,"real-sentinel-change-verified");
const server=spawn(process.execPath,[
 fileURLToPath(new URL("./terrain-prague-stream.mjs",import.meta.url)),
 "--port","0","--no-open","--cache",cache
],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let stdout="",stderr="";
server.stderr.on("data",x=>stderr+=x.toString());
try{
 const origin=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error("Sentinel trend server startup: "+stderr)),20000);
   const onData=data=>{
     stdout+=data.toString();
     const m=stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
     if(m){clearTimeout(timeout);server.stdout.off("data",onData);
       resolve("http://127.0.0.1:"+m[1]);}
   };
   server.stdout.on("data",onData);server.once("error",reject);
 });
 const tile="0/3/3";
 // Search independent date windows on the same Prague tile. Source scenes
 // remain qualified by existing SDK STAC & public COG HTTPS host allowlist.
 const catalogs=[];
 for(const [from,to] of [["2025-08-01","2025-08-31"],["2025-08-01","2025-08-15"]]){
   const response=await fetch(origin+"/api/observations/scenes/"+tile+
     ".json?from="+from+"&to="+to+"&cloud=35",
     {signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error("Historical STAC catalog HTTP "+response.status+
     " "+(await response.text()).slice(0,240));
   const found=await response.json();
   assert.equal(found.status,"real-sentinel-catalog");
   catalogs.push(...found.scenes);
 }
 const seen=new Set();
 const options=catalogs.filter(x=>{
   if(seen.has(x.id))return false;seen.add(x.id);return true;
 }).filter(scene=>scene.id!==pair.before.sceneId&&
   scene.id!==pair.after.sceneId&&
   Number.isFinite(Date.parse(scene.acquiredAt)));
 const base=[pair.before,pair.after].map(s=>s.sceneId);
 const dateBase=[Date.parse(pair.before.acquiredAt),
   Date.parse(pair.after.acquiredAt)];
 const compatible=options.filter(s=>{
   const dates=[...dateBase,Date.parse(s.acquiredAt)];
   return (Math.max(...dates)-Math.min(...dates))/86400000>=14;
 }).sort((a,b)=>(a.cloudPercent??101)-(b.cloudPercent??101));
 assert.ok(compatible.length>0,"No third source-qualified acquisition expands observed span to 14 days");
 let accepted=null,lastError=null;
 for(const third of compatible.slice(0,4)){
   const ids=[...base,third.id].sort((a,b)=>{
     const byId=new Map([pair.before,pair.after,third].map(s=>[
       s.sceneId??s.id,s.acquiredAt
     ]));
     return Date.parse(byId.get(a))-Date.parse(byId.get(b));
   });
   const uri=origin+"/api/observations/trend/"+tile+"/"+ids.join(",");
   try{
     const response=await fetch(uri+".json",{signal:AbortSignal.timeout(200000)});
     if(!response.ok)throw Error("Trend HTTP "+response.status+" "+
       (await response.text()).slice(0,250));
     const result=await response.json();
     assert.equal(result.status,"real-sentinel-ndvi-time-series");
     assert.equal(result.version,1);
     assert.equal(result.key,"0-3-3");
     assert.equal(result.scenes.length,3);
     assert.deepEqual(result.scenes.map(s=>s.sceneId),ids);
     assert.ok(result.statistics.spanDays>=14);
     assert.equal(result.qa.allSclMasked,true);
     assert.equal(result.qa.sameGrid,true);
     assert.equal(result.qa.fixedCommonPixelPopulation,true);
     assert.equal(result.qa.theilSen,true);
     assert.equal(result.terrainElevationUnchanged,true);
     assert.ok(result.statistics.commonValidPixels>=16);
     assert.equal(result.statistics.increasingPixels+
       result.statistics.decreasingPixels+result.statistics.stablePixels,
       result.statistics.commonValidPixels);
     const raw=Buffer.from(result.slopeF32LE,"base64");
     assert.equal(raw.byteLength,result.width*result.height*4);
     const slopes=new Float32Array(raw.buffer.slice(raw.byteOffset,
       raw.byteOffset+raw.byteLength));
     assert.equal(slopes.filter(Number.isFinite).length,
       result.statistics.commonValidPixels);
     const png=await fetch(uri+".png",{signal:AbortSignal.timeout(20000)});
     assert.equal(png.status,200);
     const bytes=Buffer.from(await png.arrayBuffer());
     assert.ok(bytes.length>100);
     assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
     accepted=result;break;
   }catch(error){lastError=error;console.error("Unusable dated 3-scene source "+third.id+": "+error);}
 }
 if(!accepted)throw Error("All source-qualified three-date trends failed: "+lastError);
 const report={status:"real-sentinel-trend-verified",key:accepted.key,
   sceneIds:accepted.scenes.map(x=>x.sceneId),scenes:accepted.scenes,
   statistics:accepted.statistics,source:accepted.source,qa:accepted.qa,
   terrainElevationUnchanged:accepted.terrainElevationUnchanged,
   note:"At least three actual different-date STAC+COG scenes, all-pixel intersection and source-float Theil-Sen; no synthetic fallbacks"};
 await writeFile(join(cache,"trends-live-report.json"),JSON.stringify(report,null,2));
 console.log("PASS real 3-date Sentinel Prague NDVI Theil-Sen: "+
   accepted.scenes.map(x=>x.acquiredAt.slice(0,10)).join(" -> ")+
   ", "+accepted.statistics.commonValidPixels+" common clear pixels / "+
   accepted.statistics.totalPixels+
   ", span "+accepted.statistics.spanDays.toFixed(1)+" days, observed "+
   accepted.statistics.meanSlopePer30Days.toFixed(6)+
   " NDVI per 30d, original real scenes only");
}finally{server.kill();}
