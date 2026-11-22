import test from "node:test";
import assert from "node:assert/strict";
import {
  SENTINEL_TERRAIN_OVERLAY_VERSION,validateObservationDates,
  supportedTerrainScenes,sentinelTerrainAssetHref,sentinelReflectanceCalibration,
  discoverSentinelTerrainScenes,loadSentinelTerrainOverlay
} from "../dist/terrain/sentinel-overlay.js";
import {bbox} from "../dist/geo/types.js";
import {lonLatToGridCrs} from "../dist/eo/raster.js";
import {OpenLaunch,discoverSentinelTerrainScenes as directDiscover,loadSentinelTerrainOverlay as directObserve,compareSentinelNdviScenes} from "../dist/index.js";

const area=bbox(14.425,50.093,14.427,50.095);
const host="https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/";
const names=["red","green","blue","nir","scl"];
function scene(overrides={}){
 const assets=Object.fromEntries(names.map(b=>[b,{
   href:host+"real-scene/"+b+".tif",
   "raster:bands":[{scale:.0001,offset:-.1}]
 }]));
 return {type:"Feature",collection:"sentinel-2-l2a",id:"S2B_33UVR_20250812_1_L2A",
   geometry:null,properties:{datetime:"2025-08-12T10:06:56Z",
     "eo:cloud_cover":4.4,platform:"sentinel-2b",
     "earthsearch:boa_offset_applied":true},assets,...overrides};
}
function reader({masked=false,zero=false}={}){
 let calls=0;
 const read=async(url,bounds,options)=>{
   calls++;
   assert.deepEqual(bounds.bbox,area.bbox);
   assert.ok(options.allowedHosts.includes(new URL(url).hostname));
   const band=names.find(name=>url.endsWith("/"+name+".tif"));
   assert.ok(band);
   const [left,bottom]=lonLatToGridCrs(area.bbox[0],area.bbox[1],"EPSG:3857");
   const [right,top]=lonLatToGridCrs(area.bbox[2],area.bbox[3],"EPSG:3857");
   const width=32,height=32;
   const values=new Float64Array(width*height);
   values.fill(zero?0:band==="red"?2000:band==="nir"?6000:
     band==="green"?3000:band==="blue"?2500:4);
   if(band==="scl"&&masked)
     for(let row=0;row<12;row++)for(let col=0;col<width;col++)
       values[row*width+col]=9;
   return {raster:{width,height,values,crs:"EPSG:3857",
     transform:[left,(right-left)/width,0,top,0,-(top-bottom)/height]}};
 };
 return {read,count:()=>calls};
}
test("stage 11 validates bounded dates and only real qualified COG scene assets",()=>{
 assert.equal(SENTINEL_TERRAIN_OVERLAY_VERSION,2);
 validateObservationDates("2025-06-01","2025-09-30");
 for(const args of [["2025-13-01","2025-09-30"],["2026-01-01","2025-01-01"],
   ["2024-01-01","2026-01-01"]])
   assert.throws(()=>validateObservationDates(...args),/date|Date|interval/);
 assert.equal(supportedTerrainScenes([scene()],35).length,1);
 assert.equal(supportedTerrainScenes([scene()],1).length,0);
 assert.equal(supportedTerrainScenes([scene({id:"../../file"})],35).length,0);
 assert.equal(supportedTerrainScenes([scene({assets:{
   ...scene().assets,red:{href:"http://127.0.0.1/private.tif"}}})],35).length,0);
 assert.equal(sentinelTerrainAssetHref(scene(),"nir"),host+"real-scene/nir.tif");
 assert.equal(sentinelTerrainAssetHref(scene({assets:{}}),"nir"),null);
});
test("STAC scene discovery keeps IDs/dates and leaves absent imagery empty",async()=>{
 let calls=0;
 const client={search:async(query)=>{
   calls++;
   assert.deepEqual(query.bbox,area.bbox);
   assert.deepEqual(query.collections,["sentinel-2-l2a"]);
   assert.match(query.datetime,/2025-06-01/);
   return {type:"FeatureCollection",features:[scene(),scene({id:"invalid!"})]};
 }};
 const data=await discoverSentinelTerrainScenes({
   area,from:"2025-06-01",to:"2025-09-30",client
 });
 assert.equal(calls,1);
 assert.equal(data.scenes.length,1);
 assert.equal(data.items[0].id,"S2B_33UVR_20250812_1_L2A");
 assert.equal(data.scenes[0].cloudPercent,4.4);
 assert.equal(data.scenes[0].hasScl,true);
 await assert.rejects(()=>discoverSentinelTerrainScenes({
   area,from:"2025-06-01",to:"2025-09-30",
   client:{search:async()=>({features:null})}
 }),/features/);
});
test("BOA preapplied flag prevents incorrect second subtraction of STAC offset",()=>{
 assert.deepEqual(sentinelReflectanceCalibration(scene(),"red"),{scale:.0001,offset:0});
 const unapplied=scene({properties:{...scene().properties,
   "earthsearch:boa_offset_applied":false}});
 assert.deepEqual(sentinelReflectanceCalibration(unapplied,"red"),{
   scale:.0001,offset:-.1});
 assert.throws(()=>sentinelReflectanceCalibration(scene({assets:{
   ...scene().assets,nir:{href:host+"real-scene/nir.tif"}
 }}),"nir"),/calibration/);
});
test("actual SDK routine reads exactly same qualified scene RGB/NIR/SCL and masks invalid pixels",async()=>{
 const f=reader({masked:true});
 const result=await loadSentinelTerrainOverlay({area,scene:scene(),readWindow:f.read});
 assert.equal(f.count(),5);
 assert.equal(result.status,"real-sentinel2-observation");
 assert.equal(result.sceneId,"S2B_33UVR_20250812_1_L2A");
 assert.equal(result.collection,"sentinel-2-l2a");
 assert.equal(result.version,2);
 assert.equal(result.grid.crs,"EPSG:3857");
 assert.equal(result.grid.transform.length,6);
 assert.ok(result.ndviValues instanceof Float32Array);
 assert.equal(result.ndviValues.length,result.width*result.height);
 assert.equal(result.ndviValues.filter(Number.isFinite).length,result.statistics.validPixels);
 assert.equal(result.qa.sclMask,true);
 assert.ok(result.statistics.validPixels>0);
 assert.ok(result.statistics.maskedPixels>0);
 assert.ok(result.statistics.ndviMean>0.45&&result.statistics.ndviMean<.55);
 assert.ok(result.statistics.ndviMax<=1);
 assert.equal(result.rgbRgba.length,result.width*result.height*4);
 assert.equal(result.ndviRgba.length,result.width*result.height*4);
 assert.equal(result.rgbRgba.filter((_,i)=>i%4===3&&result.rgbRgba[i]===255).length,
   result.statistics.validPixels);
 assert.equal(result.ndviRgba.filter((_,i)=>i%4===3&&result.ndviRgba[i]===255).length,
   result.statistics.validPixels);
 assert.equal(typeof new OpenLaunch().terrain.observeSentinel2,"function");
 assert.equal(directDiscover instanceof Function,true);
 assert.equal(directObserve instanceof Function,true);
 assert.equal(typeof new OpenLaunch().terrain.discoverObservations,"function");
});
test("bad or zero reflectance and missing masks cannot create NDVI measurements",async()=>{
 const f=reader({zero:true});
 await assert.rejects(()=>loadSentinelTerrainOverlay({
   area,scene:scene(),readWindow:f.read
 }),/no cloud-free calibrated/);
 const withoutScl=scene({assets:{...scene().assets,scl:undefined}});
 await assert.rejects(()=>loadSentinelTerrainOverlay({
   area,scene:withoutScl,readWindow:reader().read
 }),/source-qualified/);
 const wrongArea=bbox(-180,-85,180,85);
 await assert.rejects(()=>loadSentinelTerrainOverlay({
   area:wrongArea,scene:scene(),readWindow:reader().read
 }),/small Czech AOI/);
});

function evidence(iso,id,ndvi,overrides={}){
 const pixels=Float32Array.from(ndvi);
 return {status:"real-sentinel2-observation",version:2,
   sceneId:id,acquiredAt:iso,
   source:"Element84 Earth Search STAC / Copernicus Sentinel-2 L2A public COG",
   area:[14.425,50.093,14.427,50.095],width:3,height:3,groundSamplingM:10,
   grid:{crs:"EPSG:3857",transform:[100,10,0,200,0,-10]},
   ndviValues:pixels,statistics:{validPixels:Array.from(pixels).filter(Number.isFinite).length,
     maskedPixels:Array.from(pixels).filter(Number.isNaN).length,
     ndviMean:null,ndviMin:null,ndviMax:null},
   qa:{sclMask:true,maskClasses:[4,5,6,7],invalidReflectanceMasked:true,calibration:{}},
   ...overrides};
}
test("stage 12: chronological identical-pixel NDVI delta and both-scene cloud mask",()=>{
 const before=evidence("2025-08-06T10:12:00Z","S2A_OLD_20250806",
   [.2,.4,.6,.3,NaN,.7,.6,.1,.5]);
 const after=evidence("2025-08-25T10:12:00Z","S2B_NEW_20250825",
   [.4,.2,.65,.4,.9,NaN,.2,.1,.8]);
 const result=compareSentinelNdviScenes(before,after,
   {thresholdNdvi:.15,minOverlapPixels:4});
 assert.equal(result.status,"real-sentinel-ndvi-comparison");
 assert.equal(result.before.sceneId,before.sceneId);
 assert.equal(result.after.sceneId,after.sceneId);
 assert.equal(result.qa.sameGrid,true);
 assert.equal(result.qa.bothSclMasked,true);
 assert.equal(result.statistics.overlapPixels,7);
 assert.equal(result.statistics.missingEitherPixels,2);
 assert.equal(result.statistics.increasedPixels,2);
 assert.equal(result.statistics.decreasedPixels,2);
 assert.equal(result.statistics.stablePixels,3);
 assert.ok(Math.abs(result.deltaValues[0]-.2)<.00001);
 assert.ok(Math.abs(result.deltaValues[1]+.2)<.00001);
 assert.ok(Number.isNaN(result.deltaValues[4]));
 assert.ok(Number.isNaN(result.deltaValues[5]));
 assert.equal(result.deltaRgba[4*4+3],0,"one cloudy observation hides delta");
 assert.equal(result.deltaRgba[5*4+3],0,"one missing observation hides delta");
 assert.equal(result.deltaRgba[0*4+3],255);
 assert.ok(Math.abs(result.statistics.overlapPercent-(7/9*100))<.0001);
 assert.equal(typeof new OpenLaunch().terrain.compareSentinelNdvi,"function");
});
test("stage 12: no zero-fill, invalid CRS, invalid chronology and low overlap fail closed",()=>{
 const old=evidence("2025-08-06T10:12:00Z","S2A_OLD_20250806",
   [.1,.4,.3,.3,NaN,.5,.2,.1,.5]);
 const recent=evidence("2025-08-25T10:12:00Z","S2B_NEW_20250825",
   [.4,.5,.5,.4,.7,.2,.4,NaN,.6]);
 const check=(before,after,options={minOverlapPixels:4})=>
   compareSentinelNdviScenes(before,after,options);
 assert.throws(()=>check(recent,old),/chronological/);
 assert.throws(()=>check(old,old),/different chronological/);
 assert.throws(()=>check(old,{...recent,area:[14,50,15,51]}),/different pixel grids/);
 assert.throws(()=>check(old,{...recent,grid:{...recent.grid,
   transform:[100,10,0,201,0,-10]}}),/different pixel grids/);
 assert.throws(()=>check(old,{...recent,qa:{sclMask:false}}),/valid georeferenced/);
 assert.throws(()=>check(old,{...recent,ndviValues:Float32Array.from([2,.5,.5,.4,.7,.2,.4,NaN,.6])}),/invalid reflectance-derived/);
 assert.throws(()=>check(old,{...recent,ndviValues:new Float32Array(3)}),/valid georeferenced/);
 assert.throws(()=>check(old,recent,{minOverlapPixels:9}),/Insufficient same-pixel/);
 assert.throws(()=>check(old,recent,{thresholdNdvi:0}),/threshold/);
 const empty=evidence("2025-08-25T10:12:00Z","S2B_EMPTY_20250825",
   [NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN]);
 assert.throws(()=>check(old,empty),/Insufficient same-pixel/);
});
test("stage 12: source NDVI Float32 survives byte round-trip including NaN masking",async()=>{
 const result=await loadSentinelTerrainOverlay({
   area,scene:scene(),readWindow:reader({masked:true}).read
 });
 const raw=Buffer.from(result.ndviValues.buffer,result.ndviValues.byteOffset,
   result.ndviValues.byteLength);
 const saved=Buffer.from(raw.toString("base64"),"base64");
 const restored=new Float32Array(saved.buffer.slice(saved.byteOffset,
   saved.byteOffset+saved.byteLength));
 assert.equal(restored.length,result.ndviValues.length);
 for(let i=0;i<restored.length;i++)
   assert.ok(Object.is(restored[i],result.ndviValues[i]),
     "NoData and calibrated true values must survive JSON base64");
});
