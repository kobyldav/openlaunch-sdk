import {SpaceMapClient} from "../../src/index.js";
const jpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,255,217]);
let called=0;
const sdk=new SpaceMapClient({fetch:async input=>{
 called++;
 const x=Number(String(input).match(/\/(\d+)\.(?:jpg|jpeg|png)$/i)?.[1]);
 if(x===3)return new Response(null,{status:404});
 return new Response(jpeg.slice(),{headers:{"content-type":"image/jpeg"}});
}});
const tile={layer:"nasa-modis-terra" as const,date:"2026-10-17",z:5,y:11};
const report=await sdk.webMapDailyTilesBatch({tiles:[1,2,3,1].map(x=>({...tile,x})),concurrency:2});
if(report.requested!==4||report.uniqueRequested!==3||
 report.available!==3||report.missing!==1||called!==3)throw Error("Batch error containment/dedupe failed");
if(report.results.map(x=>x.status).join(",")!=="available,available,missing,available")
 throw Error("Batch input ordering broken");
console.log("PASS mixed NASA batch + retained order",report.requested);
