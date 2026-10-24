import {SpaceMapClient} from "../../src/index.js";
const jpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,255,217]);
let calls=0;
const sdk=new SpaceMapClient({webMapTileCache:{maxEntries:2,ttlMs:60000,maxTotalBytes:1024},
 fetch:async()=>{calls++;return new Response(jpeg.slice(),{headers:{"content-type":"image/jpeg"}});}});
const tile={layer:"nasa-modis-terra" as const,date:"2026-10-17",z:5,x:17,y:11};
const first=await sdk.webMapDailyTileCached(tile);
first.image?.fill(0);
const second=await sdk.webMapDailyTileCached(tile);
if(first.cacheStatus!=="fetched"||second.cacheStatus!=="hit"||second.image?.[0]!==255||calls!==1)
 throw Error("LRU or copy-on-return failed");
sdk.clearWebMapTileCache();
if(sdk.webMapTileCacheStats().entries!==0)throw Error("Cache invalidation failed");
console.log("PASS LRU",calls,"network request for two lookups");
