import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunch/earth";

const xml="<WMT_MS_Capabilities><Capability><Layer><Title>Meteosat mock</Title><Layer><Name>demo:clouds</Name><Title>Clouds</Title><Extent name=\"time\">2026-10-12T12:00:00Z,2026-10-12T12:10:00Z,2026-10-12T12:20:00Z,2026-10-12T12:30:00Z</Extent></Layer><Layer><Name>demo:untimed</Name></Layer></Layer></Capability></WMT_MS_Capabilities>";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64");
const fetch=async(url)=>{
 const u=new URL(url);
 if(u.searchParams.get("REQUEST")==="GetCapabilities")return new Response(xml,{headers:{"content-type":"text/xml"}});
 if(u.searchParams.get("REQUEST")==="GetMap"){
   if(u.searchParams.get("TIME")==="2026-10-12T12:10:00.000Z")return new Response("Missing WMS frame",{status:404});
   if(u.searchParams.get("TIME")==="2026-10-12T12:20:00.000Z")
     return new Response("<ServiceException>broken frame</ServiceException>",{headers:{"content-type":"image/png"}});
   return new Response(png,{headers:{"content-type":"image/png"}});
 }
 throw new Error("Unexpected mock request");
};
const sdk=new SpaceMapClient({fetch});
const result=await sdk.meteosatPlayback({layer:"demo:clouds",bounds3857:[1300000,6200000,1900000,6900000],width:256,height:256,maxFrames:4});
assert.deepEqual(result.frames.map(f=>f.status),["available","unavailable","error","available"]);
assert.equal(result.totalBytes,png.byteLength*2);
assert.equal(result.verifiedAcquisition,false);
assert.ok(result.frames.every(f=>f.acquiredAt===null));
console.log("PASS OpenLaunch v1.5 Meteosat frame playback");
console.log("Frames:",result.frames.map(f=>f.advertisedTime+" "+f.status).join(" | "));
console.log("Received actual mock image bytes:",result.totalBytes);
console.log("Verified satellite acquisition:",result.verifiedAcquisition);

if(process.env.METEOSAT_LIVE==="1"){
 const real=new SpaceMapClient();
 const caps=await real.meteosatCapabilities();
 const layer=process.env.METEOSAT_LAYER??caps.layers.find(x=>x.timeDimension)?.id;
 if(!layer)throw new Error("Provider did not advertise any time-aware Meteosat layer");
 const realResult=await real.meteosatPlayback({
   layer,bounds3857:[1300000,6200000,1900000,6900000],width:256,height:256,maxFrames:1,
 });
 console.log("Real EUMETSAT status:",realResult.status);
 console.log("Real provider frame result:",realResult.frames.map(f=>({time:f.advertisedTime,status:f.status,bytes:f.byteLength})));
 if(realResult.availableCount!==1)throw new Error("Real EUMETSAT did not deliver a verified image response");
}
