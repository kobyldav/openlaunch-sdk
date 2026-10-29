import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunchsdk/earth";

const fixture="<WMT_MS_Capabilities version=\"1.1.1\"><Service><Name>WMS</Name></Service><Capability>\n<Layer><Title>Root time inheritance</Title>\n<Dimension name=\"time\" units=\"ISO8601\">2020-01-01T10:00:00Z/2020-01-01T11:00:00Z/PT10M</Dimension>\n<Layer><Name>demo:clouds</Name><Title>Clouds &amp; Europe</Title></Layer>\n<Layer><Name>demo:infrared</Name><Title>Infrared</Title>\n<Extent name=\"time\">2020-01-01T10:20:00Z,2020-01-01T10:40:00Z,2020-01-01T11:00:00Z</Extent></Layer>\n<Layer><Name>demo:no-time</Name><Extent name=\"time\">current</Extent></Layer>\n</Layer></Capability></WMT_MS_Capabilities>";
const sdk=new SpaceMapClient({fetch:async()=>new Response(fixture,{headers:{"content-type":"text/xml"}})});
const data=await sdk.meteosatTimeline({
  layer:"demo:clouds",bounds3857:[1300000,6200000,1900000,6900000],
  width:256,height:256,maxFrames:3,
});
assert.equal(data.status,"advertised");
assert.equal(data.frames.length,3);
assert.equal(data.verifiedAcquisition,false);
assert.ok(data.frames.every(f=>f.acquiredAt===null&&!f.verifiedAvailable));
console.log("PASS OpenLaunch v1.4 Meteosat provider-time timeline");
console.log("Layer:",data.layer);
console.log("Provider-advertised frames:",data.frames.map(f=>f.advertisedTime).join(", "));
console.log("Verified satellite capture:",data.verifiedAcquisition);
console.log("Sample WMS URL:",data.frames[2].request.url);

if(process.env.METEOSAT_LIVE==="1"){
  const live=new SpaceMapClient();
  const capabilities=await live.meteosatCapabilities();
  const candidates=capabilities.layers.filter(l=>l.timeDimension);
  console.log("Real EUMETView time-aware layers:",candidates.length);
  if(!candidates.length)throw new Error("EUMETView currently advertises no supported Time dimensions");
  const name=process.env.METEOSAT_LAYER??candidates[0].id;
  const timeline=await live.meteosatTimeline({
    layer:name,bounds3857:[1300000,6200000,1900000,6900000],
    width:256,height:256,maxFrames:4,
  });
  console.log("Live layer:",timeline.layer,"status:",timeline.status);
  console.log("Real provider-advertised timestamps:",timeline.frames.map(f=>f.advertisedTime));
  if(!timeline.frames.length)throw new Error("Chosen real layer has no parseable timestamps");
}
