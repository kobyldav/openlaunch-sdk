/** Visual end-to-end regression: render the genuine cached ČÚZK tile in headless
 * Microsoft Edge, inspect actual GPU pixels, orbit and fly 60 camera poses.
 * The local server runs --offline: no fabricated or additional source data.
 */
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const browser=[
 join(process.env["ProgramFiles(x86)"]??"C:\\Program Files (x86)","Microsoft","Edge","Application","msedge.exe"),
 join(process.env.ProgramFiles??"C:\\Program Files","Microsoft","Edge","Application","msedge.exe")
].find(existsSync);
assert.ok(browser,"Windows CI must have Microsoft Edge to check the real scene");
const cache=resolve("test-results/terrain-prague-stream-ci");
const output=resolve("test-results/terrain-prague-browser-ci");
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),"openlaunch-real3d-edge-"));
const server=spawn(process.execPath,[
 fileURLToPath(new URL("./terrain-prague-stream.mjs",import.meta.url)),
 "--port","0","--no-open","--offline","--cache",cache
],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let edge=null,socket=null,stderr="",edgeError="";
server.stderr.on("data",d=>stderr+=d.toString());
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function until(fn,label,ms=22000){
 const began=Date.now();
 while(Date.now()-began<ms){
   const r=await fn();
   if(r)return r;
   await sleep(120);
 }
 throw Error("Timeout "+label+": "+stderr.slice(-500)+" "+edgeError.slice(-500));
}
async function waitServer(){
 return await new Promise((resolve,reject)=>{
   let result="";
   const timeout=setTimeout(()=>reject(Error("Offline server did not start: "+stderr)),20000);
   const onData=data=>{
     result+=data.toString();
     const match=result.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
     if(match){
       clearTimeout(timeout);server.stdout.off("data",onData);
       resolve("http://127.0.0.1:"+match[1]);
     }
   };
   server.stdout.on("data",onData);
   server.once("error",e=>{clearTimeout(timeout);reject(e);});
   server.once("exit",code=>{clearTimeout(timeout);reject(Error("server exit "+code+" "+stderr));});
 });
}
function devtools(url){
 const ws=new WebSocket(url),waiting=new Map();
 let next=0;
 const opened=new Promise((resolve,reject)=>{
   ws.addEventListener("open",resolve,{once:true});
   ws.addEventListener("error",reject,{once:true});
 });
 ws.addEventListener("message",evt=>{
   const msg=JSON.parse(evt.data);
   if(!waiting.has(msg.id))return;
   const item=waiting.get(msg.id);
   waiting.delete(msg.id);clearTimeout(item.timer);
   if(msg.error)item.reject(Error(JSON.stringify(msg.error)));
   else item.resolve(msg.result);
 });
 const send=async(method,params={})=>{
   await opened;
   const id=++next;
   return await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{
       waiting.delete(id);reject(Error("CDP timeout "+method));
     },16000);
     waiting.set(id,{resolve,reject,timer});
     ws.send(JSON.stringify({id,method,params}));
   });
 };
 return {ws,opened,send};
}
async function evalJs(send,expression){
 const response=await send("Runtime.evaluate",{
   expression,returnByValue:true,awaitPromise:true,userGesture:true
 });
 if(response.exceptionDetails)
   throw Error("Edge JavaScript exception: "+JSON.stringify(response.exceptionDetails).slice(0,700));
 return response.result?.value;
}
const inspectPixels='(()=>{' +
 'draw();const w=canvas.width,h=canvas.height,pixels=new Uint8Array(w*h*4);'+
 'gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);'+
 'let changed=0,hash=2166136261;'+
 'for(let j=0;j<pixels.length;j+=16){'+
 'const r=pixels[j],g=pixels[j+1],b=pixels[j+2];'+
 'if(Math.abs(r-14)+Math.abs(g-31)+Math.abs(b-48)>55)changed++;'+
 'hash=Math.imul(hash^r,16777619)>>>0;'+
 'hash=Math.imul(hash^g,16777619)>>>0;'+
 'hash=Math.imul(hash^b,16777619)>>>0;}'+
 'return {width:w,height:h,foreground:changed,checksum:hash,'+
 'faces:Number(document.getElementById("faces").textContent.replace(/[^0-9]/g,""))||0,'+
 'loaded:cache.has("0-3-3"),cacheTiles:cache.size,activeRequests:active,'+
 'queued:queue.length,controllers:controllers.size,glError:gl.getError(),'+
 'offline:config.offlineMode};})()';
const setCenter='(()=>{const p=tileCenter(0,3,3);'+
 'panX=p[0];panNorth=p[1];yaw=0;pitch=1.28;distance=420;'+
 'enableDetail=false;update();return true;})()';
try{
 const origin=await waitServer();
 const cached=await fetch(origin+"/api/tiles/0/3/3.json");
 assert.equal(cached.status,200,"Live smoke must have cached a real ČÚZK tile");
 const tile=await cached.json();
 assert.equal(tile.status,"real-data");
 assert.equal(tile.seam.version,2);
 assert.equal((await (await fetch(origin+"/api/config")).json()).offlineMode,true);
 assert.equal((await fetch(origin+"/api/tiles/0/0/0.json")).status,404,
   "Offline mode must not download absent data");
 edge=spawn(browser,[
   "--headless=new","--disable-extensions","--disable-background-networking",
   "--no-first-run","--no-default-browser-check","--disable-gpu-sandbox",
   "--enable-webgl","--ignore-gpu-blocklist","--enable-unsafe-swiftshader",
   "--use-angle=swiftshader","--remote-debugging-port=0",
   "--remote-allow-origins=*","--window-size=1100,850",
   "--user-data-dir="+profile,origin+"/"
 ],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
 edge.stderr.on("data",d=>edgeError+=d.toString().slice(0,400));
 const port=await until(async()=>{
   try{
     const f=await readFile(join(profile,"DevToolsActivePort"),"utf8");
     return Number(f.match(/^\d+/)?.[0])||null;
   }catch{return null;}
 },"Edge DevTools startup",26000);
 const tab=await until(async()=>{
   try{
     const items=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
     return items.find(t=>t.type==="page"&&t.url.startsWith(origin));
   }catch{return null;}
 },"Edge actual viewer tab",18000);
 const c=devtools(tab.webSocketDebuggerUrl);socket=c.ws;
 await c.opened;
 await c.send("Page.enable");await c.send("Runtime.enable");
 await until(async()=>{
   try{return await evalJs(c.send,'typeof gl!=="undefined"&&!!gl&&!!planner&&!!inspector')===true;}
   catch{return false;}
 },"real WebGL1 program in the browser",20000);
 await evalJs(c.send,setCenter);
 await until(async()=>await evalJs(c.send,'cache.has("0-3-3")'),
   "real cached terrain uploading to GPU",20000);
 const first=await evalJs(c.send,inspectPixels);
 assert.equal(first.glError,0,"WebGL draw must not raise an error");
 assert.equal(first.loaded,true);
 assert.equal(first.offline,true);
 assert.ok(first.faces>4000,"Actual ČÚZK surface did not render 4000+ faces");
 assert.ok(first.foreground>500,"Only background pixels rendered: "+JSON.stringify(first));
 const capture=async filename=>{
   const response=await c.send("Page.captureScreenshot",{format:"png",fromSurface:true});
   const bytes=Buffer.from(response.data,"base64");
   assert.ok(bytes.length>4000&&bytes.subarray(0,8).equals(
     Buffer.from([137,80,78,71,13,10,26,10])),"Missing real Edge PNG");
   await writeFile(join(output,filename),bytes);
   return bytes.length;
 };
 const initialBytes=await capture("prague-real-3d-initial.png");
 await evalJs(c.send,'(()=>{yaw=.4;pitch=1.08;distance=500;update();return true;})()');
 const orbit=await evalJs(c.send,inspectPixels);
 assert.equal(orbit.glError,0);
 assert.ok(orbit.foreground>300,"Camera orbit lost the real textured terrain");
 assert.notEqual(orbit.checksum,first.checksum,"Camera did not affect GPU pixels");
 const orbitBytes=await capture("prague-real-3d-orbit.png");
 const flight=await evalJs(c.send,'(()=>{'+
   'let peakQueue=0,peakActive=0;'+
   'for(let i=0;i<60;i++){panX=Math.sin(i*.16)*1450;panNorth=Math.cos(i*.14)*1350;'+
   'yaw=i*.11;pitch=.6+Math.sin(i*.08)*.2;distance=650+(i%7)*160;update();'+
   'peakQueue=Math.max(peakQueue,queue.length);peakActive=Math.max(peakActive,active);}'+
   'const pos=tileCenter(0,3,3);panX=pos[0];panNorth=pos[1];yaw=0;'+
   'pitch=1.28;distance=420;update();'+
   'return {peakQueue,peakActive,active,controllers:controllers.size,'+
   'cached:cache.size,queued:queue.length};})()');
 assert.ok(flight.peakActive<=3&&flight.controllers<=3,
   "Browser in-flight tile requests breached the concurrency limit");
 assert.ok(flight.peakQueue<=40,"Rapid camera movement created a request queue storm");
 await sleep(200);
 const after=await evalJs(c.send,inspectPixels);
 assert.ok(after.loaded&&after.foreground>300,"Real terrain disappeared after fast flight");
 assert.ok(after.cacheTiles<=40,"GPU tile cache exceeded budget");
 const returnBytes=await capture("prague-real-3d-after-flight.png");
 // A separate live OSM + ČÚZK real building source is optional: verify it
 // only when its independent HTTP source test populated the cache.
 // Synthetic fixture buildings can never satisfy this visual gate.
 let actualBuildingView=null;
 const buildingResponse=await fetch(origin+"/api/buildings/0/3/3.json");
 if(buildingResponse.ok){
   const buildingDoc=await buildingResponse.json();
   if(buildingDoc.status==="real-source-buildings"&&buildingDoc.buildings>0){
     await evalJs(c.send,'(()=>{const p=tileCenter(0,3,3);panX=p[0];panNorth=p[1];'+
       'yaw=-.6;pitch=.78;distance=920;enableDetail=true;buildingsEnabled=true;$("buildings").textContent="Budovy: zapnuto";'+
       'update();return true;})()');
     await until(async()=>await evalJs(c.send,'buildingCache.has("0-3-3")'),
       "cached true-source OSM/ČÚZK building overlay uploading to WebGL",20000);
     const buildShot=await evalJs(c.send,inspectPixels);
     const buildingCount=await evalJs(c.send,
       'Number(document.getElementById("building-count").textContent)');
     assert.equal(buildShot.glError,0);
     assert.ok(buildingCount>0,"Real building source must produce visible WebGL mesh");
     assert.ok(buildShot.faces>first.faces,
       "Separate building triangles must be drawn over the actual DSM");
     const screenshotBytes=await capture("prague-real-3d-with-buildings.png");
     actualBuildingView={buildingCount,screenshotBytes,
       faces:buildShot.faces,checksum:buildShot.checksum,
       measuredSource:buildingDoc.source,methods:buildingDoc.heightMethods};
     console.log("PASS true-source Prague building WebGL1 overlay: "+
       buildingCount+" OSM building volumes, "+buildShot.faces+
       " combined triangles, "+screenshotBytes+" real screenshot PNG bytes");
   }
 }else{
   console.log("NOTICE real building source unavailable in offline cache; "+
     "base terrain GPU test still passed, no building geometry fabricated.");
 }

 const report={tile:"0-3-3",provenance:"genuine ČÚZK DMP OK + Ortofoto ČR",
   measuredVertices:tile.validVertices,measuredTriangles:tile.measuredTriangles,
   screenshotBytes:[initialBytes,orbitBytes,returnBytes],first,orbit,after,flight,
   actualBuildingView,
   renderer:"actual Edge headless WebGL1 using SwiftShader"};
 await writeFile(join(output,"report.json"),JSON.stringify(report,null,2));
 console.log("PASS real WebGL1 Prague terrain screenshot: "+
   first.foreground+" foreground pixel samples and "+
   first.faces+" triangles; orbit checksum "+first.checksum+" -> "+orbit.checksum+
   "; flight peak "+flight.peakActive+" concurrent; return "+after.foreground+
   " visible foreground samples");
}finally{
 try{socket?.close();}catch{}
 if(edge?.pid){
   if(process.platform==="win32")
     spawnSync("taskkill",["/PID",String(edge.pid),"/T","/F"],
       {windowsHide:true,timeout:8000,stdio:"ignore"});
   else edge.kill();
 }
 server.kill();
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
