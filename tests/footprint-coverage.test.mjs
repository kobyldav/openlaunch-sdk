import test from "node:test";
import assert from "node:assert/strict";
import { bbox, circle } from "../dist/geo/types.js";
import { estimateFootprintCoverage } from "../dist/intelligence/footprint-coverage.js";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";

const rectangle=(x1,y1,x2,y2)=>({type:"Polygon",coordinates:[[
  [x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]
]]});
const target=bbox(0,0,10,10);
const close=(actual,expected,tolerance=0.03)=>assert.ok(
 Math.abs(actual-expected)<=tolerance,"Expected "+expected+"%, received "+actual+"%"
);
test("v1.12 STAC footprint rectangles produce 100%, 50%, 0% overlap",()=>{
 const full=estimateFootprintCoverage(target,rectangle(-5,-5,15,15));
 const half=estimateFootprintCoverage(target,rectangle(0,0,5,10));
 const zero=estimateFootprintCoverage(target,rectangle(20,20,30,30));
 close(full.coveragePercent,100);
 close(half.coveragePercent,50);
 close(zero.coveragePercent,0);
 for(const result of [full,half,zero]){
  assert.equal(result.basis,"stac-footprint-estimate");
  assert.equal(result.pixelCoverageVerified,false);
 }
});
test("v1.12 polygon holes are subtracted and disjoint multipolygons summed",()=>{
 const withHole={type:"Polygon",coordinates:[
  rectangle(0,0,10,10).coordinates[0],
  rectangle(2.5,2.5,7.5,7.5).coordinates[0],
 ]};
 close(estimateFootprintCoverage(target,withHole).coveragePercent,75);
 const multi={type:"MultiPolygon",coordinates:[
  rectangle(0,0,5,10).coordinates,
  rectangle(5,0,10,10).coordinates
 ]};
 close(estimateFootprintCoverage(target,multi).coveragePercent,100);
});
test("v1.12 circle AOI uses its actual convex polygon rather than 100% of bounding box",()=>{
 const aoi=circle([14.4,50.0],10,32);
 const [w,s,e,n]=aoi.bbox;
 const half=rectangle(w-0.1,s-0.1,(w+e)/2,n+0.1);
 const report=estimateFootprintCoverage(aoi,half);
 close(report.coveragePercent,50,3);
 assert.equal(report.pixelCoverageVerified,false);
});
test("v1.12 absent and invalid geometry cannot pretend coverage",()=>{
 const cases=[
  null,{type:"Point",coordinates:[5,5]},
  {type:"Polygon",coordinates:[]},
  {type:"Polygon",coordinates:[[[0,0],[1,0],[Infinity,1],[0,0]]]},
  {type:"Polygon",coordinates:[[[179,0],[-179,0],[-179,1],[179,0]]]},
 ];
 for(const geometry of cases){
  const result=estimateFootprintCoverage(target,geometry);
  assert.equal(result.coveragePercent,null);
  assert.equal(result.basis,"unknown-geometry");
  assert.equal(result.pixelCoverageVerified,false);
 }
});
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const scene=(id,coverage)=>({
 type:"Feature",id,collection:"sentinel-2-l2a",geometry:coverage,
 properties:{datetime:"2026-10-10T10:00:00Z","eo:cloud_cover":10},
 assets:{visual:{href:"https://images.example.org/"+id+".png?sig=SECRET",
 roles:["visual"],type:"image/png",gsd:10}}
});
const full=scene("FULL",rectangle(13.9,49.5,15,50.5));
const part=scene("PART",rectangle(13.9,49.5,14.45,50.5));
const nullFootprint=scene("UNKNOWN",null);
const options={area:{bounds:[14.0,49.8,14.8,50.2]},from:"2026-10-01",to:"2026-10-15",
 layers:["optical"]};
function mock(items){
 const calls={searches:0,items:[],images:0};
 const client=new SpaceMapClient({previewAllowedHosts:["images.example.org"],fetch:async (url)=>{
  const u=new URL(String(url));
  if(u.pathname.endsWith("/search")){
   calls.searches++;
   return new Response(JSON.stringify({type:"FeatureCollection",features:items}),
    {headers:{"content-type":"application/json"}});
  }
  if(u.pathname.includes("/collections/")){
   const id=decodeURIComponent(u.pathname.split("/").pop());
   calls.items.push(id);
   return new Response(JSON.stringify(items.find(it=>it.id===id)),
    {headers:{"content-type":"application/json"}});
  }
  calls.images++;
  return new Response(png.slice(),{headers:{"content-type":"image/png"}});
 }});
 return {client,calls};
}
test("v1.12 explorer publishes footprint estimates and strict minimum excludes null/partial coverage",async()=>{
 const {client}=mock([part,full,nullFootprint]);
 const all=await client.exploreObservations(options);
 const index=new Map(all.observations.map(x=>[x.sourceId,x]));
 close(index.get("FULL").footprintCoveragePercent,100);
 const percent=index.get("PART").footprintCoveragePercent;
 assert.ok(percent>0 && percent<100);
 assert.equal(index.get("UNKNOWN").footprintCoveragePercent,null);
 assert.equal(index.get("UNKNOWN").footprintCoverageBasis,"unknown-geometry");
 assert.equal(index.get("FULL").pixelCoverageVerified,false);
 const filtered=await client.exploreObservations({...options,minFootprintCoveragePercent:95});
 assert.deepEqual(filtered.observations.map(x=>x.sourceId),["FULL"]);
 await assert.rejects(client.exploreObservations({...options,minFootprintCoveragePercent:101}),RangeError);
 await assert.rejects(client.exploreObservations({...options,minFootprintCoveragePercent:-1}),RangeError);
});
test("v1.12 best preview prefers full geographic coverage when date/clouds/resolution are equal",async()=>{
 const {client,calls}=mock([part,full]);
 const result=await client.bestAvailablePreview({...options,strategy:"balanced",maxAttempts:2});
 assert.equal(result.status,"delivered");
 assert.equal(result.selected.observation.sourceId,"FULL");
 assert.equal(result.selected.observation.footprintCoveragePercent,100);
 assert.equal(result.selected.observation.pixelCoverageVerified,false);
 assert.equal(result.selected.preview.previewVerified,true);
 assert.equal(result.verifiedAcquisition,false);
 assert.equal(calls.images,1);
 assert.deepEqual(calls.items,["FULL"]);
 const secretless={...result,selected:{...result.selected,preview:{...result.selected.preview,image:undefined}}};
 assert.equal(JSON.stringify(secretless).includes("SECRET"),false);
});
test("v1.12 pixel delivery does not change a catalog geometry estimate into verified pixel coverage",async()=>{
 const {client}=mock([full]);
 const result=await client.bestAvailablePreview({...options,minFootprintCoveragePercent:95});
 assert.equal(result.selected.preview.imageDelivered,true);
 assert.equal(result.selected.observation.pixelCoverageVerified,false);
 assert.match(result.warnings.join(" "),/STAC footprint/);
});
