import test from "node:test";
import assert from "node:assert/strict";
import {bbox} from "../dist/geo/types.js";
import {readJp2Header,decodeJp2Raster,createOpenJpegWasmBackend} from "../dist/eo/jp2.js";
import {SpaceMapClient} from "../dist/intelligence/map-layers.js";
import {analyzeStacJp2Qa} from "../dist/intelligence/jp2-qa.js";
// Real JP2 lossless single-channel encoded independently by Pillow/OpenJPEG 2.5.4.
// Codec is injected in these unit tests; real WASM OpenJPEG must be installed separately.
const jp2=Uint8Array.from(Buffer.from("AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAAgAAAAMAAQcHAAAAAAAPY29scgEAAAAAABEAAACVanAyY/9P/1EAKQAAAAAAAwAAAAIAAAAAAAAAAAAAAAMAAAACAAAAAAAAAAAAAQcBAf9SAAwAAAABAAEEBAAB/1wAB0BASEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAIAAB/5PPtAwIVKfAfCDAOgwD4QQEBAP/2Q==","base64"));
const samples=Uint8Array.from([4,8,9,3,11,6]);
const ref={crs:"EPSG:4326",shape:[2,3],transform:[14,.01,0,51,0,-.01]};
const backend={decode:async()=>({width:3,height:2,components:1,values:samples.slice()})};
const area=bbox(14,50.98,14.03,51);
const asset={href:"https://images.example.test/SCL_20m.jp2?token=SECRET",
 type:"image/jp2","proj:epsg":4326,"proj:shape":[2,3],"proj:transform":[14,.01,0,51,0,-.01]};
const item={type:"Feature",id:"S2-JP2",collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2026-10-12T12:00:00Z"},assets:{SCL_20m:asset}};
function sdk(scene=item,allow=["images.example.test"]){
 let catalog=0,download=0;
 const client=new SpaceMapClient({jp2AllowedHosts:allow,jp2Decoder:backend,
  fetch:async (url,init={})=>{
   if(String(url).includes("/collections/")){catalog++;return new Response(JSON.stringify(scene),{headers:{"content-type":"application/json"}});}
   download++;assert.equal(init.redirect,"error");
   return new Response(jp2.slice(),{headers:{"content-type":"image/jp2"}});
 }});
 return {client,stats:()=>({catalog,download})};
}
test("v1.17 independently encoded JP2 header reports exact grayscale 8-bit dimensions",()=>{
 assert.deepEqual(readJp2Header(jp2),{width:3,height:2,components:1,bitsPerComponent:8});
 assert.throws(()=>readJp2Header(Uint8Array.from([255,79])),/signature/);
 const invalid=jp2.slice();invalid[0]=255;
 assert.throws(()=>readJp2Header(invalid),/signature/);
});
test("v1.17 injected JP2 backend gives georeferenced true decoded SCL pixel samples",async()=>{
 const raster=await decodeJp2Raster(jp2,ref,backend);
 assert.deepEqual([...raster.values],[4,8,9,3,11,6]);
 assert.deepEqual(raster.transform,[14,.01,0,51,0,-.01]);
 assert.equal(raster.source,"decoded-jp2-scl");
});
test("v1.17 rejects oversized/mismatched/corrupt output before any QA claims",async()=>{
 await assert.rejects(decodeJp2Raster(jp2,ref,backend,{maxBytes:100}),/bytes exceed/);
 await assert.rejects(decodeJp2Raster(jp2,ref,backend,{maxPixels:5}),/output dimensions/);
 await assert.rejects(decodeJp2Raster(jp2,{...ref,shape:[3,2]},backend),/shape/);
 await assert.rejects(decodeJp2Raster(jp2,ref,{decode:async()=>({width:4,height:2,components:1,values:samples})}),/dimensions/);
 await assert.rejects(decodeJp2Raster(jp2,ref,{decode:async()=>{throw Error("PRIVATE WASM error")}}),e=>e.message==="JP2 codec rejected the image");
 await assert.rejects(decodeJp2Raster(jp2,ref,undefined),/decoder backend/);
});
test("v1.17 fixed official STAC item chooses SCL JP2 and computes AOI pixel classification",async()=>{
 const {client,stats}=sdk();
 const result=await client.analyzeObservationJp2Qa({itemId:"S2-JP2",area});
 assert.deepEqual(stats(),{catalog:1,download:1});
 assert.equal(result.provider,"copernicus");
 assert.equal(result.qaAssetKey,"SCL_20m");
 assert.equal(result.downloadedBytes,jp2.length);
 assert.equal(result.decodedSamples,6);
 assert.equal(result.quality.clearPixels,2);
 assert.equal(result.quality.cloudPixels,2);
 assert.equal(result.quality.shadowPixels,1);
 assert.equal(result.quality.snowPixels,1);
 assert.equal(result.quality.sensorAcquisitionVerified,false);
 assert.equal(result.independentlyVerifiedSceneAssociation,false);
 assert.equal(JSON.stringify(result).includes("SECRET"),false);
});
test("v1.17 fail closed: no codec/no allowlist, untrusted URL and mismatched STAC ID",async()=>{
 const rejected=new SpaceMapClient({jp2AllowedHosts:[],jp2Decoder:backend,fetch:async()=>{throw Error("unexpected network");}});
 await assert.rejects(rejected.analyzeObservationJp2Qa({itemId:"S2-JP2",area}),/jp2AllowedHosts/);
 const noCodec=new SpaceMapClient({jp2AllowedHosts:["images.example.test"],fetch:async()=>{throw Error("unexpected network");}});
 await assert.rejects(noCodec.analyzeObservationJp2Qa({itemId:"S2-JP2",area}),/codec adapter/);
 for(const href of ["http://images.example.test/SCL.jp2","https://evil.example/SCL.jp2",
   "https://images.example.test:8443/SCL.jp2","javascript:alert(1)","https://images.example.test/SCL.tif"]){
   const {client,stats}=sdk({...item,assets:{SCL_20m:{...asset,href}}});
   await assert.rejects(client.analyzeObservationJp2Qa({itemId:"S2-JP2",area}),/trusted JP2/);
   assert.equal(stats().download,0);
 }
 const mismatch=sdk({...item,id:"WRONG"});
 await assert.rejects(mismatch.client.analyzeObservationJp2Qa({itemId:"S2-JP2",area}),/identity/);
 assert.equal(mismatch.stats().download,0);
});
test("v1.17 refuses guessed scene-level georeference and oversized asset before downloading",async()=>{
 for(const assetOverride of [
   {...asset,"proj:shape":undefined},
   {...asset,"proj:epsg":undefined},
   {...asset,"proj:transform":undefined},
   {...asset,"proj:shape":[5000,5000]},
 ]){
  const {client,stats}=sdk({...item,assets:{SCL_20m:assetOverride}});
  await assert.rejects(client.analyzeObservationJp2Qa({itemId:"S2-JP2",area}),/proj:|memory budget|maxSourcePixels/);
  assert.equal(stats().download,0);
 }
});
test("v1.17 injectable OpenJPEG WASM bridge verifies buffer and copies grayscale decoded samples",async()=>{
 let deleted=0,encoded;
 const openjpeg=createOpenJpegWasmBackend(async()=>({J2KDecoder:class {
  getEncodedBuffer(n){encoded=new Uint8Array(n);return encoded;}
  readHeader(){}
  decode(){assert.deepEqual([...encoded],[...jp2]);}
  getDecodedBuffer(){return samples;}
  getFrameInfo(){return {width:3,height:2};}
  delete(){deleted++;}
 }}));
 const raster=await decodeJp2Raster(jp2,ref,openjpeg);
 assert.deepEqual([...raster.values],[...samples]);
 assert.equal(deleted,1);
});
test("v1.17 provider errors cannot reveal JP2 signing secrets",async()=>{
 const client={item:async()=>item};
 await assert.rejects(analyzeStacJp2Qa(client,{itemId:"S2-JP2",area},{
  allowedHosts:["images.example.test"],decoder:backend,
  fetch:async()=>{throw Error("SECRET-PRIVATE");}
 }),error=>{
  assert.equal(error.message,"JP2 QA download failed or exceeded resource budget");
  return true;
 });
});

test("v1.18 actual OpenJPEG adapter refuses deceptive component count and bit depth",async()=>{
 const mock=(info)=>createOpenJpegWasmBackend(async()=>({J2KDecoder:class {
   getEncodedBuffer(n){return new Uint8Array(n);}
   readHeader(){}
   decode(){}
   getDecodedBuffer(){return Uint8Array.from([4,8,9,3,11,6]);}
   getFrameInfo(){return info;}
   delete(){}
 }}));
 const source={crs:"EPSG:4326",shape:[2,3],transform:[14,.01,0,51,0,-.01]};
 const bad=[{width:3,height:2,componentCount:3,bitsPerSample:8},
   {width:3,height:2,componentCount:1,bitsPerSample:16},
   {width:3,height:2,componentCount:1,bitsPerSample:8,isSigned:true}];
 for(const metadata of bad)
   await assert.rejects(decodeJp2Raster(jp2,source,mock(metadata)),/JP2 codec rejected/);
});
test("v1.18 WASM buffer copy survives decoder release",async()=>{
 let deleted=false;const source={crs:"EPSG:4326",shape:[2,3],transform:[14,.01,0,51,0,-.01]};
 const pixels=Uint8Array.from([4,8,9,3,11,6]);
 const codec=createOpenJpegWasmBackend(async()=>({J2KDecoder:class {
  getEncodedBuffer(n){return new Uint8Array(n);}
  readHeader(){}
  decode(){}
  getDecodedBuffer(){return pixels;}
  getFrameInfo(){return {width:3,height:2,bitsPerSample:8,componentCount:1,isSigned:false};}
  delete(){deleted=true;pixels.fill(255);}
 }}));
 const raster=await decodeJp2Raster(jp2,source,codec);
 assert.equal(deleted,true);
 assert.deepEqual([...raster.values],[4,8,9,3,11,6]);
});
