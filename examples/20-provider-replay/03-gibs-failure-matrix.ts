import {SpaceMapClient} from "../../src/index.js";
// Test available, missing, invalid MIME and upstream error independently.
const jpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,255,217]);
const sdk=new SpaceMapClient({fetch:async input=>{
 const url=String(input);
 const x=Number(url.match(/\/(\d+)\.(?:jpg|jpeg|png)$/i)?.[1]);
 if(x===1)return new Response(jpeg.slice(),{headers:{"content-type":"image/jpeg"}});
 if(x===2)return new Response(null,{status:404});
 if(x===3)return new Response("<html>bad</html>",{headers:{"content-type":"image/jpeg"}});
 return new Response("provider error",{status:503});
}});
const tile={layer:"nasa-modis-terra" as const,date:"2026-10-17",z:5,y:11};
const states=await Promise.all([1,2,3,4].map(x=>sdk.webMapDailyTile({...tile,x})));
if(states.map(v=>v.status).join(",")!=="available,missing,invalid,unavailable")
 throw Error("NASA tile response classification regression");
if(states[0]?.verifiedAcquisition!==false)throw Error("Image bytes must not imply acquisition");
console.log("PASS four independent NASA GIBS tile outcomes");
