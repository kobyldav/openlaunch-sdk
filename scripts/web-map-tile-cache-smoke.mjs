import assert from "node:assert/strict";
import {SpaceMapClient} from "@openlaunchsdk/earth";
const sample=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,255,217]);
let fetched=0;
const maps=new SpaceMapClient({webMapTileCache:{maxEntries:8,maxTotalBytes:1024,ttlMs:60_000},
 fetch:async(_url,init)=>{
   assert.equal(init.redirect,"error");
   fetched++;
   return new Response(sample.slice(),{headers:{"content-type":"image/jpeg"}});
 }});
const tiles=[{layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:17,y:11},
 {layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:17,y:11},
 {layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:18,y:11}];
const report=await maps.webMapDailyTilesBatch({tiles,concurrency:2});
assert.equal(report.requested,3);
assert.equal(report.available,3);
assert.equal(report.uniqueRequested,2);
assert.equal(fetched,2);
assert.equal(report.verifiedAcquisition,false);
const cached=await maps.webMapDailyTilesBatch({tiles,concurrency:2});
assert.equal(cached.cacheHits,3);
assert.equal(fetched,2);
maps.clearWebMapTileCache();
assert.equal(maps.webMapTileCacheStats().entries,0);
console.log("PASS OpenLaunch v1.22 GIBS Tile Cache & Batch");
console.log("Requested tiles:",report.requested);
console.log("Unique NASA requests:",fetched);
console.log("Cache hits in second batch:",cached.cacheHits);
console.log("Tile acquisition verified:",report.verifiedAcquisition);
