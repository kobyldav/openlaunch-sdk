/** Verify two SAME-calendar-month years and four actual Sentinel L2A
 * acquisitions above Prague, not artificial seasonal composites.
 * Called only after the Stage 11–13 genuine source checks; optional for
 * external provider outages, but an absent test is NOT reported as PASS.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
const cache=resolve("test-results/terrain-prague-stream-ci");
await mkdir(cache,{recursive:true});
const server=spawn(process.execPath,[
 fileURLToPath(new URL("./terrain-prague-stream.mjs",import.meta.url)),
 "--port","0","--no-open","--cache",cache
],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let stdout="",stderr="";
server.stderr.on("data",x=>stderr+=x.toString());
try{
 const origin=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error("Live interannual server unavailable: "+stderr)),20000);
   const onData=data=>{
     stdout+=data.toString();
     const port=stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
     if(port){clearTimeout(timer);server.stdout.off("data",onData);
       resolve("http://127.0.0.1:"+port[1]);}
   };
   server.stdout.on("data",onData);server.once("error",reject);
 });
 const attempts=[
   {before:2024,after:2025,month:8,cloud:50},
   {before:2023,after:2025,month:8,cloud:50},
   {before:2024,after:2025,month:7,cloud:60}
 ];
 let verified=null,lastError=null;
 for(const attempt of attempts){
   const query=new URLSearchParams(Object.fromEntries(
     Object.entries(attempt).map(([key,value])=>[key,String(value)])));
   try{
     const prefix=origin+"/api/observations/seasonal/scenes/0/3/3.json?"+query;
     const discovery=await fetch(prefix,{signal:AbortSignal.timeout(60000)});
     if(!discovery.ok)throw Error("Source discovery HTTP "+discovery.status+
       ": "+(await discovery.text()).slice(0,280));
     const catalog=await discovery.json();
     assert.equal(catalog.status,"real-sentinel-seasonal-catalog");
     assert.equal(catalog.key,"0-3-3");
     assert.equal(catalog.before.year,attempt.before);
     assert.equal(catalog.after.year,attempt.after);
     assert.equal(catalog.before.scenes.length,2);
     assert.equal(catalog.after.scenes.length,2);
     for(const group of [catalog.before,catalog.after]){
       assert.equal(new Set(group.scenes.map(s=>s.id)).size,2);
       for(const scene of group.scenes){
         assert.equal(new Date(scene.acquiredAt).getUTCFullYear(),group.year);
         assert.equal(new Date(scene.acquiredAt).getUTCMonth()+1,attempt.month);
       }
     }
     const product=origin+"/api/observations/seasonal/0/3/3/"+
       attempt.before+"/"+attempt.after+"/"+attempt.month;
     const response=await fetch(product+".json?cloud="+attempt.cloud,
       {signal:AbortSignal.timeout(240000)});
     if(!response.ok)throw Error("True yearly NDVI COG HTTP "+response.status+
       ": "+(await response.text()).slice(0,320));
     const data=await response.json();
     assert.equal(data.status,"real-sentinel-interannual-ndvi");
     assert.equal(data.version,1);
     assert.equal(data.key,"0-3-3");
     assert.equal(data.before.year,attempt.before);
     assert.equal(data.after.year,attempt.after);
     assert.equal(data.before.month,attempt.month);
     assert.equal(data.after.month,attempt.month);
     assert.equal(data.grid.crs,"EPSG:3857");
     assert.equal(data.qa.sameMonth,true);
     assert.equal(data.qa.medianPerYear,true);
     assert.equal(data.qa.pixelSclMasked,true);
     assert.equal(data.qa.noCloudGapFilling,true);
     assert.equal(data.qa.pairedPixelIntersection,true);
     assert.equal(data.terrainElevationUnchanged,true);
     assert.ok(data.statistics.overlapPixels>=16);
     assert.equal(data.statistics.increasedPixels+
       data.statistics.decreasedPixels+data.statistics.stablePixels,
       data.statistics.overlapPixels);
     for(const [result,selected] of [[data.before,catalog.before],
       [data.after,catalog.after]]){
       assert.deepEqual(result.scenes.map(s=>s.sceneId),
         selected.scenes.map(s=>s.id));
       assert.deepEqual(result.scenes.map(s=>s.acquiredAt),
         selected.scenes.map(s=>s.acquiredAt));
     }
     const n=data.width*data.height;
     const numeric=Buffer.from(data.deltaF32LE,"base64");
     const countBefore=Buffer.from(data.beforeCountB64,"base64"),
       countAfter=Buffer.from(data.afterCountB64,"base64");
     assert.equal(numeric.length,n*4);
     assert.equal(countBefore.length,n);assert.equal(countAfter.length,n);
     const floats=new Float32Array(numeric.buffer.slice(numeric.byteOffset,
       numeric.byteOffset+numeric.byteLength));
     assert.equal(floats.filter(Number.isFinite).length,
       data.statistics.overlapPixels);
     assert.equal(floats.filter(Number.isNaN).length,
       data.statistics.missingEitherPixels);
     assert.ok(countBefore.every(x=>x<=2));
     assert.ok(countAfter.every(x=>x<=2));
     const rendered=await fetch(product+".png?cloud="+attempt.cloud,
       {signal:AbortSignal.timeout(20000)});
     assert.equal(rendered.status,200);
     const bytes=Buffer.from(await rendered.arrayBuffer());
     assert.ok(bytes.length>100);
     assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
     verified={status:"real-sentinel-seasonal-verified",selection:attempt,
       before:data.before,after:data.after,statistics:data.statistics,
       qa:data.qa,source:data.source,grid:data.grid,
       terrainElevationUnchanged:true,
       note:"Four authentic Sentinel-2 source COG scenes from identical calendar month in two different years; no invented spectral pixels"};
     break;
   }catch(error){
     lastError=error;
     console.error("Interannual genuine COG candidate unavailable "+
       JSON.stringify(attempt)+": "+error);
   }
 }
 if(!verified)throw Error("No verified pair of years and real scenes: "+lastError);
 await writeFile(join(cache,"seasonal-live-report.json"),JSON.stringify(verified,null,2));
 const stats=verified.statistics;
 console.log("PASS genuine same-month interannual Sentinel-2 Prague ΔNDVI: "+
   verified.before.year+"-"+verified.before.month+" → "+verified.after.year+"-"+
   verified.after.month+", "+stats.overlapPixels+" common actual pixels ("+
   stats.overlapPercent.toFixed(2)+" %), "+stats.robustTwoPerYearPixels+
   " pixels with two genuine clear observations per year, Δmean "+
   stats.meanDeltaNdvi.toFixed(5)+
   " NDVI; all 4 original source COG scenes verified and cached");
}finally{server.kill();}
