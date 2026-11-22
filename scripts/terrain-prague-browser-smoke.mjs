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

 // Stage 11: ONLY inspect real, verified Sentinel STAC/COG cached products.
 // If the upstream source was unavailable, never substitute generated pixels.
 let actualSentinelView=null;
 try{
   const realReport=JSON.parse(await readFile(join(cache,"observations-live-report.json"),"utf8"));
   const sceneId=realReport.sceneId;
   assert.match(sceneId,/^[A-Za-z0-9_-]{5,120}$/);
   const prefix=origin+"/api/observations/0/3/3/"+sceneId;
   const metaResponse=await fetch(prefix+".json");
   assert.equal(metaResponse.status,200);
   const meta=await metaResponse.json();
   assert.equal(meta.sceneId,sceneId);
   assert.equal(meta.qa.sclMask,true);
   await evalJs(c.send,'(()=>{const p=tileCenter(0,3,3);'+
     'panX=p[0];panNorth=p[1];yaw=0;pitch=1.28;distance=420;'+
     'enableDetail=false;buildingsEnabled=false;$("obs-mode").value="ortho";'+
     'update();return true;})()');
   const baseline=await evalJs(c.send,inspectPixels);
   await evalJs(c.send,'(()=>{observationTile=planner.tileLevels[0]'+
     '.find(t=>t.key==="0-3-3");'+
     'observationCatalog.set('+JSON.stringify(sceneId)+',{id:'+JSON.stringify(sceneId)+'});'+
     '$("obs-scene").replaceChildren(new Option('+JSON.stringify(sceneId)+','+
     JSON.stringify(sceneId)+'));return true;})()');
   await evalJs(c.send,'loadObservation()');
   await until(async()=>await evalJs(c.send,
     '!!observationActive&&observationActive.sceneId==='+JSON.stringify(sceneId)),
     "real Sentinel data uploaded to Edge WebGL1",20000);
   await evalJs(c.send,'(()=>{$("obs-mode").value="rgb";requestDraw();return true;})()');
   const observedRgb=await evalJs(c.send,inspectPixels);
   assert.equal(observedRgb.glError,0);
   assert.notEqual(observedRgb.checksum,baseline.checksum,
     "True Sentinel RGB must change actual terrain GPU pixels");
   const rgbBytes=await capture("prague-real-sentinel-rgb.png");
   await evalJs(c.send,'(()=>{$("obs-mode").value="ndvi";requestDraw();return true;})()');
   const observedNdvi=await evalJs(c.send,inspectPixels);
   assert.equal(observedNdvi.glError,0);
   assert.notEqual(observedNdvi.checksum,observedRgb.checksum,
     "Calibrated Sentinel NDVI must alter actual rendered terrain colors");
   const ndviBytes=await capture("prague-real-sentinel-ndvi.png");
   actualSentinelView={sceneId,acquiredAt:meta.acquiredAt,
     statistic:meta.statistics,
     orthoChecksum:baseline.checksum,rgbChecksum:observedRgb.checksum,
     ndviChecksum:observedNdvi.checksum,rgbBytes,ndviBytes};
   console.log("PASS real Sentinel-2 GPU RGB+NDVI overlay: "+sceneId+
     " ("+meta.acquiredAt+"), distinct RGB and NDVI WebGL pixel checksums "+
     baseline.checksum+" => "+observedRgb.checksum+" => "+observedNdvi.checksum+
     ", actual Edge screenshot PNGs");
 }catch(error){
   if(existsSync(join(cache,"observations-live-report.json")))throw error;
   console.log("NOTICE Sentinel source COG test unavailable; no satellite screenshots "+
     "are fabricated; existing real ČÚZK GPU regression still passed.");
 }

 // Stage 12: a live-verified TWO-scene pair is the only acceptable input.
 // If third-party historical COGs fail, no comparison screenshot exists.
 let actualChangeView=null;
 try{
   const realPair=JSON.parse(await readFile(join(cache,"changes-live-report.json"),"utf8"));
   assert.equal(realPair.status,"real-sentinel-change-verified");
   const before=realPair.before,after=realPair.after;
   for(const scene of [before,after])assert.match(scene.sceneId,/^[A-Za-z0-9_-]{5,120}$/);
   await evalJs(c.send,'(()=>{const p=tileCenter(0,3,3);'+
     'panX=p[0];panNorth=p[1];yaw=0;pitch=1.28;distance=420;'+
     'enableDetail=false;buildingsEnabled=false;$("obs-mode").value="ortho";'+
     'update();return true;})()');
   const clearTerrain=await evalJs(c.send,inspectPixels);
   const expression='(()=>{observationTile=planner.tileLevels[0]'+
     '.find(t=>t.key==="0-3-3");'+
     'observationCatalog.set('+JSON.stringify(before.sceneId)+
     ',{id:'+JSON.stringify(before.sceneId)+',acquiredAt:'+
     JSON.stringify(before.acquiredAt)+'});'+
     'observationCatalog.set('+JSON.stringify(after.sceneId)+
     ',{id:'+JSON.stringify(after.sceneId)+',acquiredAt:'+
     JSON.stringify(after.acquiredAt)+'});'+
     '$("compare-before").replaceChildren(new Option('+JSON.stringify(before.acquiredAt.slice(0,10)+" · "+before.sceneId)+','+
     JSON.stringify(before.sceneId)+'));$("compare-before").disabled=false;'+
     '$("obs-scene").replaceChildren(new Option('+JSON.stringify(after.acquiredAt.slice(0,10)+" · "+after.sceneId)+','+
     JSON.stringify(after.sceneId)+'));$("obs-scene").disabled=false;'+
     '$("compare-load").disabled=false;return true;})()';
   await evalJs(c.send,expression);
   await evalJs(c.send,'loadComparison()');
   await until(async()=>await evalJs(c.send,
     '!!observationActive&&!!observationActive.changeTexture&&'+
     '$("obs-mode").value==="change"&&!!comparisonData'),
     "two real source dates feeding one Edge WebGL change layer",20000);
   const actual=await evalJs(c.send,inspectPixels);
   assert.equal(actual.glError,0);
   assert.equal(actual.loaded,true);
   assert.notEqual(actual.checksum,clearTerrain.checksum,
     "Paired source ΔNDVI must change actual framebuffer values");
   const compare=await evalJs(c.send,
     '({overlap:comparisonData.meta.statistics.overlapPixels,'+
     'increased:comparisonData.meta.statistics.increasedPixels,'+
     'decreased:comparisonData.meta.statistics.decreasedPixels,'+
     'stable:comparisonData.meta.statistics.stablePixels,'+
     'csvEnabled:!$("compare-export").disabled})');
   assert.equal(compare.overlap,realPair.statistics.overlapPixels);
   assert.equal(compare.increased+compare.decreased+compare.stable,compare.overlap);
   assert.equal(compare.csvEnabled,true);
   const screenshotBytes=await capture("prague-real-sentinel-delta-ndvi.png");
   actualChangeView={before,after,statistics:realPair.statistics,
     source:realPair.source,checksum:actual.checksum,
     terrainChecksum:clearTerrain.checksum,screenshotBytes};
   console.log("PASS real two-date Sentinel NDVI difference in actual Edge WebGL1: "+
     compare.overlap+" common SCL-valid pixels, GPU checksum "+
     clearTerrain.checksum+" -> "+actual.checksum+
     "; "+screenshotBytes+" PNG screenshot bytes");
 }catch(error){
   if(existsSync(join(cache,"changes-live-report.json")))throw error;
   console.log("NOTICE historical Sentinel dual-source download unavailable; "+
     "no synthetic two-date comparison or fabricated screenshot created.");
 }

 // Stage 13: real >=3 observed acquisitions. Fixture, synthetic,
 // or palette-inverted rasters are never permissible screenshot inputs.
 let actualTrendView=null;
 try{
   const source=JSON.parse(await readFile(join(cache,"trends-live-report.json"),"utf8"));
   assert.equal(source.status,"real-sentinel-trend-verified");
   assert.ok(source.sceneIds.length>=3&&source.sceneIds.length<=6);
   await evalJs(c.send,'(()=>{const p=tileCenter(0,3,3);'+
     'panX=p[0];panNorth=p[1];yaw=0;pitch=1.28;distance=420;'+
     'enableDetail=false;buildingsEnabled=false;$("obs-mode").value="ortho";'+
     'update();return true;})()');
   const clear=await evalJs(c.send,inspectPixels);
   const sceneSetup='(()=>{observationTile=planner.tileLevels[0]'+
     '.find(t=>t.key==="0-3-3");'+
     source.scenes.map(item=>
       'observationCatalog.set('+JSON.stringify(item.sceneId)+',{id:'+
       JSON.stringify(item.sceneId)+',acquiredAt:'+
       JSON.stringify(item.acquiredAt)+'});').join("")+
     'const e=$("trend-scenes");e.replaceChildren();'+
     source.scenes.map(item=>
       '(()=>{const box=document.createElement("input");box.type="checkbox";'+
       'box.value='+JSON.stringify(item.sceneId)+';box.checked=true;'+
       'const label=document.createElement("label");label.textContent='+
       JSON.stringify(item.acquiredAt.slice(0,10))+';label.prepend(box);e.append(label);})();'
     ).join("")+
     'return true;})()';
   await evalJs(c.send,sceneSetup);
   await evalJs(c.send,'loadTrend('+JSON.stringify(source.sceneIds)+')');
   await until(async()=>await evalJs(c.send,
     '!!trendData&&!!observationActive?.trendTexture&&'+
     '$("obs-mode").value==="trend"'),
     "actual original Sentinel multi-date trend in WebGL1",25000);
   const observed=await evalJs(c.send,inspectPixels);
   assert.equal(observed.glError,0);
   assert.equal(observed.loaded,true);
   assert.notEqual(observed.checksum,clear.checksum,
     "At least three original scenes must change real rendered GPU pixels");
   const computed=await evalJs(c.send,
     '({scenes:trendData.meta.scenes.length,'+
     'common:trendData.meta.statistics.commonValidPixels,'+
     'actualSlopes:trendData.slopes.filter(Number.isFinite).length,'+
     'chartLabel:$("trend-summary").textContent,'+
     'csvEnabled:!$("trend-export").disabled,'+
     'grid:trendData.meta.grid.crs})');
   assert.equal(computed.scenes,source.scenes.length);
   assert.equal(computed.common,source.statistics.commonValidPixels);
   assert.equal(computed.actualSlopes,source.statistics.commonValidPixels);
   assert.equal(computed.csvEnabled,true);
   assert.equal(computed.grid,"EPSG:3857");
   assert.match(computed.chartLabel,/Theil/);
   await evalJs(c.send,'(()=>{drawTrendChart();window.scrollTo(0,'+
     'Math.max(0,$("trend-chart").getBoundingClientRect().top+window.scrollY-85));'+
     'return true;})()');
   const bytes=await capture("prague-real-sentinel-ndvi-3-date-trend.png");
   actualTrendView={scenes:source.scenes,statistics:source.statistics,
     common:computed.common,checksum:observed.checksum,
     terrainChecksum:clear.checksum,screenshotBytes:bytes,
     renderer:"actual Edge WebGL1; measured Theil-Sen, 3 real STAC scenes"};
   console.log("PASS real "+computed.scenes+"-date Sentinel NDVI trend actual Edge WebGL1: "+
     computed.common+" pixels jointly valid in every original COG scene, "+
     clear.checksum+" -> "+observed.checksum+
     ", graphical NDVI time series + "+bytes+" real screenshot bytes");
 }catch(error){
   if(existsSync(join(cache,"trends-live-report.json")))throw error;
   console.log("NOTICE genuine three-source Sentinel trend unavailable; "+
     "no fabricated time-series graph or screenshot generated.");
 }

 // Stage 14: draw the interannual source median only when four real
 // previously validated COG/SCL source scenes exist. No fixture imagery.
 let actualSeasonalView=null;
 try{
   const report=JSON.parse(await readFile(join(cache,"seasonal-live-report.json"),"utf8"));
   assert.equal(report.status,"real-sentinel-seasonal-verified");
   const {before,after,selection}=report;
   assert.equal(before.scenes.length,2);assert.equal(after.scenes.length,2);
   await evalJs(c.send,'(()=>{const center=tileCenter(0,3,3);'+
     'panX=center[0];panNorth=center[1];yaw=0;pitch=1.28;distance=420;'+
     'enableDetail=false;buildingsEnabled=false;'+
     '$("obs-mode").value="ortho";update();return true;})()');
   const baseline=await evalJs(c.send,inspectPixels);
   const catalog={
     before:{year:before.year,scenes:before.scenes.map(x=>({
       id:x.sceneId,acquiredAt:x.acquiredAt,cloudPercent:null}))},
     after:{year:after.year,scenes:after.scenes.map(x=>({
       id:x.sceneId,acquiredAt:x.acquiredAt,cloudPercent:null}))}
   };
   const setup='(()=>{seasonalSelection={tile:planner.tileLevels[0]'+
     '.find(t=>t.key==="0-3-3"),beforeYear:'+before.year+
     ',afterYear:'+after.year+',month:'+before.month+
     ',cloud:'+selection.cloud+',catalog:'+JSON.stringify(catalog)+'};'+
     '$("season-before").value='+JSON.stringify(String(before.year))+';'+
     '$("season-after").value='+JSON.stringify(String(after.year))+';'+
     '$("season-month").value='+JSON.stringify(String(before.month))+';'+
     '$("season-cloud").value='+JSON.stringify(String(selection.cloud))+';'+
     '$("season-scenes").textContent='+JSON.stringify(
       [...before.scenes,...after.scenes].map(x=>x.acquiredAt.slice(0,10)+" · "+x.sceneId).join(" | "))+ ';return true;})()';
   await evalJs(c.send,setup);
   await evalJs(c.send,'loadSeasonal()');
   await until(async()=>await evalJs(c.send,
     '!!seasonalData&&!!observationActive?.seasonalTexture&&'+
     '$("obs-mode").value==="seasonal"'),
     "genuine four-source interannual NDVI in Edge WebGL1",30000);
   const observed=await evalJs(c.send,inspectPixels);
   assert.equal(observed.glError,0);
   assert.equal(observed.loaded,true);
   assert.notEqual(observed.checksum,baseline.checksum,
     "Same-month source SCL-masked four-image NDVI must change framebuffer");
   const ui=await evalJs(c.send,
     '({pixels:seasonalData.meta.statistics.overlapPixels,'+
     'values:seasonalData.delta.filter(Number.isFinite).length,'+
     'robust:seasonalData.meta.statistics.robustTwoPerYearPixels,'+
     'before:seasonalData.meta.before.year,after:seasonalData.meta.after.year,'+
     'csvEnabled:!$("season-export").disabled,'+
     'sourceLabel:$("season-scenes").textContent,'+
     'qualityLabel:$("season-summary").textContent})');
   assert.equal(ui.pixels,report.statistics.overlapPixels);
   assert.equal(ui.values,report.statistics.overlapPixels);
   assert.equal(ui.robust,report.statistics.robustTwoPerYearPixels);
   assert.equal(ui.before,before.year);assert.equal(ui.after,after.year);
   assert.equal(ui.csvEnabled,true);
   assert.match(ui.qualityLabel,/platných pixelů/);
   assert.match(ui.sourceLabel,/Sentinel|S2[A-C]/);
   await evalJs(c.send,'(()=>{window.scrollTo(0,'+
     'Math.max(0,$("season-summary").getBoundingClientRect().top+window.scrollY-100));'+
     'return true;})()');
   const screenshotBytes=await capture("prague-real-sentinel-ndvi-seasonal-interannual.png");
   actualSeasonalView={before,after,statistics:report.statistics,
     source:report.source,checksum:observed.checksum,
     terrainChecksum:baseline.checksum,screenshotBytes};
   console.log("PASS genuine same-month "+before.year+"/"+after.year+
     " Sentinel-2 interannual ΔNDVI in actual Edge WebGL1: "+
     ui.pixels+" source-coincident valid pixels, "+
     ui.robust+" with >=2 clear measurements in both years, "+
     baseline.checksum+" -> "+observed.checksum+
     ", "+screenshotBytes+" source screenshot PNG bytes");
 }catch(error){
   if(existsSync(join(cache,"seasonal-live-report.json")))throw error;
   console.log("NOTICE actual multi-year Sentinel source data unavailable; "+
     "no interannual screenshot or derived scientific claim fabricated.");
 }

 // Stage 15 real source: six original dated Sentinel COGs in 3 seasons.
 let actualMultiYearView=null;
 try{
   const proof=JSON.parse(await readFile(join(cache,"multiyear-live-report.json"),"utf8"));
   assert.equal(proof.status,"real-sentinel-multiyear-verified");
   const {years,selection:chosen}=proof;
   assert.ok(years.length>=3&&years.length<=5);
   const catalog={seasons:years.map(group=>({
     year:group.year,scenes:group.scenes.map(s=>({
       id:s.sceneId,acquiredAt:s.acquiredAt,cloudPercent:null
     }))
   }))};
   await evalJs(c.send,'(()=>{const center=tileCenter(0,3,3);'+
     'panX=center[0];panNorth=center[1];yaw=0;pitch=1.28;distance=420;'+
     'enableDetail=false;buildingsEnabled=false;'+
     '$("obs-mode").value="ortho";update();return true;})()');
   const baseline=await evalJs(c.send,inspectPixels);
   const setup='(()=>{multiSelection={tile:planner.tileLevels[0]'+
     '.find(t=>t.key==="0-3-3"),from:'+chosen.from+
     ',to:'+chosen.to+',month:'+chosen.month+',cloud:'+chosen.cloud+
     ',catalog:'+JSON.stringify(catalog)+'};'+
     '$("multi-from").value='+JSON.stringify(String(chosen.from))+';'+
     '$("multi-to").value='+JSON.stringify(String(chosen.to))+';'+
     '$("multi-month").value='+JSON.stringify(String(chosen.month))+';'+
     '$("multi-cloud").value='+JSON.stringify(String(chosen.cloud))+';'+
     '$("multi-scenes").textContent='+JSON.stringify(
       years.map(y=>y.year+": "+y.scenes.map(s=>
         s.acquiredAt.slice(0,10)+" "+s.sceneId).join(", ")).join(" | "))+ ';'+
     '$("multi-load").disabled=false;return true;})()';
   await evalJs(c.send,setup);
   await evalJs(c.send,'loadMultiYear()');
   await until(async()=>await evalJs(c.send,
     '!!multiData&&!!observationActive?.multiTexture&&'+
     '$("obs-mode").value==="multiyear"'),
     "true 3-year Sentinel SCL masked observations in Edge WebGL1",30000);
   const render=await evalJs(c.send,inspectPixels);
   assert.equal(render.glError,0);assert.equal(render.loaded,true);
   assert.notEqual(render.checksum,baseline.checksum);
   const quality=await evalJs(c.send,
     '({years:multiData.meta.years.length,'+
     'common:multiData.meta.statistics.commonValidPixels,'+
     'valid:multiData.slope.filter(Number.isFinite).length,'+
     'robust:multiData.robust.filter(x=>x===1).length,'+
     'scenes:multiData.meta.years.reduce((n,x)=>n+x.scenes.length,0),'+
     'csv:!$("multi-export").disabled,'+
     'summary:$("multi-summary").textContent,'+
     'sources:$("multi-scenes").textContent})');
   assert.equal(quality.years,years.length);
   assert.equal(quality.scenes,years.length*2);
   assert.equal(quality.common,proof.statistics.commonValidPixels);
   assert.equal(quality.valid,proof.statistics.commonValidPixels);
   assert.equal(quality.robust,proof.statistics.robustAllYearsPixels);
   assert.equal(quality.csv,true);
   assert.match(quality.summary,/Theil/);
   assert.match(quality.summary,/citlivost|Citlivost/);
   assert.match(quality.sources,/S2[A-C]/);
   await evalJs(c.send,'(()=>{drawMultiYearChart();window.scrollTo(0,'+
     'Math.max(0,$("multi-chart").getBoundingClientRect().top+window.scrollY-120));'+
     'return true;})()');
   const screenshotBytes=await capture("prague-real-sentinel-multiyear-3-annual-trend.png");
   actualMultiYearView={years,statistics:proof.statistics,
     source:proof.source,checksum:render.checksum,
     terrainChecksum:baseline.checksum,screenshotBytes};
   console.log("PASS genuine multi-year "+years[0].year+".."+
     years[years.length-1].year+" original Sentinel-2 Edge WebGL1: "+
     quality.common+" common SCL-qualified pixels; "+
     quality.robust+" with two actual observations every year; "+
     baseline.checksum+" -> "+render.checksum+
     ", CSV and "+screenshotBytes+" genuine PNG bytes");
 }catch(error){
   if(existsSync(join(cache,"multiyear-live-report.json")))throw error;
   console.log("NOTICE actual multi-year COG data not available. "+
     "No fictitious historical series or screenshot generated.");
 }

 const report={tile:"0-3-3",provenance:"genuine ČÚZK DMP OK + Ortofoto ČR",
   measuredVertices:tile.validVertices,measuredTriangles:tile.measuredTriangles,
   screenshotBytes:[initialBytes,orbitBytes,returnBytes],first,orbit,after,flight,
   actualBuildingView,actualSentinelView,actualChangeView,actualTrendView,actualSeasonalView,actualMultiYearView,
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
