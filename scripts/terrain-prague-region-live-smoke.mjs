/** Stage 18 strict live proof: TWO adjacent measured Sentinel multi-year tiles.
 * No source fabrication, no percentile-only proof and no assumed "seam fix".
 * The current region may legitimately fail if original COG sources are offline.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";

const folder=resolve("test-results/terrain-prague-stream-ci");
await mkdir(folder,{recursive:true});
const known=JSON.parse(await readFile(join(folder,"multiyear-live-report.json"),"utf8"));
assert.equal(known.status,"real-sentinel-multiyear-verified",
 "Stage 18 cannot reuse an unverified Stage 15 baseline");
const selection=known.selection;
const server=spawn(process.execPath,[
 fileURLToPath(new URL("./terrain-prague-stream.mjs",import.meta.url)),
 "--port","0","--no-open","--cache",folder
],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let stderr="",stdout="",origin;
server.stderr.on("data",chunk=>stderr+=chunk.toString().slice(0,1200));
let terminalReport={status:"source-unavailable",selection,requestedTiles:["0-3-3","0-4-3"]};
try{
 origin=await new Promise((res,rej)=>{
   const timer=setTimeout(()=>rej(Error("Regional Prague server startup timeout: "+stderr)),20000);
   const onData=data=>{
     stdout+=data.toString();
     const match=stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
     if(match){clearTimeout(timer);server.stdout.off("data",onData);
       res("http://127.0.0.1:"+match[1]);}
   };
   server.stdout.on("data",onData);
   server.once("error",rej);
   server.once("exit",code=>{clearTimeout(timer);
     rej(Error("Region server exited "+code+": "+stderr));});
 });
 const query=new URLSearchParams({
   x:"3",y:"3",cols:"2",rows:"1",
   from:String(selection.from),to:String(selection.to),
   month:String(selection.month),cloud:String(selection.cloud)
 });
 const response=await fetch(origin+"/api/observations/multiyear/region.ndjson?"+query,
   {signal:AbortSignal.timeout(300000)});
 assert.equal(response.status,200,"Regional genuine source HTTP "+response.status);
 const ndjson=await response.text();
 assert.ok(ndjson.length<800000,"Only source metadata and thin seam QA may be streamed");
 const events=ndjson.trim().split("\n").map(line=>JSON.parse(line));
 assert.equal(events[0].type,"start");
 assert.deepEqual(events[0].tiles.map(t=>t.key),["0-3-3","0-4-3"]);
 assert.equal(events.at(-1).type,"complete");
 const result=events.at(-1).result;
 assert.equal(result.requestedTiles,2);
 assert.equal(result.processedTiles,2);
 terminalReport={...terminalReport,coverage:result,
   sourceEvents:events.filter(e=>e.type==="tile"||e.type==="seam")};
 await writeFile(join(folder,"region-adjacent-live-report.json"),
   JSON.stringify(terminalReport,null,2));
 assert.equal(result.analyzedTiles,2,
   "Two adjacent tiles MUST have real Sentinel observations; no false 2-tile proof");
 assert.equal(result.regionFullyAnalyzed,true);
 assert.equal(result.tiles.every(t=>t.status==="analyzed"),true);
 assert.equal(result.seams?.length,1,"A genuine adjacent edge check is required");
 assert.equal(events.filter(e=>e.type==="seam").length,1,
   "Cross-tile edge diagnostics must stream as a separate real result");
 const seam=result.seams[0];
 assert.equal(seam.tileA,"0-3-3");
 assert.equal(seam.tileB,"0-4-3");
 assert.equal(seam.orientation,"east-west");
 assert.equal(seam.status,"real-sentinel-region-seam-check");
 assert.equal(seam.state==="comparable",seam.pairedPixels>0,
   "A seam can claim numeric pairs only for original comparable source measurements");
 const authentic=[];
 for(const item of result.tiles){
   const [,x,y]=item.key.split("-").map(Number);
   const base=origin+"/api/observations/multiyear/0/"+x+"/"+y+"/"+
     selection.from+"/"+selection.to+"/"+selection.month+".";
   const jsonReply=await fetch(base+"json?cloud="+selection.cloud,{
     signal:AbortSignal.timeout(60000)});
   assert.equal(jsonReply.status,200);
   const original=await jsonReply.json();
   assert.equal(original.key,item.key);
   assert.equal(original.statistics.commonValidPixels,item.commonValidPixels);
   assert.equal(original.statistics.robustAllYearsPixels,item.robustAllYearsPixels);
   assert.equal(original.statistics.yearCount,selection.to-selection.from+1);
   assert.equal(original.qa.allSourceSclMasked,true);
   assert.equal(original.qa.fixedCommonPixelPopulation,true);
   assert.equal(original.qa.leaveOneYearOutSensitivity,true);
   assert.equal(original.terrainElevationUnchanged,true);
   assert.deepEqual(original.years.map(y=>y.scenes.map(s=>s.sceneId)),
     item.sourceScenes.map(y=>y.scenes.map(s=>s.sceneId)));
   const slopes=Buffer.from(original.slopeF32LE,"base64");
   assert.equal(slopes.length,original.width*original.height*4);
   const png=await fetch(base+"png?cloud="+selection.cloud,
     {signal:AbortSignal.timeout(60000)});
   assert.equal(png.status,200);
   const header=Buffer.from(await png.arrayBuffer());
   assert.equal(header.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
   authentic.push({key:item.key,pixels:item.commonValidPixels,
     sceneIds:original.years.flatMap(y=>y.scenes.map(s=>s.sceneId)),
     imageBytes:header.length});
 }
 // Also cache actual measured ČÚZK terrain for the second tile so the
 // browser GPU proof can show both live-source overlays over real elevation.
 const dem=await fetch(origin+"/api/tiles/0/4/3.json",{
   signal:AbortSignal.timeout(90000)});
 assert.equal(dem.status,200,"Second real measured ČÚZK tile required for two-tile 3D proof");
 const mesh=await dem.json();
 assert.equal(mesh.status,"real-data");
 assert.equal(mesh.key,"0-4-3");
 assert.equal(mesh.verticalDatum,"Bpv (Baltic 1957)");
 const photo=await fetch(origin+"/api/tiles/0/4/3.png",
   {signal:AbortSignal.timeout(60000)});
 assert.equal(photo.status,200);
 assert.ok((await photo.arrayBuffer()).byteLength>100);
 terminalReport={...terminalReport,status:"real-adjacent-two-tile-verified",
   analyzedTiles:2,seam,authentic,secondDem:{
     key:mesh.key,measuredTriangles:mesh.measuredTriangles,
     verticalDatum:mesh.verticalDatum}};
 await writeFile(join(folder,"region-adjacent-live-report.json"),
   JSON.stringify(terminalReport,null,2));
 console.log("PASS Stage 18 two actual adjacent Sentinel-2 tiles, "+
   authentic.reduce((n,t)=>n+t.pixels,0)+" genuine common pixels, "+
   (authentic[0].sceneIds.length+authentic[1].sceneIds.length)+
   " independently source-proven tile scene references, "+
   "measured edge state "+seam.state+
   ", "+seam.pairedPixels+" true edge pairs, original ČÚZK DSM for both");
}catch(error){
 terminalReport={...terminalReport,reason:String(error)};
 await writeFile(join(folder,"region-adjacent-live-report.json"),
   JSON.stringify(terminalReport,null,2));
 throw error; // optional external network step fails transparently; no false "pass".
}finally{server.kill();}
