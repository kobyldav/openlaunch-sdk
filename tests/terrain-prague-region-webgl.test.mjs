/** Stage 17: the browser's real regional renderer must not accept
 * an independently different Sentinel source, SCL count, or invented pixels.
 * These tiny synthetic metadata objects are QA fixtures, NOT source imagery.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script,runInNewContext} from "node:vm";

const html=await readFile(new URL("../scripts/terrain-prague-stream-viewer.html",import.meta.url),"utf8");
const script=html.match(/<script>\s*"use strict";([\s\S]+?)<\/script>/)?.[1];
assert.ok(script,"The actual streamed Prague viewer script must be available");
const extracted=script.slice(script.indexOf("function clearRegionGpu(){"),
  script.indexOf("function dispose(t){"));
assert.ok(extracted.startsWith("function clearRegionGpu()"));
assert.ok(extracted.includes("function updateRegionOverlays()"));
const mockDate=year=>({year,scenes:[5,19].map((day,i)=>({
 sceneId:"S2A_"+year+"08"+String(day).padStart(2,"0")+"_"+i+"_L2A",
 acquiredAt:year+"-08-"+String(day).padStart(2,"0")+"T10:00:00Z"
}))});
const geoBounds={west:14.40,south:50.09,east:14.41,north:50.10};
function mercator(lon,lat){
 const r=6378137;return [r*lon*Math.PI/180,r*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
}
const box={key:"0-3-3",cell:{bounds:geoBounds}};
const bins=values=>Buffer.from(values.buffer,values.byteOffset,values.byteLength).toString("base64");
function fixture(){
 const years=[2023,2024,2025].map(mockDate);
 const report={status:"analyzed",key:"0-3-3",
   commonValidPixels:3,robustAllYearsPixels:2,
   sourceScenes:years};
 const [left,top]=mercator(geoBounds.west,geoBounds.north),
   [right,bottom]=mercator(geoBounds.east,geoBounds.south);
 const meta={status:"real-sentinel-multiyear-seasonal-trend",
   version:1,key:"0-3-3",month:8,
   width:2,height:2,terrainElevationUnchanged:true,
   qa:{allSourceSclMasked:true,allSameGrid:true,
     fixedCommonPixelPopulation:true,noGapFilling:true,
     leaveOneYearOutSensitivity:true},
   area:[geoBounds.west,geoBounds.south,geoBounds.east,geoBounds.north],
   grid:{crs:"EPSG:3857",transform:[
     left,(right-left)/2,0,top,0,(bottom-top)/2]},
   statistics:{firstYear:2023,lastYear:2025,totalPixels:4,
     commonValidPixels:3,robustAllYearsPixels:2},
   years,slopeF32LE:bins(Float32Array.from([.1,.1,NaN,-.1])),
   robustB64:bins(Uint8Array.from([1,1,0,0]))};
 return {report,meta};
}
function createHarness(){
 const deletions=[];
 const dom={"obs-mode":{value:"region"},
   "region-3d-status":{textContent:""}};
 const ctx={
   Map,Set,Date,Number,Array,Math,Promise,Uint8Array,Float32Array,
   regionTiles:new Map(),regionGpu:new Map(),
   regionFailed:new Map(),MAX_REGION_GPU:6,
   regionPlan:{tiles:[],cloud:50},
   regionResult:{fromYear:2023,toYear:2025,month:8,analyzedTiles:1},
   regionTextureLoading:null,regionEpoch:0,
   selection:{coarse:[],finer:[]},
   gl:{deleteTexture:x=>deletions.push(x)},
   config:{},$:(key)=>dom[key]??null,
   nearTile:(_z,x,y)=>x+y,merc:mercator,
   requestDraw:()=>{},
   binary:(base64,Type)=>{
     const b=Buffer.from(base64,"base64");
     if(b.length%Type.BYTES_PER_ELEMENT)throw Error("Invalid fixture");
     const copy=Uint8Array.from(b);
     return new Type(copy.buffer);
   }
 };
 const api=runInNewContext(extracted+
   "({validateRegionSource,regionWantedTiles,clearRegionGpu,regionOverlayActive})",ctx);
 return {ctx,api,dom,deletions};
}

test("Stage 17: active regional source matches real per-year IDs, SCL counts and metadata",()=>{
 const {ctx,api}=createHarness();
 const f=fixture();
 ctx.regionTiles.set("0-3-3",f.report);
 assert.equal(api.validateRegionSource(f.meta,box),true);
 for(const patch of [
   {version:9},{month:7},{key:"0-3-4"},{terrainElevationUnchanged:false},
   {grid:{crs:"EPSG:4326"}},
   {area:[14.50,50.09,14.51,50.10]},
   {grid:{...f.meta.grid,transform:[
     f.meta.grid.transform[0]+30,...f.meta.grid.transform.slice(1)]}},
   {qa:{...f.meta.qa,allSourceSclMasked:false}},
   {statistics:{...f.meta.statistics,commonValidPixels:4}},
   {statistics:{...f.meta.statistics,robustAllYearsPixels:3}},
   {slopeF32LE:bins(Float32Array.from([.1,.1,.3,-.1]))},
   {robustB64:bins(Uint8Array.from([1,1,1,0]))},
   {years:f.meta.years.map((y,i)=>i===1?{...y,
     scenes:y.scenes.map((s,j)=>j===0?{...s,sceneId:"wrong_source"}:s)}:y)}
 ]){
   assert.throws(()=>api.validateRegionSource({...f.meta,...patch},box),
     /zdrojově|nesouhlasí|geografickou|posunutou/, "Must reject different genuine source provenance");
 }
 ctx.regionTiles.get("0-3-3").status="insufficient";
 assert.throws(()=>api.validateRegionSource(f.meta,{key:"0-3-3"}),/zdrojově/);
});

test("Stage 17: the 3D planner only returns analyzed visible parent tiles, at most 6",()=>{
 const {ctx,api}=createHarness();
 const tiles=Array.from({length:10},(_,i)=>({
   key:"0-"+i+"-0",x:i,y:0
 }));
 ctx.regionPlan={cloud:50,tiles};
 for(const t of tiles)ctx.regionTiles.set(t.key,
   {status:t.x===2?"insufficient":"analyzed"});
 ctx.selection={coarse:tiles.map(x=>({...x,key:x.key})),finer:[]};
 const wanted=api.regionWantedTiles();
 assert.equal(wanted.length,6);
 assert.ok(wanted.every(t=>t.key!=="0-2-0"));
 assert.equal(new Set(wanted.map(t=>t.key)).size,6);
 assert.deepEqual([...wanted.map(t=>t.cell.x)],[0,1,3,4,5,6]);
 ctx.selection={coarse:[],finer:[
   {parent:"0-3-0"},{parent:"0-4-0"}]};
 assert.deepEqual([...api.regionWantedTiles().map(x=>x.key)],
   ["0-3-0","0-4-0"]);
});

test("Stage 17: turning off region frees GPU textures and cancels pending source load",()=>{
 const {ctx,api,deletions,dom}=createHarness();
 const fake={id:"measured-source-GPU-texture"};
 ctx.regionGpu.set("0-3-3",{texture:fake});
 const controller=new AbortController();
 ctx.regionTextureLoading={key:"0-3-3",controller};
 api.clearRegionGpu();
 assert.equal(controller.signal.aborted,true);
 assert.equal(ctx.regionGpu.size,0);
 assert.deepEqual(deletions,[fake]);
 assert.equal(ctx.regionEpoch,1);
 assert.match(dom["region-3d-status"].textContent,/uvolněny/);
});
test("Stage 17: shader uses same parent georeferencing with real tile-specific textures",()=>{
 assert.match(html,/value="region"/);
 assert.match(html,/id="region-3d"/);
 assert.match(html,/regionGpu\.get\(parentKey\)\?\.texture/);
 assert.match(html,/z===0\?0:\(x%2\)\*\.5/);
 assert.match(html,/z===0\?0:\(y%2\)\*\.5/);
 assert.match(html,/const sourceTexture=regional\?\?observed;/);
 assert.match(html,/MAX_REGION_GPU=6/);
 assert.match(html,/gl\.deleteTexture\(entry\.texture\)/);
 assert.match(html,/regionTextureLoading\?\.controller\.abort\(\)/);
 assert.match(html,/function validateRegionSource\(/);
 assert.doesNotThrow(()=>new Script(script));
});

test("Stage 19: actual 3D source validator refuses an absent or different regional scene lock",()=>{
 const {ctx,api}=createHarness();
 const f=fixture();
 ctx.regionTiles.set("0-3-3",f.report);
 ctx.regionResult.sourceLockId="1234567890abcdef1234567890abcdef";
 assert.throws(()=>api.validateRegionSource(f.meta,box),/zdrojově/,
   "Previous independent cached rasters cannot masquerade as shared-region data");
 assert.throws(()=>api.validateRegionSource({
   ...f.meta,sourceLockId:"abcdefabcdefabcdefabcdefabcdefab",regionSourceLocked:true
 },box),/zdrojově/);
 assert.equal(api.validateRegionSource({
   ...f.meta,sourceLockId:ctx.regionResult.sourceLockId,regionSourceLocked:true
 },box),true);
 assert.match(html,/regionPlan\.sourceLockId=event\.id/);
 assert.match(html,/lock:params\.sourceLockId/);
 assert.match(html,/id="region-source-status"/);
 assert.match(html,/\["source_lock_id","tile","status"/);
 assert.match(html,/\["source_lock_id","tile_a","tile_b"/);
 assert.match(html,/originalAnnualScenes:regionResult\.lockedSourceYears/);

});
