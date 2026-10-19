import test from "node:test";
import assert from "node:assert/strict";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";
import { isMeteosatImage, MeteosatClient } from "../dist/providers/meteosat.js";

const xml="<WMT_MS_Capabilities><Capability><Layer><Title>Meteosat mock</Title><Layer><Name>demo:clouds</Name><Title>Clouds</Title><Extent name=\"time\">2026-10-12T12:00:00Z,2026-10-12T12:10:00Z,2026-10-12T12:20:00Z,2026-10-12T12:30:00Z</Extent></Layer><Layer><Name>demo:untimed</Name></Layer></Layer></Capability></WMT_MS_Capabilities>";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64");
const options={layer:"demo:clouds",bounds3857:[1300000,6200000,1900000,6900000],width:256,height:256,maxFrames:4};
const capabilities=()=>new Response(xml,{headers:{"content-type":"text/xml"}});
const image=()=>new Response(png,{headers:{"content-type":"image/png"}});
function fixtureFetch(url){
 const u=new URL(url);
 if(u.searchParams.get("REQUEST")==="GetCapabilities")return capabilities();
 if(u.searchParams.get("REQUEST")!=="GetMap")throw Error("Unexpected provider call");
 const time=u.searchParams.get("TIME");
 if(time==="2026-10-12T12:10:00.000Z")return new Response("not found",{status:404});
 if(time==="2026-10-12T12:20:00.000Z")return new Response("<ServiceException>WMS failure</ServiceException>",{headers:{"content-type":"image/png"}});
 return image();
}
test("v1.5 playback gets actual bytes, reports partial failure, and never claims acquisition time",async()=>{
 let calls=0;
 const maps=new SpaceMapClient({fetch:async(url)=>{calls++;return fixtureFetch(url);}});
 const data=await maps.meteosatPlayback(options);
 assert.equal(data.status,"advertised");
 assert.equal(data.frames.length,4);
 assert.deepEqual(data.frames.map(f=>f.status),["available","unavailable","error","available"]);
 assert.deepEqual([data.availableCount,data.unavailableCount,data.errorCount,data.skippedCount],[2,1,1,0]);
 assert.equal(data.totalBytes,png.length*2);
 assert.equal(calls,5);
 assert.ok(data.frames.every(f=>f.acquiredAt===null&&f.verifiedAcquisition===false));
 assert.equal(data.verifiedAcquisition,false);
 assert.deepEqual(Buffer.from(data.frames[0].image),png);
 assert.equal(data.frames[1].image,null);
 assert.equal(data.frames[2].image,null);
 assert.ok(data.frames.every(f=>new Date(f.checkedAt).getTime()>0));
 assert.equal(new URL(data.frames[0].request.url).searchParams.get("TIME"),data.frames[0].advertisedTime);
});
test("v1.5 image header check refuses WMS HTML or malformed PNG disguised by MIME",()=>{
 assert.equal(isMeteosatImage(png,"image/png"),true);
 assert.equal(isMeteosatImage(new TextEncoder().encode("<html>"),"image/png"),false);
 assert.equal(isMeteosatImage(png,"text/html"),false);
 assert.equal(isMeteosatImage(new Uint8Array([255,216,255,0]),"image/jpeg"),true);
});
test("v1.5 byte budget stops requesting further frames and never retains excess bytes",async()=>{
 let downloads=0;
 const large=new Uint8Array(800);large.set(png.slice(0,8));
 const client=new MeteosatClient({fetch:async(url)=>{
   if(new URL(url).searchParams.get("REQUEST")==="GetCapabilities")return capabilities();
   downloads++;
   return new Response(large,{headers:{"content-type":"image/png"}});
 }});
 const data=await client.playback({...options,maxTotalBytes:1024});
 assert.equal(downloads,2);
 assert.deepEqual(data.frames.map(f=>f.status),["available","skipped-budget","skipped-budget","skipped-budget"]);
 assert.equal(data.totalBytes,800);
 assert.equal(data.frames[1].image,null);
 assert.equal(data.skippedCount,3);
});
test("v1.5 rejects excessive memory or frame requests without fetching provider",async()=>{
 const client=new MeteosatClient({fetch:async()=>{throw Error("Should not fetch");}});
 await assert.rejects(client.playback({...options,maxFrames:13}),/maxFrames/);
 await assert.rejects(client.playback({...options,maxTotalBytes:0}),/maxTotalBytes/);
 await assert.rejects(client.playback({...options,maxTotalBytes:33*1024*1024}),/maxTotalBytes/);
});
test("v1.5 keeps no-time layers honest without making GetMap calls",async()=>{
 let maps=0;
 const client=new MeteosatClient({fetch:async(url)=>{
   if(new URL(url).searchParams.get("REQUEST")==="GetMap")maps++;
   return capabilities();
 }});
 const result=await client.playback({...options,layer:"demo:untimed"});
 assert.equal(result.status,"no-time-dimension");
 assert.deepEqual(result.frames,[]);
 assert.equal(result.availableCount,0);
 assert.equal(maps,0);
});
