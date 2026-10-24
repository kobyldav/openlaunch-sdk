import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readJp2Header,decodeJp2Raster,createOpenJpegWasmBackend} from "@openlaunch/raster";
import {SpaceMapClient} from "@openlaunch/earth";
import {bbox} from "@openlaunch/raster";
// Independently encoded 32x32, 8-bit, all pixel value 4; JP2 lossless.
const bytes=Uint8Array.from(Buffer.from("AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAIAAAACAAAQcHAAAAAAAPY29scgEAAAAAABEAAACZanAyY/9P/1EAKQAAAAAAIAAAACAAAAAAAAAAAAAAACAAAAAgAAAAAAAAAAAAAQcBAf9SAAwAAAABAAUEBAAB/1wAE0BASEhQSEhQSEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAGAAB/5PPtAgJ0YCAgICA/9k=","base64"));
const require=createRequire(import.meta.url);
const wasm=require.resolve("@cornerstonejs/codec-openjpeg/decodewasm");
const moduleImport=await import("@cornerstonejs/codec-openjpeg/decodewasmjs");
const init=moduleImport.default??moduleImport;
const codec=await init({locateFile:(p)=>p.endsWith(".wasm")?wasm:p});
const backend=createOpenJpegWasmBackend(async()=>codec);
const reference={crs:"EPSG:4326",shape:[32,32],transform:[14,.01,0,51,0,-.01]};
assert.deepEqual(readJp2Header(bytes),{width:32,height:32,components:1,bitsPerComponent:8});
const grid=await decodeJp2Raster(bytes,reference,backend,{decompositionLevel:2,maxPixels:64});
assert.deepEqual([grid.width,grid.height],[8,8]);
assert.deepEqual(grid.transform,[14,.04,0,51,0,-.04]);
assert.deepEqual([...grid.values],new Array(64).fill(4));
const scene={type:"Feature",id:"S2-REAL-REDUCED",collection:"sentinel-2-l2a",
 properties:{datetime:"2026-10-01T00:00:00Z"},geometry:null,
 assets:{SCL:{href:"https://assets.example.test/SCL.jp2?token=PRIVATE",type:"image/jp2",
 "proj:epsg":4326,"proj:shape":[32,32],"proj:transform":[14,.01,0,51,0,-.01]}}
};
const maps=new SpaceMapClient({
 jp2AllowedHosts:["assets.example.test"],jp2Decoder:backend,
 jp2DecompositionLevel:2,jp2MaxPixels:64,jp2MaxSourcePixels:1024,
 fetch:async(url,opts)=>{
   if(String(url).includes("/collections/"))return new Response(JSON.stringify(scene));
   assert.equal(opts.redirect,"error");
   return new Response(bytes.slice(),{headers:{"content-type":"image/jp2"}});
 }
});
const report=await maps.analyzeObservationJp2Qa({
 itemId:"S2-REAL-REDUCED",area:bbox(14,50.68,14.32,51)
});
assert.equal(report.decompositionLevel,2);
assert.equal(report.quality.clearPixels,64);
assert.equal(report.quality.aoiPixelCount,64);
assert.equal(report.quality.usablePercentOfAoi,100);
assert.equal(report.independentlyVerifiedSceneAssociation,false);
assert.equal(JSON.stringify(report).includes("PRIVATE"),false);
console.log("PASS OpenLaunch v1.19 REAL OpenJPEG reduced-resolution JP2");
console.log("Original image: 32x32, decoded resolution: 8x8");
console.log("Scale factor:",report.effectivePixelScale);
console.log("Decoded AOI clear pixels:",report.quality.clearPixels);
console.log("Full-file HTTPS budget still applies; no JP2 window streaming");
