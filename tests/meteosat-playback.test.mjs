import test from "node:test";
import assert from "node:assert/strict";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";
const png=new Uint8Array([137,80,78,71,13,10,26,10,1]);
const xml='<WMT_MS_Capabilities><Capability><Layer><Name>demo:weather</Name><Extent name="time">2020-01-01T10:00:00Z,2020-01-01T10:10:00Z,2020-01-01T10:20:00Z</Extent></Layer></Capability></WMT_MS_Capabilities>';
const options={layer:"demo:weather",bounds3857:[1,2,3,4],width:128,height:128,maxFrames:3,maxChecks:3};
test("bounded Meteosat playback probes selected advertised frames, no false acquisition",async()=>{
 let calls=0;
 const sdk=new SpaceMapClient({fetch:async url=>{
  if(String(url).includes("GetCapabilities"))return new Response(xml,{headers:{"content-type":"text/xml"}});
  calls++;
  if(new URL(url).searchParams.get("TIME")==="2020-01-01T10:10:00.000Z")return new Response("missing",{status:404});
  return new Response(png,{headers:{"content-type":"image/png"}});
 }});
 const result=await sdk.meteosatPlayback(options);
 assert.equal(calls,3);
 assert.equal(result.playableFrames,2);
 assert.equal(result.checkedFrames,3);
 assert.deepEqual(result.frames.map(f=>f.availability.status),["available","unavailable","available"]);
 assert.ok(result.frames.every(f=>f.availability.observedAt===null));
 assert.ok(result.frames.every(f=>new URL(f.mapUrl).searchParams.has("TIME")));
 assert.equal(result.verifiedAcquisition,false);
});
test("Meteosat playback validates request budget and never checks more frames than allowed",async()=>{
 let calls=0;
 const sdk=new SpaceMapClient({fetch:async url=>{
  if(String(url).includes("GetCapabilities"))return new Response(xml);
  calls++;return new Response(png,{headers:{"content-type":"image/png"}});
 }});
 await assert.rejects(sdk.meteosatPlayback({...options,maxChecks:13}),/maxChecks/);
 const limited=await sdk.meteosatPlayback({...options,maxChecks:1});
 assert.equal(calls,1);
 assert.equal(limited.frames[0].advertisedTime,"2020-01-01T10:20:00.000Z");
});
