import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunch/earth";
const records={
 "sentinel-2-l2a":[{type:"Feature",id:"S2-CZ",collection:"sentinel-2-l2a",
  geometry:null,properties:{datetime:"2026-10-10T10:00:00Z","eo:cloud_cover":9},
  assets:{visual:{href:"https://example.org/s2.jpg",roles:["visual"],gsd:10}}}],
 "sentinel-1-grd":[{type:"Feature",id:"S1-CZ",collection:"sentinel-1-grd",
  geometry:null,properties:{datetime:"2026-10-11T10:00:00Z"},
  assets:{vv:{href:"https://example.org/sar.tif",roles:["data"],gsd:10}}}],
 "landsat-c2-l2":[{type:"Feature",id:"LANDSAT-CZ",collection:"landsat-c2-l2",
  geometry:null,properties:{datetime:"2026-10-09T10:00:00Z"},
  assets:{st_b10:{href:"https://example.org/temp.tif",roles:["data"],gsd:30}}}],
};
const requested=[];
const sdk=new SpaceMapClient({fetch:async (_url,init={})=>{
 const params=JSON.parse(String(init.body??"{}"));
 const collection=params.collections?.[0];
 requested.push(collection);
 return new Response(JSON.stringify({type:"FeatureCollection",features:records[collection]??[]}),
   {headers:{"content-type":"application/json"}});
}});
const result=await sdk.exploreObservations({
 area:{center:[14.42,50.08],radiusKm:10},
 from:"2026-10-01",to:"2026-10-15",
});
assert.equal(result.status,"complete");
assert.equal(result.observations.length,3);
assert.deepEqual(requested.sort(),["landsat-c2-l2","sentinel-1-grd","sentinel-2-l2a"]);
assert.equal(result.observations.every(r=>r.catalogOnly&&r.previewVerified===false),true);
console.log("PASS OpenLaunch v1.9 Location-first Observation Explorer");
console.log("Datasets queried:",requested.join(", "));
console.log("Catalog observations:",result.observations.length);
console.log("Observed layers:",Object.keys(result.countsByLayer).join(", "));
console.log("Image pixel downloads: 0 (STAC metadata only)");
