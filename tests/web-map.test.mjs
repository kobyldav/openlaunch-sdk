import test from "node:test";
import assert from "node:assert/strict";
import {SpaceMapClient} from "../dist/intelligence/map-layers.js";
import {buildWebMapSearch,buildWebMapDaily} from "../dist/intelligence/web-map.js";

const area={center:[14.42,50.08],radiusKm:10};
const period={area,from:"2026-10-01",to:"2026-10-20",maxResults:10,perSourceLimit:10};
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
const fakeHref="https://assets.example.test/S2-CLEAR.png?secret=NEVER_EXPOSE_ME";
const scene={
 type:"Feature",id:"S2-CLEAR",collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2026-10-12T10:00:00Z","eo:cloud_cover":7},
 assets:{
  visual:{href:fakeHref,type:"image/png",roles:["visual"],gsd:10},
  B04:{href:"https://assets.example.test/reflectance.tif?secret=SECRET_BAND",type:"image/tiff",gsd:10}
 }
};
function create(variant="normal") {
 const calls={search:0,item:0,image:0,queries:[]};
 const sdk=new SpaceMapClient({previewAllowedHosts:["assets.example.test"],
  fetch:async (input,init={})=>{
   const url=new URL(String(input));
   if(url.pathname.endsWith("/search")){
    calls.search++;
    calls.queries.push(JSON.parse(String(init.body)));
    if(variant==="provider-error")throw new Error("PRIVATE_TOKEN provider outage");
    const scenes=variant==="empty"?[]:variant==="no-preview"?
     [{...scene,assets:{B04:scene.assets.B04}}]:[scene];
    return new Response(JSON.stringify({type:"FeatureCollection",features:scenes}),{
     headers:{"content-type":"application/json"}});
   }
   if(url.pathname.includes("/collections/")){
    calls.item++;
    return new Response(JSON.stringify(scene),{headers:{"content-type":"application/json"}});
   }
   calls.image++;
   assert.equal(init.redirect,"error");
   return new Response(png.slice(),{headers:{"content-type":"image/png"}});
  }
 });
 return {sdk,calls};
}
test("v1.20 map scene cards are JSON-safe, signed STAC links never leave SDK",async()=>{
 const {sdk,calls}=create();
 const result=await sdk.webMapSearch({...period,layer:"sentinel2-optical"});
 assert.equal(result.status,"ready");
 assert.equal(result.catalogStatus,"complete");
 assert.equal(result.returned,1);
 assert.equal(result.scenes[0].itemId,"S2-CLEAR");
 assert.equal(result.scenes[0].acquiredAt,"2026-10-12T10:00:00.000Z");
 assert.equal(result.scenes[0].cloudCoverPercent,7);
 assert.equal(result.scenes[0].preview.state,"declared-unverified");
 assert.deepEqual(result.scenes[0].preview.request,{
  provider:"copernicus",collection:"sentinel-2-l2a",itemId:"S2-CLEAR"
 });
 assert.equal(result.scenes[0].catalogOnly,true);
 assert.equal(result.scenes[0].pixelCoverageVerified,false);
 assert.equal(result.verifiedAcquisition,false);
 assert.equal(Object.hasOwn(result.scenes[0],"previewUrl"),false);
 assert.equal(JSON.stringify(result).includes("NEVER_EXPOSE_ME"),false);
 assert.equal(JSON.stringify(result).includes("SECRET_BAND"),false);
 assert.equal(calls.search,1);
 assert.equal(calls.item,0);
 assert.equal(calls.image,0);
 assert.deepEqual(calls.queries[0].collections,["sentinel-2-l2a"]);
});
test("v1.20 explicit second step uses verified image delivery only by returned identity",async()=>{
 const {sdk,calls}=create();
 const catalog=await sdk.webMapSearch({...period,layer:"sentinel2-optical"});
 const img=await sdk.fetchObservationPreview(catalog.scenes[0].preview.request);
 assert.equal(img.previewVerified,true);
 assert.equal(img.byteLength,png.length);
 assert.deepEqual([...img.image],[...png]);
 assert.equal(img.contentType,"image/png");
 assert.equal(img.verifiedAcquisition,false);
 assert.equal(JSON.stringify({...img,image:undefined}).includes("NEVER_EXPOSE_ME"),false);
 assert.deepEqual([calls.search,calls.item,calls.image],[1,1,1]);
});
test("v1.20 scene without preview does not invent a delivered image",async()=>{
 const {sdk,calls}=create("no-preview");
 const result=await sdk.webMapSearch({...period,layer:"sentinel2-optical"});
 assert.equal(result.returned,1);
 assert.equal(result.scenes[0].preview.state,"not-declared");
 assert.equal(result.scenes[0].preview.request,null);
 assert.equal(calls.image,0);
});
test("v1.20 empty catalog and failed provider differ, with redacted messages",async()=>{
 const blank=await create("empty").sdk.webMapSearch({...period,layer:"sentinel2-optical"});
 assert.equal(blank.status,"empty");
 assert.equal(blank.catalogStatus,"complete");
 assert.equal(blank.returned,0);
 const fail=await create("provider-error").sdk.webMapSearch({...period,layer:"sentinel2-optical"});
 assert.equal(fail.status,"unavailable");
 assert.equal(fail.catalogStatus,"unavailable");
 assert.equal(fail.scenes.length,0);
 assert.equal(fail.providers[0].status,"error");
 assert.equal(JSON.stringify(fail).includes("PRIVATE_TOKEN"),false);
});
test("v1.20 allowed web layers map to only matching source collection; unsupported rejected",async()=>{
 const {sdk}=create("empty");
 const cases=[
  ["sentinel2-optical","sentinel-2-l2a"],
  ["sentinel1-radar","sentinel-1-grd"],
  ["landsat-temperature","landsat-c2-l2"],
  ["dem-terrain","cop-dem-glo-30"]
 ];
 for(const [layer,collection] of cases){
  const result=await sdk.webMapSearch({...period,layer});
  assert.equal(result.providers.length,1);
  assert.equal(result.providers[0].collection,undefined);
 }
 await assert.rejects(sdk.webMapSearch({...period,layer:"admin-bypass"}),/Unsupported web map scene layer/);
});
test("v1.20 NASA GIBS WMTS tile descriptors are official, daily, and never falsely live",()=>{
 const sdk=new SpaceMapClient();
 for(const [layer,name] of [
  ["nasa-modis-terra","MODIS_Terra_CorrectedReflectance_TrueColor"],
  ["nasa-viirs-noaa20","VIIRS_NOAA20_CorrectedReflectance_TrueColor"]
 ]){
   const result=sdk.webMapDaily({layer,date:"2026-10-17"});
   assert.equal(result.kind,"wmts-xyz");
   assert.equal(result.provider,"nasa-gibs");
   assert.equal(result.requestedDate,"2026-10-17");
   assert.equal(result.verifiedAcquisition,false);
   assert.equal(result.observedAt,null);
   assert.equal(result.delivery,"unchecked");
   assert.ok(result.urlTemplate.startsWith("https://gibs.earthdata.nasa.gov/"));
   assert.ok(result.urlTemplate.includes(name));
   assert.ok(result.urlTemplate.includes("{z}/{y}/{x}"));
 }
 assert.throws(()=>sdk.webMapDaily({layer:"arbitrary",date:"2026-10-17"}),/Unsupported web map daily layer/);
 assert.throws(()=>sdk.webMapDaily({layer:"nasa-modis-terra",date:"invalid-date"}),/Invalid/);
});
test("v1.20 hostile provider warning strings never cross web snapshot",async()=>{
 const fake={
  area:{bbox:[13,49,15,51]},from:"2026-10-01",to:"2026-10-20",
  status:"partial",queryStatuses:[{provider:"copernicus",layer:"optical",status:"error",returned:0,message:"secretToken=PRIVATE"}],
  observations:[],truncated:false,warnings:["https://evil.example?secret=PRIVATE"],catalogOnly:true
 };
 const report=await buildWebMapSearch({exploreObservations:async()=>fake},
  {...period,layer:"sentinel2-optical"});
 assert.equal(report.status,"partial");
 assert.equal(report.providers[0].status,"error");
 assert.equal(JSON.stringify(report).includes("PRIVATE"),false);
});
test("v1.20 NASA tile source must be official before web handoff",()=>{
 assert.throws(()=>buildWebMapDaily({nasaDailyTiles:()=>({
   provider:"nasa-gibs",kind:"wmts-xyz",urlTemplate:"https://evil.example/tiles",
   maxZoom:9,requestedDate:"2026-10-10",attribution:"bad"
 })},{layer:"nasa-modis-terra",date:"2026-10-10"}),/Unexpected NASA map descriptor/);
});
