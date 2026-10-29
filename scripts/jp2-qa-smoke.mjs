import assert from "node:assert/strict";
import {SpaceMapClient} from "@openlaunchsdk/earth";
import {bbox,readJp2Header} from "@openlaunchsdk/raster";
const jp2=Uint8Array.from(Buffer.from("AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAAgAAAAMAAQcHAAAAAAAPY29scgEAAAAAABEAAACVanAyY/9P/1EAKQAAAAAAAwAAAAIAAAAAAAAAAAAAAAMAAAACAAAAAAAAAAAAAQcBAf9SAAwAAAABAAEEBAAB/1wAB0BASEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAIAAB/5PPtAwIVKfAfCDAOgwD4QQEBAP/2Q==","base64"));
const expected=Uint8Array.from([4,8,9,3,11,6]);
const asset={href:"https://images.example.test/SCL.jp2",type:"image/jp2",
 "proj:epsg":4326,"proj:shape":[2,3],"proj:transform":[14,.01,0,51,0,-.01]};
const item={type:"Feature",id:"S2-JP2",collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2026-10-12T12:00:00Z"},assets:{SCL:asset}};
let lookups=0,downloads=0;
const sdk=new SpaceMapClient({jp2AllowedHosts:["images.example.test"],
 // This deterministic offline fixture uses a mock codec. It tests JP2 header,
 // backend wiring and pixel classifier; use actual OpenJPEG WASM in production.
 jp2Decoder:{decode:async()=>({width:3,height:2,components:1,values:expected.slice()})},
 fetch:async url=>{
  if(String(url).includes("/collections/")){lookups++;return new Response(JSON.stringify(item));}
  downloads++;return new Response(jp2.slice(),{headers:{"content-type":"image/jp2"}});
 }});
assert.equal(readJp2Header(jp2).width,3);
const result=await sdk.analyzeObservationJp2Qa({itemId:"S2-JP2",area:bbox(14,50.98,14.03,51)});
assert.deepEqual([result.quality.clearPixels,result.quality.cloudPixels],[2,2]);
assert.equal(result.sourceSceneVerified,false);
console.log("PASS OpenLaunch v1.17 JP2 STAC SCL Pipeline");
console.log("Real JP2 header parsed:",readJp2Header(jp2).width+"x"+readJp2Header(jp2).height);
console.log("STAC item lookups:",lookups,"image downloads:",downloads);
console.log("SCL clear/cloud pixels:",result.quality.clearPixels+"/"+result.quality.cloudPixels);
console.log("Codec in smoke: deterministic adapter (real OpenJPEG WASM is optional)");
