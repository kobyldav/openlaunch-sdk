import assert from "node:assert/strict";
import {decodeJp2Raster,reducedJp2Dimensions} from "@openlaunch/raster";
const image=Uint8Array.from(Buffer.from("AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAACAAAAAgAAQcHAAAAAAAPY29scgEAAAAAABEAAACZanAyY/9P/1EAKQAAAAAAIAAAACAAAAAAAAAAAAAAACAAAAAgAAAAAAAAAAAAAQcBAf9SAAwAAAABAAUEBAAB/1wAE0BASEhQSEhQSEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAGAAB/5PPtAgJ0YCAgICA/9k=","base64"));
const reference={crs:"EPSG:4326",shape:[32,32],transform:[14,.01,0,51,0,-.01]};
const codec={decode:async(_,opts)=>{
 const {width,height}=reducedJp2Dimensions(32,32,opts?.decompositionLevel??0);
 return {width,height,components:1,values:new Uint8Array(width*height).fill(4)};
}};
const raster=await decodeJp2Raster(image,reference,codec,{decompositionLevel:2,maxPixels:64});
assert.equal(raster.width,8);assert.equal(raster.height,8);
assert.deepEqual(raster.transform,[14,.04,0,51,0,-.04]);
console.log("PASS OpenLaunch v1.19 JP2 Reduced Resolution");
console.log("Decoded size:",raster.width+"x"+raster.height);
console.log("Pixel count:",raster.values.length);
console.log("Decoder: deterministic offline stub; run example:jp2-reduced-real for real WASM");
