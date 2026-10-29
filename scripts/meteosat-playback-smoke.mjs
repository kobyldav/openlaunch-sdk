import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunchsdk/earth";
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const xml='<WMT_MS_Capabilities><Capability><Layer><Name>demo:clouds</Name><Extent name="time">2020-01-01T10:00:00Z,2020-01-01T10:10:00Z,2020-01-01T10:20:00Z</Extent></Layer></Capability></WMT_MS_Capabilities>';
let imageCalls=0;
const client=new SpaceMapClient({fetch:async url=>{
 if(String(url).includes("GetCapabilities"))return new Response(xml,{headers:{"content-type":"text/xml"}});
 imageCalls++;
 const time=new URL(url).searchParams.get("TIME");
 if(time==="2020-01-01T10:10:00.000Z")return new Response("Missing",{status:404});
 return new Response(png,{headers:{"content-type":"image/png"}});
}});
const result=await client.meteosatPlayback({
 layer:"demo:clouds",bounds3857:[1300000,6200000,1900000,6900000],
 width:128,height:128,maxFrames:3,maxChecks:3,
});
assert.equal(result.checkedFrames,3);
assert.equal(result.playableFrames,2);
assert.equal(imageCalls,3);
assert.deepEqual(result.frames.map(f=>f.availability.status),["available","unavailable","available"]);
assert.equal(result.verifiedAcquisition,false);
console.log("PASS OpenLaunch v1.5 Meteosat frame verification");
console.log("Frame availability:",result.frames.map(f=>f.availability.status).join(", "));
console.log("Playable frames:",result.playableFrames);
console.log("Acquisition verified:",result.verifiedAcquisition);
