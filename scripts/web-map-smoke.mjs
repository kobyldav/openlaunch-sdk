import assert from "node:assert/strict";
import {SpaceMapClient} from "@openlaunch/earth";
const scene={type:"Feature",id:"S2-WEB",collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2026-10-14T10:00:00Z","eo:cloud_cover":5},
 assets:{visual:{href:"https://assets.example.test/preview.png?token=HIDDEN_TOKEN",
  roles:["visual"],type:"image/png",gsd:10}}};
const image=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
let search=0,items=0,images=0;
const maps=new SpaceMapClient({previewAllowedHosts:["assets.example.test"],
 fetch:async(url)=>{
  if(String(url).includes("/search")){search++;
   return new Response(JSON.stringify({type:"FeatureCollection",features:[scene]}),{
    headers:{"content-type":"application/json"}});
  }
  if(String(url).includes("/collections/")){items++;
   return new Response(JSON.stringify(scene),{headers:{"content-type":"application/json"}});
  }
  images++;
  return new Response(image.slice(),{headers:{"content-type":"image/png"}});
 }});
const map=await maps.webMapSearch({layer:"sentinel2-optical",
 area:{center:[14.42,50.08],radiusKm:10},from:"2026-10-01",to:"2026-10-20"});
assert.equal(map.status,"ready");
assert.equal(map.scenes.length,1);
assert.equal(JSON.stringify(map).includes("HIDDEN_TOKEN"),false);
const preview=await maps.fetchObservationPreview(map.scenes[0].preview.request);
assert.equal(preview.byteLength,9);
assert.equal(preview.previewVerified,true);
const daily=maps.webMapDaily({layer:"nasa-modis-terra",date:"2026-10-17"});
assert.equal(daily.delivery,"unchecked");
assert.equal(daily.verifiedAcquisition,false);
assert.ok(daily.urlTemplate.includes("/2026-10-17/"));
assert.deepEqual([search,items,images],[1,1,1]);
console.log("PASS OpenLaunch v1.20 Web Map Integration");
console.log("STAC searches:",search,"item lookups:",items,"preview downloads:",images);
console.log("Scene metadata signed URLs exposed:",false);
console.log("Preview bytes verified:",preview.byteLength);
console.log("NASA tile day:",daily.requestedDate,"verified acquisition:",daily.verifiedAcquisition);
