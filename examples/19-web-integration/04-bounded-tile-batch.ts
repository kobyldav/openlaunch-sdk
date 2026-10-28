import {SpaceMapClient} from "../../src/index.js";
const jpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,255,217]);
let calls=0;
const sdk=new SpaceMapClient({fetch:async()=>{calls++;
 return new Response(jpeg.slice(),{headers:{"content-type":"image/jpeg"}});}});
const tile={layer:"nasa-modis-terra" as const,date:"2026-10-17",z:5,x:17,y:11};
const report=await sdk.webMapDailyTilesBatch({tiles:[tile,tile,{...tile,x:18}],concurrency:2});
if(report.available!==3||report.uniqueRequested!==2||calls!==2||report.verifiedAcquisition)
 throw Error("Batch deduplication failed");
console.log("PASS batch",report.requested,"tile requests",calls,"provider requests");
