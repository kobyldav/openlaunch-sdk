import assert from "node:assert/strict";
import {decodeGeoTiff,readCogWindowUrl,bbox} from "@openlaunch/raster";
const bytes=Uint8Array.from(Buffer.from("SUkqABIAAACAAQEAkBgsDQEADAAAAQMAAQAAAAMAAAABAQMAAQAAAAIAAAACAQMAAQAAAAgAAAADAQMAAQAAAAUAAAAGAQMAAQAAAAEAAAARAQQAAQAAAAgAAAAWAQMAAQAAAAIAAAAXAQQAAQAAAAkAAAAcAQMAAQAAAAEAAAAOgwwAAwAAAKgAAACChAwABgAAAMAAAACvhwMACAAAAPAAAAAAAAAAexSuR+F6hD97FK5H4XqEPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAIBJQAAAAAAAAAAAAQABAAAAAQAACAAAAQDmEA==","base64"));
const raster=await decodeGeoTiff(bytes);
assert.deepEqual([...raster.values],[4,8,9,3,11,6]);
let requests=0;
const fetch=async(_url,init={})=>{
 const m=/^bytes=(\d+)-(\d+)$/.exec(init.headers?.Range??"");
 assert.ok(m);requests++;
 const start=Number(m[1]),end=Math.min(Number(m[2]),bytes.length-1);
 const chunk=bytes.slice(start,end+1);
 return new Response(chunk,{status:206,headers:{
  "content-range":`bytes ${start}-${end}/${bytes.length}`,
  "content-length":String(chunk.length),"content-type":"image/tiff"
 }});
};
const out=await readCogWindowUrl("https://assets.example.test/SCL.tif",
 bbox(14,50.98,14.03,51),{allowedHosts:["assets.example.test"],fetch});
assert.deepEqual([...out.raster.values],[4,8,9,3,11,6]);
console.log("PASS OpenLaunch v1.16 TIFF LZW GeoTIFF and COG");
console.log("Decoded SCL pixels:",raster.values.length);
console.log("HTTP Range requests:",requests);
console.log("JP2/JPEG2000: not supported yet");
