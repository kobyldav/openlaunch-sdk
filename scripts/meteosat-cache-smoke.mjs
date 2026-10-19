import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunch/earth";
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const capabilities="<WMT_MS_Capabilities><Capability><Layer><Name>demo:clouds</Name><Extent name=\"time\">2020-01-01T10:00:00Z,2020-01-01T10:10:00Z,2020-01-01T10:20:00Z</Extent></Layer></Capability></WMT_MS_Capabilities>";
let imageRequests=0;
const sdk=new SpaceMapClient({fetch:async url=>{
 const request=new URL(String(url));
 if(request.searchParams.get("REQUEST")==="GetCapabilities")
   return new Response(capabilities,{headers:{"content-type":"text/xml"}});
 imageRequests++;
 return new Response(png.slice(),{headers:{"content-type":"image/png"}});
}});
const options={layer:"demo:clouds",bounds3857:[1300000,6200000,1900000,6900000],width:256,height:256,maxFrames:3,maxChecks:3};
const one=await sdk.meteosatPlayback(options);
const two=await sdk.meteosatPlayback(options);
assert.equal(one.playableFrames,3);
assert.equal(two.playableFrames,3);
assert.equal(imageRequests,3);
assert.equal(sdk.meteosatCacheStats().hits,3);
console.log("PASS OpenLaunch v1.6 Meteosat image cache");
console.log("First playback provider image requests:",imageRequests);
console.log("Second playback served from cache:",sdk.meteosatCacheStats().hits);
console.log("Cache entries:",sdk.meteosatCacheStats().entries);
console.log("Acquisition time verified:",two.verifiedAcquisition);
