import test from "node:test";
import assert from "node:assert/strict";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";
import { buildSpaceArchive } from "../dist/intelligence/space-archive.js";
const xml="<WMT_MS_Capabilities><Capability><Layer><Name>demo:clouds</Name><Extent name=\"time\">2020-01-01T10:00:00Z,2020-01-01T10:10:00Z,2020-01-01T10:20:00Z</Extent></Layer></Capability></WMT_MS_Capabilities>";
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const jpeg=new Uint8Array([255,216,255,217,0]);
const tile={z:2,x:1,y:1};
const dateRequest={source:"nasa-gibs",layer:"MODIS_Terra_CorrectedReflectance_TrueColor",
  from:"2020-01-01",to:"2020-01-03",maxFrames:3};
const meteor={source:"meteosat",layer:"demo:clouds",bounds3857:[1300000,6200000,1900000,6900000],
  width:128,height:128,maxFrames:3};
function sdk(trace) {
 return new SpaceMapClient({fetch:async url=>{
   const parsed=new URL(String(url));
   if(parsed.searchParams.get("REQUEST")==="GetCapabilities")
     return new Response(xml,{headers:{"content-type":"text/xml"}});
   trace.calls.push(String(url));
   if(parsed.searchParams.get("TIME")==="2020-01-01T10:10:00.000Z" ||
      parsed.pathname.includes("/2020-01-02/"))
     return new Response("gone",{status:404});
   if(parsed.searchParams.get("REQUEST")==="GetMap")
     return new Response(png,{headers:{"content-type":"image/png"}});
   return new Response(jpeg,{headers:{"content-type":"image/jpeg"}});
 }});
}
test("v1.8 NASA requested daily archive is chronological and initially unverified",async()=>{
 const trace={calls:[]},client=sdk(trace);
 const out=await client.archivePlayback(dateRequest);
 assert.equal(out.source,"nasa-gibs");
 assert.equal(out.timelineStatus,"generated");
 assert.deepEqual(out.frames.map(x=>x.time),["2020-01-01","2020-01-02","2020-01-03"]);
 assert.ok(out.frames.every(x=>x.observedAt===null&&!x.verifiedAcquisition));
 assert.ok(out.frames.every(x=>x.delivery==="unchecked" && x.mapKind==="wmts-xyz"));
 assert.equal(out.checkedFrames,0);
 assert.equal(out.verifiedFrames,0);
 assert.equal(trace.calls.length,0);
 assert.match(out.frames[0].mapUrl,/\{z\}\/\{y\}\/\{x\}/);
});
test("v1.8 NASA sample checks are bounded and cannot imply entire scene readiness",async()=>{
 const trace={calls:[]},client=sdk(trace);
 const out=await client.archivePlayback({...dateRequest,verifyLast:2,sampleTile:tile});
 assert.equal(out.checkedFrames,2);
 assert.deepEqual(out.frames.map(x=>x.delivery),["unchecked","unavailable","sample-available"]);
 assert.ok(out.frames.every(x=>x.fullImageReady===false&&x.observedAt===null));
 assert.deepEqual(out.frames.map(x=>x.verifiedScope),["none","sample-tile","sample-tile"]);
 assert.equal(out.verifiedFrames,1);
 assert.equal(trace.calls.length,2);
 assert.ok(trace.calls.every(x=>x.includes("/2/1/1.jpg")));
});
test("v1.8 NASA rejects reversed windows and unbounded verification",async()=>{
 const client=sdk({calls:[]});
 await assert.rejects(client.archivePlayback({...dateRequest,to:"2019-12-30"}),/reversed/);
 await assert.rejects(client.archivePlayback({...dateRequest,maxFrames:2}),/maxFrames/);
 await assert.rejects(client.archivePlayback({...dateRequest,verifyLast:1}),/sampleTile/);
 await assert.rejects(client.archivePlayback({...dateRequest,verifyLast:9,sampleTile:tile}),/verifyLast/);
 await assert.rejects(client.archivePlayback({...dateRequest,from:"not-a-day"}),/Invalid archive/);
});
test("v1.8 Meteosat archive uses provider-advertised WMS times and verifies last two images",async()=>{
 const trace={calls:[]},client=sdk(trace);
 const out=await client.archivePlayback({...meteor,verifyLast:2});
 assert.equal(out.source,"meteosat");
 assert.equal(out.timelineStatus,"advertised");
 assert.deepEqual(out.frames.map(x=>x.time),[
  "2020-01-01T10:00:00.000Z","2020-01-01T10:10:00.000Z","2020-01-01T10:20:00.000Z"]);
 assert.deepEqual(out.frames.map(x=>x.delivery),["unchecked","unavailable","image-available"]);
 assert.equal(out.checkedFrames,2);
 assert.equal(out.verifiedFrames,1);
 assert.deepEqual(out.frames.map(x=>x.fullImageReady),[false,false,true]);
 assert.equal(out.frames[2].verifiedScope,"full-wms-image");
 assert.equal(out.frames[2].observedAt,null);
 assert.ok(out.frames.every(x=>x.mapUrl.includes("REQUEST=GetMap")));
 assert.equal(trace.calls.length,2);
 const repeat=await client.archivePlayback({...meteor,verifyLast:2});
 assert.equal(repeat.verifiedFrames,1);
 assert.equal(trace.calls.length,3); // failed 404 is not cached; valid WMS frame is.
});
test("v1.8 Meteosat missing TIME metadata yields no fabricated observations",async()=>{
 const client=new SpaceMapClient({fetch:async()=>new Response(
  "<WMT_MS_Capabilities><Capability><Layer><Name>demo:clouds</Name></Layer></Capability></WMT_MS_Capabilities>",
  {headers:{"content-type":"text/xml"}})});
 const out=await client.archivePlayback({...meteor,verifyLast:3});
 assert.equal(out.timelineStatus,"no-time-dimension");
 assert.deepEqual(out.frames,[]);
 assert.equal(out.verifiedFrames,0);
 assert.equal(out.checkedFrames,0);
});
test("v1.8 validates callback limits before accessing providers",async()=>{
 const fake={gibs:{fetchTile:async()=>{throw Error("unexpected")}},meteosat:{timeline:async()=>{throw Error("unexpected")},fetchMap:async()=>{throw Error("unexpected")}}};
 await assert.rejects(buildSpaceArchive(fake,{...meteor,verifyLast:50}),/verifyLast/);
 await assert.rejects(buildSpaceArchive(fake,{...meteor,maxFrames:49}),/maxFrames/);
});
