import test from "node:test";
import assert from "node:assert/strict";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";
import { exploreSpaceObservations } from "../dist/intelligence/observation-explorer.js";
import { inspectEoProduct } from "../dist/eo/products.js";

const mk=(id,collection,time,cloud,assets)=>({
 type:"Feature",id,collection,geometry:null,properties:{
   datetime:time,...(cloud!==null?{"eo:cloud_cover":cloud}:{})
 },assets
});
const optical=[
 mk("S2-low","sentinel-2-l2a","2026-10-10T09:00:00Z",8,{
  visual:{href:"https://example.org/sentinel-preview.jpg",roles:["visual"],type:"image/jpeg",gsd:10}
 }),
 mk("S2-cloudy","sentinel-2-l2a","2026-10-12T09:00:00Z",64,{
  visual:{href:"https://example.org/overcast.jpg",roles:["visual"],type:"image/jpeg",gsd:10}
 }),
 mk("S2-empty","sentinel-2-l2a","2026-10-11T09:00:00Z",0,{}),
 mk("S2-future","sentinel-2-l2a","2026-11-11T09:00:00Z",0,{
  visual:{href:"https://example.org/future.jpg",roles:["visual"]}
 }),
];
const radar=[
 mk("S1-radar","sentinel-1-grd","2026-10-11T09:00:00Z",null,{
  vv:{href:"https://example.org/vv.tif",roles:["data"],type:"image/tiff",gsd:10}
 })
];
const thermal=[
 mk("LC-thermal","landsat-c2-l2","2026-10-12T08:00:00Z",null,{
  st_b10:{href:"https://example.org/thermal.tif",roles:["data"],type:"image/tiff",gsd:30}
 }),
 mk("LC-no-temperature","landsat-c2-l2","2026-10-12T07:00:00Z",null,{
  qa:{href:"https://example.org/qa.tif",roles:["mask"],type:"image/tiff"}
 }),
];
const scenesByCollection={
 "sentinel-2-l2a":optical,
 "sentinel-1-grd":radar,
 "landsat-c2-l2":thermal,
 "cop-dem-glo-30":[mk("DEM","cop-dem-glo-30",null,null,{
  dem:{href:"https://example.org/dem.tif",roles:["data"],type:"image/tiff",gsd:30}
 })],
};
const bounds=[13.4,49.8,14.5,50.5];
const selection={area:{center:[14.42,50.08],radiusKm:10},from:"2026-10-01",to:"2026-10-15",perSourceLimit:10,maxResults:20};
function mockSdk(requests=[],unavailable=null){
 return new SpaceMapClient({fetch:async (url,init={})=>{
  const body=JSON.parse(String(init.body??"{}"));
  const collection=body.collections?.[0];
  requests.push({url:String(url),body});
  if(unavailable===collection)throw Error("private-secret=DO-NOT-EXPOSE");
  return new Response(JSON.stringify({type:"FeatureCollection",features:scenesByCollection[collection]??[]}),
   {status:200,headers:{"content-type":"application/json"}});
 }});
}
test("v1.9 location search reuses real STAC clients, skips missing assets/future scenes and deduplicates",async()=>{
 const requests=[],sdk=mockSdk(requests);
 const result=await sdk.exploreObservations(selection);
 assert.equal(result.status,"complete");
 assert.equal(result.catalogOnly,true);
 assert.equal(result.queryStatuses.length,3);
 assert.deepEqual(requests.map(r=>r.body.collections[0]).sort(),["landsat-c2-l2","sentinel-1-grd","sentinel-2-l2a"]);
 assert.equal(requests.every(r=>r.body.intersects.type==="Polygon"),true);
 assert.deepEqual(result.observations.map(o=>o.sourceId),["S2-cloudy","LC-thermal","S1-radar","S2-low"]);
 assert.equal(result.returned,4);
 assert.equal(result.countsByLayer.optical,2);
 assert.equal(result.countsByLayer.thermal,1);
 assert.equal(result.countsByLayer.radar,1);
 const opticalResult=result.observations.find(o=>o.sourceId==="S2-low");
 assert.equal(opticalResult.acquiredAt,"2026-10-10T09:00:00.000Z");
 assert.equal(opticalResult.previewUrl,"https://example.org/sentinel-preview.jpg");
 assert.equal(opticalResult.previewVerified,false);
 assert.deepEqual(opticalResult.resolutionMetres,[10]);
 assert.equal(result.observations.every(o=>o.catalogOnly),true);
});
test("v1.9 can sort by scene-wide catalog cloud percentage, without inventing clear AOI",async()=>{
 const result=await mockSdk().exploreObservations({...selection,sort:"least-cloudy",layers:["optical"],maxCloudCoverPercent:70});
 assert.deepEqual(result.observations.map(x=>x.sourceId),["S2-low","S2-cloudy"]);
 assert.match(result.warnings.join(" "),/Cloud coverage is an estimate/);
 const strict=await mockSdk().exploreObservations({...selection,layers:["optical"],maxCloudCoverPercent:10});
 assert.deepEqual(strict.observations.map(x=>x.sourceId),["S2-low"]);
});
test("v1.9 provider errors remain partial and never expose provider error secrets",async()=>{
 const calls=[],result=await mockSdk(calls,"sentinel-1-grd").exploreObservations(selection);
 assert.equal(result.status,"partial");
 assert.equal(result.observations.some(x=>x.layer==="radar"),false);
 assert.ok(result.queryStatuses.some(x=>x.status==="error"));
 assert.equal(JSON.stringify(result).includes("private-secret"),false);
 assert.match(result.warnings.join(" "),/partial/);
});
test("v1.9 valid area bounding box and optional DEM with honest missing time",async()=>{
 const sdk=mockSdk();
 const report=await sdk.exploreObservations({...selection,area:{bounds},layers:["elevation","radar"]});
 assert.equal(report.observations.length,2);
 const dem=report.observations.find(x=>x.layer==="elevation");
 assert.equal(dem.acquiredAt,null);
 assert.equal(dem.acquisitionTimeSource,"not-declared");
 assert.equal(dem.catalogOnly,true);
 assert.ok(report.warnings.some(w=>w.includes("Static terrain")));
});
test("v1.9 input constraints reject invalid bounds, dateline geometry, time windows and query budgets",async()=>{
 const sdk=mockSdk();
 const invalid=[
  {...selection,area:{center:[200,50]}},
  {...selection,area:{center:[179.99,10],radiusKm:50}},
  {...selection,area:{bounds:[15,51,14,50]}},
  {...selection,area:{center:[14,50],radiusKm:201}},
  {...selection,from:"garbage"},
  {...selection,from:"2026-10-20"},
  {...selection,maxResults:1000},
  {...selection,perSourceLimit:1000},
  {...selection,layers:["aliens"]},
 ];
 for(const candidate of invalid) await assert.rejects(sdk.exploreObservations(candidate),RangeError);
});
test("v1.9 no imagery is downloaded even when STAC provides asset URLs",async()=>{
 const requests=[],sdk=mockSdk(requests);
 await sdk.exploreObservations({...selection,layers:["optical"]});
 assert.equal(requests.length,1);
 assert.ok(requests[0].url.includes("stac.dataspace.copernicus.eu"));
 assert.equal(requests[0].body.collections[0],"sentinel-2-l2a");
});
test("v1.9 expired records and unsafe preview protocols are never advertised as ready",async()=>{
 const item=mk("S2-unsafe","sentinel-2-l2a","2026-10-12T09:00:00Z",2,
  {visual:{href:"javascript:alert(1)",roles:["visual"],type:"image/jpeg"}});
 const fake={discover:async()=>({
  scenes:[{provider:"copernicus",layer:"optical",item,product:inspectEoProduct(item)}],
  queryStatuses:[{provider:"copernicus",layer:"optical",collection:"sentinel-2-l2a",status:"ok",returned:1}],
  warnings:[],catalogOnly:true,
 })};
 const result=await exploreSpaceObservations(fake,{...selection,layers:["optical"]});
 assert.equal(result.observations[0].previewUrl,null);
 assert.equal(result.observations[0].previewVerified,false);
});
