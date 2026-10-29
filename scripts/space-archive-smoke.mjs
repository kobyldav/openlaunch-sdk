import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunchsdk/earth";
const xml="<WMT_MS_Capabilities><Capability><Layer><Name>demo:clouds</Name><Extent name=\"time\">2020-01-01T10:00:00Z,2020-01-01T10:10:00Z,2020-01-01T10:20:00Z</Extent></Layer></Capability></WMT_MS_Capabilities>";
const jpg=new Uint8Array([255,216,255,217,0]);
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
let calls=0;
const sdk=new SpaceMapClient({fetch:async url=>{
 const u=new URL(String(url));
 if(u.searchParams.get("REQUEST")==="GetCapabilities")
   return new Response(xml,{headers:{"content-type":"text/xml"}});
 calls++;
 if(u.searchParams.get("REQUEST")==="GetMap")
   return new Response(png,{headers:{"content-type":"image/png"}});
 return new Response(jpg,{headers:{"content-type":"image/jpeg"}});
}});
const nasa=await sdk.archivePlayback({
 source:"nasa-gibs",layer:"MODIS_Terra_CorrectedReflectance_TrueColor",
 from:"2020-01-01",to:"2020-01-03",maxFrames:3,verifyLast:2,
 sampleTile:{z:2,x:1,y:1},
});
const meteosat=await sdk.archivePlayback({
 source:"meteosat",layer:"demo:clouds",bounds3857:[1300000,6200000,1900000,6900000],
 width:128,height:128,maxFrames:3,verifyLast:2,
});
assert.equal(nasa.frames.length,3);
assert.equal(nasa.verifiedFrames,2);
assert.equal(nasa.frames[2].delivery,"sample-available");
assert.equal(nasa.frames[2].fullImageReady,false);
assert.equal(meteosat.frames.length,3);
assert.equal(meteosat.verifiedFrames,2);
assert.equal(meteosat.frames[2].delivery,"image-available");
assert.equal(meteosat.frames[2].fullImageReady,true);
assert.equal(calls,4);
assert.equal(nasa.verifiedAcquisition,false);
assert.equal(meteosat.verifiedAcquisition,false);
console.log("PASS OpenLaunch v1.8 Space Archive & Playback");
console.log("NASA requested days:",nasa.frames.length,"sample tiles checked:",nasa.checkedFrames);
console.log("Meteosat WMS frames:",meteosat.frames.length,"images verified:",meteosat.verifiedFrames);
console.log("Provider image requests:",calls);
console.log("Acquisition date independently verified:",meteosat.verifiedAcquisition);
