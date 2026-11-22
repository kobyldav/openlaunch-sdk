/** Network integration: real dated Sentinel-2 Earth Search L2A scene,
 * 5 source COG windows, SCL-masked calibrated NDVI and authentic RGB pixels.
 * Can be skipped on third-party outages; it never synthesizes a missing scene.
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
const origin=await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error("Real Sentinel server did not start: "+stderr)),20000);
 const onData=data=>{
   stdout+=data.toString();
   const found=stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
   if(found){clearTimeout(timer);server.stdout.off("data",onData);
     resolve("http://127.0.0.1:"+found[1]);}
 };
 server.stdout.on("data",onData);
 server.once("error",error=>{clearTimeout(timer);reject(error);});
});
try{
 const tile="0/3/3",from="2025-08-01",to="2025-08-31";
 const uri=origin+"/api/observations/scenes/"+tile+
   ".json?from="+from+"&to="+to+"&cloud=35";
 const query=await fetch(uri,{signal:AbortSignal.timeout(55000)});
 if(!query.ok)throw Error("Real Earth Search catalog HTTP "+
   query.status+": "+(await query.text()).slice(0,350));
 const catalog=await query.json();
 assert.equal(catalog.status,"real-sentinel-catalog");
 assert.equal(catalog.key,"0-3-3");
 assert.ok(catalog.scenes.length>0,"No cloud-qualified Sentinel-2 scene exists for test AOI/date");
 let lastError=null,confirmed=null;
 for(const scene of catalog.scenes.slice(0,3)){
   const base=origin+"/api/observations/"+tile+"/"+encodeURIComponent(scene.id);
   try{
     const res=await fetch(base+".json",{signal:AbortSignal.timeout(180000)});
     if(!res.ok)throw Error("Sentinel COG HTTP "+res.status+" "+
       (await res.text()).slice(0,300));
     const data=await res.json();
     assert.equal(data.status,"real-sentinel2-observation");
     assert.equal(data.version,1);
     assert.equal(data.key,"0-3-3");
     assert.equal(data.sceneId,scene.id);
     assert.equal(data.terrainElevationUnchanged,true);
     assert.equal(data.qa.sclMask,true);
     assert.ok(data.qa.calibration.red.scale>0);
     assert.ok(data.qa.calibration.nir.scale>0);
     assert.ok(data.statistics.validPixels>8);
     assert.ok(data.statistics.ndviMin>=-1&&data.statistics.ndviMax<=1);
     const [rgb,ndvi]=await Promise.all([
       fetch(base+".rgb.png",{signal:AbortSignal.timeout(25000)}),
       fetch(base+".ndvi.png",{signal:AbortSignal.timeout(25000)})
     ]);
     assert.equal(rgb.status,200);assert.equal(ndvi.status,200);
     for(const res of [rgb,ndvi]){
       const bytes=Buffer.from(await res.arrayBuffer());
       assert.ok(bytes.length>100);
       assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
     }
     confirmed=data;break;
   }catch(error){lastError=error;console.error("Source scene unavailable: "+scene.id+" "+error);}
 }
 if(!confirmed)throw Error("Every tested live Sentinel scene failed: "+lastError);
 const report={status:"real-sentinel-verified",
   sceneId:confirmed.sceneId,acquiredAt:confirmed.acquiredAt,
   source:confirmed.source,statistics:confirmed.statistics,
   qa:confirmed.qa,region:confirmed.area,
   note:"Only real Earth Search STAC and source COG raster reads; no synthetic fallback."};
 await writeFile(join(cache,"observations-live-report.json"),JSON.stringify(report,null,2));
 console.log("PASS real Sentinel-2 Prague RGB+NDVI: "+confirmed.sceneId+
   " acquired "+confirmed.acquiredAt+
   ", "+confirmed.statistics.validPixels+" real SCL accepted pixels"+
   ", calibrated NDVI mean "+confirmed.statistics.ndviMean+
   ", one true scene + authentic RGBA PNGs in disk cache");
}finally{server.kill();}
