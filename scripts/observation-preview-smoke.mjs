import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunchsdk/earth";
const image=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const item={
 type:"Feature",id:"S2-CZ",collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2026-10-10T10:05:00Z"},
 assets:{visual:{href:"https://images.example.org/preview.png",type:"image/png",roles:["visual"]}}
};
let stac=0,images=0;
const sdk=new SpaceMapClient({
 previewAllowedHosts:["images.example.org"],
 fetch:async url=>{
  if(String(url).includes("/collections/")){
   stac++;return new Response(JSON.stringify(item),{headers:{"content-type":"application/json"}});
  }
  images++;return new Response(image.slice(),{headers:{"content-type":"image/png"}});
 }
});
const result=await sdk.fetchObservationPreview({
 provider:"copernicus",collection:"sentinel-2-l2a",itemId:"S2-CZ"
});
assert.equal(result.previewVerified,true);
assert.equal(result.contentType,"image/png");
assert.equal(result.byteLength,image.length);
assert.equal(result.verifiedAcquisition,false);
assert.equal(stac,1);assert.equal(images,1);
console.log("PASS OpenLaunch v1.10 Verified Observation Preview");
console.log("STAC lookups:",stac);
console.log("Real image byte responses:",images);
console.log("Validated preview bytes:",result.byteLength);
console.log("Acquisition independently verified:",result.verifiedAcquisition);
