import {SpaceMapClient} from "../../src/index.js";
const jpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,255,217]);
let calls=0;
const sdk=new SpaceMapClient({fetch:async(_url,init)=>{
  if(init?.redirect!=="error")throw Error("Redirect guard missing");
  calls++;return new Response(jpeg.slice(),{headers:{"content-type":"image/jpeg"}});
}});
const result=await sdk.webMapDailyTile({layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:17,y:11});
if(result.status!=="available"||!result.imageVerified||result.byteLength!==jpeg.length||calls!==1||result.verifiedAcquisition)
 throw Error("Verified GIBS tile invalid");
console.log("PASS NASA JPEG bytes",result.byteLength);
