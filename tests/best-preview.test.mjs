import test from "node:test";
import assert from "node:assert/strict";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";
import { findBestAvailableObservationPreview } from "../dist/intelligence/best-preview.js";

const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const area={center:[14.42,50.08],radiusKm:10};
const period={area,from:"2026-09-01",to:"2026-10-15",layers:["optical"],maxResults:10};
const scene=(id,date,cloud,resolution=10,withPreview=true)=>({
 type:"Feature",id,collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:date,"eo:cloud_cover":cloud},
 assets:withPreview?{visual:{href:"https://images.example.org/"+id+".png?token=SECRET-"+id,
   type:"image/png",roles:["visual"],gsd:resolution}}:
   {B04:{href:"https://images.example.org/"+id+".tif",roles:["data"],type:"image/tiff",gsd:resolution}}
});
const cloudFree=scene("S2-CLEAR","2026-09-20T10:00:00Z",1);
const cloudy=scene("S2-CLOUDY","2026-10-14T10:00:00Z",95);
const older=scene("S2-OLD","2026-09-11T10:00:00Z",10);
const latest=scene("S2-NEW","2026-10-12T10:00:00Z",30);
function mockSdk(scenes,failedIds=[],config={}){
 const calls={catalog:0,item:[],images:[]};
 const sdk=new SpaceMapClient({
  previewAllowedHosts:["images.example.org"],
  fetch:async (url,init={})=>{
   const target=new URL(String(url));
   if(target.pathname.endsWith("/search")){
    calls.catalog++;
    return new Response(JSON.stringify({type:"FeatureCollection",features:scenes}),
      {headers:{"content-type":"application/json"}});
   }
   if(target.pathname.includes("/collections/")){
    const id=decodeURIComponent(target.pathname.split("/").pop());
    calls.item.push(id);
    const found=scenes.find(s=>s.id===id);
    return found
      ?new Response(JSON.stringify(found),{headers:{"content-type":"application/json"}})
      :new Response("missing",{status:404});
   }
   calls.images.push({path:target.pathname,redirect:init.redirect});
   if(failedIds.includes(target.pathname.split("/").pop()?.replace(".png","")))
     return new Response("missing",{status:404});
   return new Response(png.slice(),{headers:{"content-type":"image/png"}});
  },
  ...config
 });
 return {sdk,calls};
}
test("v1.11 balanced strategy prefers clear scene over recent very cloudy scene and confirms image bytes",async()=>{
 const {sdk,calls}=mockSdk([cloudy,cloudFree]);
 const found=await sdk.bestAvailablePreview({...period,maxAttempts:2});
 assert.equal(found.status,"delivered");
 assert.equal(found.catalogStatus,"complete");
 assert.equal(found.selected.observation.sourceId,"S2-CLEAR");
 assert.equal(found.selected.preview.byteLength,png.length);
 assert.equal(found.selected.preview.previewVerified,true);
 assert.equal(found.selected.preview.verifiedAcquisition,false);
 assert.equal(found.imageDelivered,true);
 assert.equal(found.attempted,1);
 assert.equal(found.fallbackUsed,false);
 assert.equal(calls.catalog,1);
 assert.deepEqual(calls.item,["S2-CLEAR"]);
 assert.equal(calls.images.length,1);
 assert.equal(calls.images[0].redirect,"error");
 assert.equal(JSON.stringify({...found,selected:{...found.selected,preview:{...found.selected.preview,image:undefined}}}).includes("SECRET-"),false);
 assert.equal(Object.hasOwn(found.selected.observation,"previewUrl"),false);
});
test("v1.11 newer strategy and fallback skip broken first preview, deliver next",async()=>{
 const {sdk,calls}=mockSdk([cloudy,cloudFree],["S2-CLOUDY"]);
 const found=await sdk.bestAvailablePreview({...period,maxAttempts:2,strategy:"recent"});
 assert.equal(found.status,"delivered");
 assert.equal(found.selected.observation.sourceId,"S2-CLEAR");
 assert.equal(found.attempted,2);
 assert.equal(found.fallbackUsed,true);
 assert.deepEqual(found.attempts.map(a=>a.outcome),["failed","delivered"]);
 assert.deepEqual(calls.item,["S2-CLOUDY","S2-CLEAR"]);
 assert.equal(calls.images.length,2);
 assert.equal(JSON.stringify({...found,selected:{...found.selected,preview:{...found.selected.preview,image:undefined}}}).includes("SECRET-"),false);
});
test("v1.11 exhausted candidates return not-delivered and bounded retries, no raw provider leaks",async()=>{
 const {sdk,calls}=mockSdk([cloudy,cloudFree,older,latest],
   ["S2-CLOUDY","S2-CLEAR","S2-OLD","S2-NEW"]);
 const found=await sdk.bestAvailablePreview({...period,maxAttempts:2,strategy:"recent"});
 assert.equal(found.status,"not-delivered");
 assert.equal(found.imageDelivered,false);
 assert.equal(found.selected,null);
 assert.equal(found.attempted,2);
 assert.equal(found.candidateCount,4);
 assert.equal(calls.item.length,2);
 assert.ok(found.attempts.every(a=>a.note==="Preview could not be delivered or validated"));
 assert.ok(found.attempts.every(a=>a.outcome==="failed"));
});
test("v1.11 no declared preview means no STAC item fetch or external image request",async()=>{
 const {sdk,calls}=mockSdk([scene("S2-NO-IMAGE","2026-10-12T10:00:00Z",0,10,false)]);
 const found=await sdk.bestAvailablePreview({...period,maxAttempts:3});
 assert.equal(found.status,"no-preview-candidates");
 assert.equal(found.candidateCount,0);
 assert.equal(found.attempted,0);
 assert.equal(found.selected,null);
 assert.equal(calls.catalog,1);
 assert.equal(calls.item.length,0);
 assert.equal(calls.images.length,0);
});
test("v1.11 validates limits, strategies and server trust before any network request",async()=>{
 const {sdk,calls}=mockSdk([cloudFree]);
 for(const options of [{maxAttempts:0},{maxAttempts:6},{maxAttempts:1.2},
   {strategy:"unsupported"}])
  await assert.rejects(sdk.bestAvailablePreview({...period,...options}),RangeError);
 assert.equal(calls.catalog,0);
 const closed=new SpaceMapClient({previewAllowedHosts:[],fetch:async()=>{throw Error("unexpected");}});
 await assert.rejects(closed.bestAvailablePreview(period),/previewAllowedHosts/);
});
test("v1.11 uses deterministic ranking only and never treats metadata preview as verified delivery",async()=>{
 const sample={
  id:"copernicus:sentinel-2-l2a:S2-CLEAR",sourceId:"S2-CLEAR",provider:"copernicus",
  layer:"optical",collection:"sentinel-2-l2a",acquiredAt:"2026-10-01T10:00:00.000Z",
  acquisitionTimeSource:"stac-metadata",cloudCoverPercent:4,resolutionMetres:[10],
  assets:[{key:"visual",kind:"rgb",groundSampleDistanceM:10}],
  previewUrl:"https://images.example.org/file.png?secret=PRIVATE",previewVerified:false,catalogOnly:true,
 };
 let probes=0;
 const client={
  exploreObservations:async()=>({
   status:"partial",observations:[sample],to:"2026-10-15T00:00:00.000Z",
   warnings:["provider failed"],queryStatuses:[],returned:1,
  }),
  fetchObservationPreview:async()=>{probes++;throw Error("signed-url-secret=PRIVATE");},
 };
 const found=await findBestAvailableObservationPreview(client,{...period,maxAttempts:1});
 assert.equal(probes,1);
 assert.equal(found.catalogStatus,"partial");
 assert.equal(found.status,"not-delivered");
 assert.equal(found.selected,null);
 assert.equal(JSON.stringify(found).includes("PRIVATE"),false);
});
test("v1.11 refuses mismatched adapter identity even if it claims image delivery",async()=>{
 const candidate={
  id:"copernicus:sentinel-2-l2a:S2-CLEAR",sourceId:"S2-CLEAR",provider:"copernicus",layer:"optical",
  collection:"sentinel-2-l2a",acquiredAt:"2026-10-01T00:00:00.000Z",
  cloudCoverPercent:2,resolutionMetres:[10],assets:[],previewUrl:"https://images.example.org/x.png",
  previewVerified:false,catalogOnly:true,acquisitionTimeSource:"stac-metadata",
 };
 const fake={
  exploreObservations:async()=>({status:"complete",observations:[candidate],to:"2026-10-15T00:00:00.000Z",warnings:[],queryStatuses:[]}),
  fetchObservationPreview:async()=>({
   provider:"copernicus",collection:"sentinel-2-l2a",itemId:"WRONG",previewVerified:true,imageDelivered:true,
  }),
 };
 const report=await findBestAvailableObservationPreview(fake,period);
 assert.equal(report.status,"not-delivered");
 assert.equal(report.attempts[0].outcome,"failed");
});
