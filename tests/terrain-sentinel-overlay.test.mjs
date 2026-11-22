import test from "node:test";
import assert from "node:assert/strict";
import {
  SENTINEL_TERRAIN_OVERLAY_VERSION,validateObservationDates,
  supportedTerrainScenes,sentinelTerrainAssetHref,sentinelReflectanceCalibration,
  discoverSentinelTerrainScenes,loadSentinelTerrainOverlay
} from "../dist/terrain/sentinel-overlay.js";
import {bbox} from "../dist/geo/types.js";
import {lonLatToGridCrs} from "../dist/eo/raster.js";
import {OpenLaunch} from "../dist/index.js";

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
   if(band==="scl"&&masked)values[0]=9;
   return {raster:{width,height,values,crs:"EPSG:3857",
     transform:[left,(right-left)/width,0,top,0,-(top-bottom)/height]}};
 };
 return {read,count:()=>calls};
}
test("stage 11 validates bounded dates and only real qualified COG scene assets",()=>{
 assert.equal(SENTINEL_TERRAIN_OVERLAY_VERSION,1);
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
