import test from "node:test";
import assert from "node:assert/strict";
import { MeteosatClient, meteosatAdvertisedTimes, parseMeteosatCapabilities } from "../dist/providers/meteosat.js";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";

const xml="<WMT_MS_Capabilities version=\"1.1.1\"><Service><Name>WMS</Name></Service><Capability>\n<Layer><Title>Root time inheritance</Title>\n<Dimension name=\"time\" units=\"ISO8601\">2020-01-01T10:00:00Z/2020-01-01T11:00:00Z/PT10M</Dimension>\n<Layer><Name>demo:clouds</Name><Title>Clouds &amp; Europe</Title></Layer>\n<Layer><Name>demo:infrared</Name><Title>Infrared</Title>\n<Extent name=\"time\">2020-01-01T10:20:00Z,2020-01-01T10:40:00Z,2020-01-01T11:00:00Z</Extent></Layer>\n<Layer><Name>demo:no-time</Name><Extent name=\"time\">current</Extent></Layer>\n</Layer></Capability></WMT_MS_Capabilities>";
const now=new Date("2020-01-01T11:05:00Z");
const latest=["2020-01-01T10:30:00.000Z","2020-01-01T10:40:00.000Z","2020-01-01T10:50:00.000Z","2020-01-01T11:00:00.000Z"];
const fake=()=>new Response(xml,{headers:{"content-type":"application/xml"}});
test("WMS parser correctly separates layer names, titles and inherited Time dimension",()=>{
 const layers=parseMeteosatCapabilities(xml);
 assert.deepEqual(layers.map(x=>x.id),["demo:clouds","demo:infrared","demo:no-time"]);
 assert.equal(layers[0].title,"Clouds & Europe");
 assert.match(layers[0].timeDimension,/PT10M/);
 assert.match(layers[1].timeDimension,/10:20:00/);
 assert.equal(layers[2].timeDimension,"current");
});
test("WMS interval expansion bounded, sorted, no future timestamps",()=>{
 const d="2020-01-01T10:00:00Z/2020-01-01T13:00:00Z/PT10M";
 assert.deepEqual(meteosatAdvertisedTimes(d,4,now),latest);
 assert.deepEqual(meteosatAdvertisedTimes("current,garbage",4,now),[]);
 const joined=d+",2020-01-01T10:40:00Z,2020-01-01T10:40:00Z";
 const frames=meteosatAdvertisedTimes(joined,4,now);
 assert.deepEqual(frames,latest);
 assert.throws(()=>meteosatAdvertisedTimes(d,200,now),/maxFrames/);
 assert.deepEqual(meteosatAdvertisedTimes("2020-01-01T10:00:00Z/current/PT10M",4,now),[]);
});
test("WMS XML rejects dangerous declarations and mismatched closing tags",()=>{
 assert.throws(()=>parseMeteosatCapabilities('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+xml),/external entities/);
 assert.throws(()=>parseMeteosatCapabilities("<WMT_MS_Capabilities><Layer></WMT_MS_Capabilities>"),/Mismatched/);
 assert.throws(()=>parseMeteosatCapabilities("<html>oops</html>"),/capabilities XML/);
});
test("Meteosat timeline maps only capabilities-advertised dates to WMS requests",async()=>{
 const maps=new SpaceMapClient({fetch:async()=>fake()});
 const timeline=await maps.meteosatTimeline({
  layer:"demo:infrared",bounds3857:[1300000,6200000,1900000,6900000],
  width:320,height:240,maxFrames:3,
 });
 assert.equal(timeline.provider,"EUMETView WMS");
 assert.equal(timeline.status,"advertised");
 assert.deepEqual(timeline.frames.map(f=>f.advertisedTime),[
  "2020-01-01T10:20:00.000Z","2020-01-01T10:40:00.000Z","2020-01-01T11:00:00.000Z"
 ]);
 assert.equal(timeline.verifiedAcquisition,false);
 assert.ok(timeline.frames.every(f=>f.acquiredAt===null&&f.verifiedAvailable===false));
 assert.equal(new URL(timeline.frames[1].request.url).searchParams.get("TIME"),"2020-01-01T10:40:00.000Z");
});
test("Missing time layer and unknown layer are explicit, not fabricated frames",async()=>{
 const sdk=new MeteosatClient({fetch:async()=>fake()});
 const options={layer:"demo:no-time",bounds3857:[0,0,100,100],width:64,height:64,maxFrames:4};
 const without=await sdk.timeline(options);
 assert.equal(without.status,"unparseable-times");
 assert.deepEqual(without.frames,[]);
 await assert.rejects(sdk.timeline({...options,layer:"demo:missing"}),/not in current WMS capabilities/);
 await assert.rejects(sdk.timeline({...options,maxFrames:49}),/maxFrames/);
});
