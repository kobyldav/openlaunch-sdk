import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {SpaceMapClient} from "@openlaunch/earth";
import {bbox,readJp2Header,createOpenJpegWasmBackend,decodeJp2Raster} from "@openlaunch/raster";

/**
 * Real OpenJPEG WASM smoke: no fake decoder. Install the pinned optional
 * @cornerstonejs/codec-openjpeg@1.3.6 before running. No remote imagery,
 * network fetch or local model credentials are needed.
 */
const jpg=Uint8Array.from(Buffer.from(
 "AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAAgAAAAMAAQcHAAAAAAAPY29scgEAAAAAABEAAACVanAyY/9P/1EAKQAAAAAAAwAAAAIAAAAAAAAAAAAAAAMAAAACAAAAAAAAAAAAAQcBAf9SAAwAAAABAAEEBAAB/1wAB0BASEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAIAAB/5PPtAwIVKfAfCDAOgwD4QQEBAP/2Q==",
 "base64"
));
const expected=[4,8,9,3,11,6];
const require=createRequire(import.meta.url);
const wasmPath=require.resolve("@cornerstonejs/codec-openjpeg/decodewasm");
const imported=await import("@cornerstonejs/codec-openjpeg/decodewasmjs");
const make=imported.default??imported;
assert.equal(typeof make,"function","Expected an OpenJPEG WASM module factory");
const module=await make({locateFile:(file)=>file.endsWith(".wasm")?wasmPath:file});
assert.equal(typeof module.J2KDecoder,"function");
const backend=createOpenJpegWasmBackend(async()=>module);
assert.deepEqual(readJp2Header(jpg),{width:3,height:2,components:1,bitsPerComponent:8});
const reference={crs:"EPSG:4326",shape:[2,3],transform:[14,0.01,0,51,0,-0.01]};
const raster=await decodeJp2Raster(jpg,reference,backend);
assert.deepEqual([...raster.values],expected,"OpenJPEG's ACTUAL decoded pixel values do not match the independent Pillow/OpenJPEG fixture");

const scene={type:"Feature",id:"OPENJPEG-REAL-SCL",collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2026-10-12T12:00:00Z"},
 assets:{SCL:{href:"https://assets.example.test/SCL.jp2?secret=NEVER-RETURN",
 type:"image/jp2","proj:epsg":4326,"proj:shape":[2,3],
 "proj:transform":[14,.01,0,51,0,-.01]}}
};
let catalog=0,images=0;
const maps=new SpaceMapClient({
 jp2Decoder:backend,
 jp2AllowedHosts:["assets.example.test"],
 fetch:async(url,init={})=>{
   if(String(url).includes("/collections/")) {
     catalog++;
     return new Response(JSON.stringify(scene),{headers:{"content-type":"application/json"}});
   }
   images++;
   assert.equal(init.redirect,"error");
   return new Response(jpg.slice(),{headers:{"content-type":"image/jp2"}});
 }
});
const analyzed=await maps.analyzeObservationJp2Qa({
 itemId:"OPENJPEG-REAL-SCL",area:bbox(14,50.98,14.03,51)
});
assert.deepEqual([analyzed.quality.clearPixels,analyzed.quality.cloudPixels,
  analyzed.quality.shadowPixels,analyzed.quality.snowPixels],[2,2,1,1]);
assert.equal(analyzed.quality.usablePercentOfAoi,33.33);
assert.equal(analyzed.quality.sensorAcquisitionVerified,false);
assert.equal(analyzed.independentlyVerifiedSceneAssociation,false);
assert.equal(JSON.stringify(analyzed).includes("NEVER-RETURN"),false);
assert.deepEqual([catalog,images],[1,1]);
console.log("PASS OpenLaunch v1.18 REAL OpenJPEG WASM decode");
console.log("JP2 dimensions: 3x2, unsigned 8-bit grayscale");
console.log("Actual decoded samples:",[...raster.values].join(","));
console.log("STAC lookups:",catalog,"image downloads:",images);
console.log("AOI clear/cloud pixels:",analyzed.quality.clearPixels+"/"+analyzed.quality.cloudPixels);
console.log("Large native Sentinel-2 JP2 window decoding: not yet supported");
