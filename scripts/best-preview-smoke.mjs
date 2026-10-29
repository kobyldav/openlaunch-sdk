import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunchsdk/earth";
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const scenes=[
 {type:"Feature",id:"S2-CLOUDY",collection:"sentinel-2-l2a",geometry:null,
  properties:{datetime:"2026-10-14T10:00:00Z","eo:cloud_cover":95},
  assets:{visual:{href:"https://images.example.org/S2-CLOUDY.png",type:"image/png",roles:["visual"],gsd:10}}},
 {type:"Feature",id:"S2-CLEAR",collection:"sentinel-2-l2a",geometry:null,
  properties:{datetime:"2026-09-20T10:00:00Z","eo:cloud_cover":1},
  assets:{visual:{href:"https://images.example.org/S2-CLEAR.png",type:"image/png",roles:["visual"],gsd:10}}},
];
const requests={catalog:0,items:0,images:0};
const sdk=new SpaceMapClient({
 previewAllowedHosts:["images.example.org"],
 fetch:async url=>{
  const u=new URL(String(url));
  if(u.pathname.endsWith("/search")){
   requests.catalog++;
   return new Response(JSON.stringify({type:"FeatureCollection",features:scenes}),
     {headers:{"content-type":"application/json"}});
  }
  if(u.pathname.includes("/collections/")){
   requests.items++;
   const scene=scenes.find(s=>s.id===u.pathname.split("/").pop());
   return new Response(JSON.stringify(scene),{headers:{"content-type":"application/json"}});
  }
  requests.images++;
  if(u.pathname.endsWith("S2-CLOUDY.png"))return new Response("missing",{status:404});
  return new Response(png.slice(),{headers:{"content-type":"image/png"}});
 }
});
const result=await sdk.bestAvailablePreview({
 area:{center:[14.42,50.08],radiusKm:10},
 from:"2026-09-01",to:"2026-10-15",
 layers:["optical"],strategy:"recent",maxAttempts:2,
});
assert.equal(result.status,"delivered");
assert.equal(result.attempted,2);
assert.equal(result.fallbackUsed,true);
assert.equal(result.selected?.observation.sourceId,"S2-CLEAR");
assert.equal(result.selected?.preview.previewVerified,true);
assert.equal(result.verifiedAcquisition,false);
assert.equal(requests.catalog,1);
assert.equal(requests.images,2);
console.log("PASS OpenLaunch v1.11 Best Available Satellite Preview");
console.log("Catalog searches:",requests.catalog);
console.log("Preview attempts:",result.attempted);
console.log("Fallback used:",result.fallbackUsed);
console.log("Selected observation:",result.selected?.observation.sourceId);
console.log("Verified image bytes:",result.selected?.preview.byteLength);
console.log("Sensor acquisition independently verified:",result.verifiedAcquisition);
