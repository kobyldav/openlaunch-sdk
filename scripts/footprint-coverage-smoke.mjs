import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunchsdk/earth";
const polygon=(w,s,e,n)=>({type:"Polygon",coordinates:[[
 [w,s],[e,s],[e,n],[w,n],[w,s]
]]});
const data=[
 {type:"Feature",id:"S2-PART",collection:"sentinel-2-l2a",
  geometry:polygon(14,49.8,14.4,50.2),properties:{datetime:"2026-10-10T10:00:00Z","eo:cloud_cover":10},
  assets:{visual:{href:"https://images.example.org/part.png",roles:["visual"],type:"image/png",gsd:10}}},
 {type:"Feature",id:"S2-FULL",collection:"sentinel-2-l2a",
  geometry:polygon(13.9,49.7,14.9,50.3),properties:{datetime:"2026-10-10T10:00:00Z","eo:cloud_cover":10},
  assets:{visual:{href:"https://images.example.org/full.png",roles:["visual"],type:"image/png",gsd:10}}},
];
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const calls={search:0,items:0,images:0};
const maps=new SpaceMapClient({previewAllowedHosts:["images.example.org"],fetch:async url=>{
 const u=new URL(String(url));
 if(u.pathname.endsWith("/search")){
  calls.search++;
  return new Response(JSON.stringify({type:"FeatureCollection",features:data}),
   {headers:{"content-type":"application/json"}});
 }
 if(u.pathname.includes("/collections/")){
  calls.items++;
  return new Response(JSON.stringify(data.find(x=>x.id===u.pathname.split("/").pop())));
 }
 calls.images++;
 return new Response(png.slice(),{headers:{"content-type":"image/png"}});
}});
const selected=await maps.bestAvailablePreview({
 area:{bounds:[14,49.8,14.8,50.2]},from:"2026-10-01",to:"2026-10-15",
 layers:["optical"],strategy:"balanced",minFootprintCoveragePercent:75,maxAttempts:2,
});
assert.equal(selected.status,"delivered");
assert.equal(selected.selected.observation.sourceId,"S2-FULL");
assert.equal(selected.selected.observation.footprintCoveragePercent,100);
assert.equal(selected.selected.observation.pixelCoverageVerified,false);
assert.equal(selected.selected.preview.previewVerified,true);
assert.equal(calls.images,1);
console.log("PASS OpenLaunch v1.12 STAC Footprint Coverage");
console.log("Selected observation:",selected.selected.observation.sourceId);
console.log("Estimated area coverage:",selected.selected.observation.footprintCoveragePercent+"%");
console.log("Preview image downloads:",calls.images);
console.log("Pixel coverage verified:",selected.selected.observation.pixelCoverageVerified);
