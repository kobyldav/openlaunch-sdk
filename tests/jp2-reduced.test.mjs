import test from "node:test";
import assert from "node:assert/strict";
import {readJp2Header,decodeJp2Raster,reducedJp2Dimensions,createOpenJpegWasmBackend} from "../dist/eo/jp2.js";
import {analyzeStacJp2Qa} from "../dist/intelligence/jp2-qa.js";
import {bbox} from "../dist/geo/types.js";
const bytes=Uint8Array.from(Buffer.from("AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAIAAAACAAAQcHAAAAAAAPY29scgEAAAAAABEAAACZanAyY/9P/1EAKQAAAAAAIAAAACAAAAAAAAAAAAAAACAAAAAgAAAAAAAAAAAAAQcBAf9SAAwAAAABAAUEBAAB/1wAE0BASEhQSEhQSEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAGAAB/5PPtAgJ0YCAgICA/9k=","base64"));
const full={crs:"EPSG:4326",shape:[32,32],transform:[14,.01,0,51,0,-.01]};
const backend={decode:async(_bytes,opts)=>{
  const p=reducedJp2Dimensions(32,32,opts?.decompositionLevel??0);
  return {width:p.width,height:p.height,components:1,values:new Uint8Array(p.width*p.height).fill(4)};
}};
test("v1.19 reduced dimensions include correct odd-pixel ceiling",()=>{
 assert.deepEqual(reducedJp2Dimensions(35,17,2),{width:9,height:5,scale:4});
 assert.deepEqual(reducedJp2Dimensions(32,32,0),{width:32,height:32,scale:1});
 for(const n of [-1,5,0.5,NaN,Infinity])
   assert.throws(()=>reducedJp2Dimensions(32,32,n),/decompositionLevel/);
 assert.deepEqual(readJp2Header(bytes),{width:32,height:32,components:1,bitsPerComponent:8});
});
test("v1.19 level 2 scales affine basis including skew but preserves CRS and origin",async()=>{
 const reference={...full,transform:[14,.01,.002,51,.003,-.01]};
 const grid=await decodeJp2Raster(bytes,reference,backend,{decompositionLevel:2,maxPixels:64});
 assert.equal(grid.width,8);assert.equal(grid.height,8);
 assert.deepEqual(grid.transform,[14,.04,.008,51,.012,-.04]);
 assert.equal(grid.source,"decoded-jp2-scl-reduced");
 assert.equal(grid.values.length,64);
});
test("v1.19 existing level 0 works unchanged",async()=>{
 const x=await decodeJp2Raster(bytes,full,backend,{maxPixels:1024});
 assert.equal(x.width,32);assert.equal(x.height,32);
 assert.equal(x.source,"decoded-jp2-scl");
 assert.deepEqual(x.transform,[14,.01,0,51,0,-.01]);
});
test("v1.19 output budget checks reduced dimensions; source budget remains enforced",async()=>{
 await assert.rejects(decodeJp2Raster(bytes,full,backend,{maxPixels:63,decompositionLevel:2}),/output dimensions/);
 await assert.rejects(decodeJp2Raster(bytes,full,backend,{maxSourcePixels:100,decompositionLevel:2}),/source dimensions/);
 await assert.rejects(decodeJp2Raster(bytes,full,backend,{decompositionLevel:5}),/decompositionLevel/);
 await assert.rejects(decodeJp2Raster(bytes,full,{decode:async()=>({
  width:32,height:32,components:1,values:new Uint8Array(1024)})},
  {maxPixels:64,decompositionLevel:2}),/dimensions/);
});
test("v1.19 missing codec subresolution support never falls back to a fake downsample",async()=>{
 let destroyed=0;
 const wasm=createOpenJpegWasmBackend(async()=>({J2KDecoder:class {
  getEncodedBuffer(n){return new Uint8Array(n)}
  decode(){throw Error("must not decode full resolution")}
  getDecodedBuffer(){throw Error("never")}
  getFrameInfo(){return {width:32,height:32}}
  delete(){destroyed++}
 }}));
 await assert.rejects(decodeJp2Raster(bytes,full,wasm,{decompositionLevel:2}),/codec rejected/);
 assert.equal(destroyed,1);
});
test("v1.19 linked STAC SCL uses reduction metadata with bounded downloaded bytes",async()=>{
 const scene={type:"Feature",id:"S2-REDUCE",collection:"sentinel-2-l2a",
  properties:{datetime:"2026-10-10T00:00:00Z"},geometry:null,
  assets:{SCL:{href:"https://provider.example.test/SCL.jp2?token=PRIVATE",
    type:"image/jp2","proj:epsg":4326,"proj:shape":[32,32],
    "proj:transform":[14,.01,0,51,0,-.01]}}
 };
 let lookups=0,downloads=0;
 const stac={item:async()=>{lookups++;return scene;}};
 const report=await analyzeStacJp2Qa(stac,{
  itemId:"S2-REDUCE",area:bbox(14,50.68,14.32,51)
 },{
  allowedHosts:["provider.example.test"],decoder:backend,
  decompositionLevel:2,maxPixels:64,maxSourcePixels:1024,
  fetch:async(_url,opts)=>{
   downloads++;assert.equal(opts.redirect,"error");
   return new Response(bytes.slice(),{headers:{"content-type":"image/jp2"}});
  }
 });
 assert.equal(report.decompositionLevel,2);
 assert.equal(report.effectivePixelScale,4);
 assert.deepEqual([report.decodedWidth,report.decodedHeight],[8,8]);
 assert.equal(report.decodedSamples,64);
 assert.equal(report.quality.clearPixels,64);
 assert.equal(report.quality.aoiPixelCount,64);
 assert.equal(report.quality.pixelEvidence,true);
 assert.equal(report.quality.sensorAcquisitionVerified,false);
 assert.equal(report.independentlyVerifiedSceneAssociation,false);
 assert.deepEqual([lookups,downloads],[1,1]);
 assert.equal(JSON.stringify(report).includes("PRIVATE"),false);
});
test("v1.19 scene-level source footprint limit refuses oversized image before download",async()=>{
 let requested=0;
 const scene={type:"Feature",id:"S2-REDUCE",collection:"sentinel-2-l2a",geometry:null,
 properties:{},assets:{SCL:{href:"https://provider.example.test/SCL.jp2",type:"image/jp2",
 "proj:epsg":4326,"proj:shape":[4500,4500],"proj:transform":[14,.01,0,51,0,-.01]}}};
 await assert.rejects(analyzeStacJp2Qa({item:async()=>scene},{
  itemId:"S2-REDUCE",area:bbox(14,50.68,14.32,51)
 },{allowedHosts:["provider.example.test"],decoder:backend,decompositionLevel:4,
  fetch:async()=>{requested++;throw Error("should not request");}}),/maxSourcePixels/);
 assert.equal(requested,0);
});
