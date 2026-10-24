import test from "node:test";
import assert from "node:assert/strict";
import {decodeGeoTiff} from "../dist/eo/geotiff.js";
import {decodeTiffLzw} from "../dist/eo/tiff-lzw.js";
import {readCogWindowUrl} from "../dist/eo/cog.js";
import {analyzeRemoteAoiPixelQuality} from "../dist/eo/aoi-quality.js";
import {analyzeLinkedObservationQa} from "../dist/intelligence/linked-qa.js";
import {bbox} from "../dist/geo/types.js";
// Independent libtiff/Pillow-created real TIFF LZW file bytes, NOT OpenLaunch encodings.
const small=Uint8Array.from(Buffer.from("SUkqABIAAACAAQEAkBgsDQEADAAAAQMAAQAAAAMAAAABAQMAAQAAAAIAAAACAQMAAQAAAAgAAAADAQMAAQAAAAUAAAAGAQMAAQAAAAEAAAARAQQAAQAAAAgAAAAWAQMAAQAAAAIAAAAXAQQAAQAAAAkAAAAcAQMAAQAAAAEAAAAOgwwAAwAAAKgAAACChAwABgAAAMAAAACvhwMACAAAAPAAAAAAAAAAexSuR+F6hD97FK5H4XqEPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAIBJQAAAAAAAAAAAAQABAAAAAQAACAAAAQDmEA==","base64"));
const large=Uint8Array.from(Buffer.from("SUkqANgCAACAAAAgIBgQCgYDggEgoFgwGg4HhAIhIJhQKhYLhgMhoNhwOh4PiAQiIRiQSiYTigUioViwWi4XjAYjIZjQajYbjgcjodjwej4fkAgkIhkQikYjkgkkolkwmk4nlAolIplQqlYrlgslotlwul4vmAwmIxmQymYzmg0mo1mw2m43nA4nI5nQ6nY7ng8no9nw+n4/oBAoJBoRCoZDohEopFoxGo5HpBIpJJpRKpZLphMppNpxOp5PqBQqJRqRSqZTqhUqpVqxWq5XrBYrJZrRarZbrhcrpdrxer5fsBgsJhsRisZjshksplsxms5ntBotJptRqtZrthstpttxut5vuBwuJxuRyuZzuh0up1ux2u53vB4vJ5vR6vZ7vh8vp9vx+n8f6BIIgyEIUhiHIgiSKIsjCNI4jyQJEkiTJQlSWJcmCZJomycJ0nifKAoSiKMpClKYpyoKkqirKwrSuK8sCxLIsy0LUti3LguS6LsvC9L4vzAMEwjDMQxTGMcyDJMoyzMM0zjPNA0TSNM1DVNY1zYNk2jbNw3TeN84DhOI4zkOU5jnOg6TqOs7DtO47zwPE8jzPQ9T2Pc+D5Po+z8P0/j/QBASCoOhKFoah6IomiqLoyjaOo+kKRpKk6UpWlqXpimaapunKdp6n6gqGoqjqSpamqeqKpqqq6sq2rqvrCsayrOtK1rat64rmuq7ryva+r+wLBsKw7EsWxrHsiybKsuzLNs6z7QtG0rTtS1bWte2LZtq27ct23rfuC4biuO5Llua57oum6rruy7buu+8LxvK870vW9r3vi+b6vu/L9v6/8AoHQcC0NBFEwXRkHUfCNJQpSsL0xDVNw7T0QVDEdSRNU8U1VFlWxfWEZVnGtbRxXMd15H1fyDYUiWLI9kSVZcm2dKFoynakrWvLNtS5bsv3BMVxzLc00XTNd2Tdd843lOl6zvfE9X3Pt/UAf6AgAAMAAABAwABAAAAIAAAAAEBAwABAAAAIAAAAAIBAwABAAAACAAAAAMBAwABAAAABQAAAAYBAwABAAAAAQAAABEBBAABAAAACAAAABYBAwABAAAAIAAAABcBBAABAAAAzwIAABwBAwABAAAAAQAAAA6DDAADAAAAbgMAAIKEDAAGAAAAhgMAAK+HAwAIAAAAtgMAAAAAAAB7FK5H4XqEP3sUrkfheoQ/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAAAAAAgElAAAAAAAAAAAABAAEAAAABAAAIAAABAOYQ","base64"));
const aoi=bbox(14,50.98,14.03,51);
function strip(b){
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const head=v.getUint32(4,true),count=v.getUint16(head,true);let start=0,size=0;
 for(let i=0;i<count;i++){const p=head+2+i*12,tag=v.getUint16(p,true);
  if(tag===273)start=v.getUint32(p+8,true);
  if(tag===279)size=v.getUint32(p+8,true);
 }
 assert.ok(start>0&&size>0);
 return b.subarray(start,start+size);
}
function ranged(bytes){
 const calls=[];
 return {calls,fetch:async (_url,init={})=>{
  calls.push({range:init.headers?.Range,redirect:init.redirect});
  const match=/^bytes=(\d+)-(\d+)$/.exec(init.headers?.Range??"");
  assert.ok(match);
  const from=Number(match[1]),to=Math.min(Number(match[2]),bytes.length-1);
  if(from>=bytes.length)return new Response(null,{status:416});
  const data=bytes.slice(from,to+1);
  return new Response(data,{status:206,headers:{
    "content-range":`bytes ${from}-${to}/${bytes.length}`,
    "content-length":String(data.length),"content-type":"image/tiff"
  }});
 }};
}
test("v1.16 Pillow/Libtiff genuine LZW SCL GeoTIFF decoded exactly",async()=>{
 const img=await decodeGeoTiff(small);
 assert.equal(img.crs,"EPSG:4326");
 assert.deepEqual([img.width,img.height],[3,2]);
 assert.deepEqual([...img.values],[4,8,9,3,11,6]);
});
test("v1.16 full independent 32x32 TIFF exercises growing LZW dictionary",async()=>{
 const img=await decodeGeoTiff(large);
 assert.deepEqual([img.width,img.height],[32,32]);
 assert.deepEqual([...img.values],Array.from({length:1024},(_,i)=>i%256));
});
test("v1.16 bounded LZW rejects malformed streams and decompression bombs",()=>{
 const compressed=strip(small);
 assert.deepEqual([...decodeTiffLzw(compressed,6)],[4,8,9,3,11,6]);
 assert.throws(()=>decodeTiffLzw(compressed,5),/exceeds expected/);
 assert.throws(()=>decodeTiffLzw(compressed,7),/byte count/);
 assert.throws(()=>decodeTiffLzw(compressed.slice(0,2),6),/Truncated/);
 assert.throws(()=>decodeTiffLzw(new Uint8Array([0,0,0]),6),/initial clear/);
 assert.throws(()=>decodeTiffLzw(new Uint8Array(),6),/Empty/);
 assert.throws(()=>decodeTiffLzw(compressed,67_108_865),/bounded/);
});
test("v1.16 secure HTTP Range COG and actual SCL QA pixel classification",async()=>{
 const req=ranged(small);
 const raster=await readCogWindowUrl("https://assets.example.test/SCL.tif",aoi,
  {allowedHosts:["assets.example.test"],fetch:req.fetch});
 assert.deepEqual([...raster.raster.values],[4,8,9,3,11,6]);
 assert.equal(raster.requestedTiles,1);
 assert.ok(req.calls.length>=2);
 assert.ok(req.calls.every(x=>x.range.startsWith("bytes=")&&x.redirect==="error"));
 const quality=await analyzeRemoteAoiPixelQuality({
  href:"https://assets.example.test/SCL.tif",allowedHosts:["assets.example.test"],
  area:aoi,source:"sentinel-2-l2a-scl",fetch:ranged(small).fetch
 });
 assert.equal(quality.quality.clearPixels,2);
 assert.equal(quality.quality.cloudPixels,2);
 assert.equal(quality.quality.shadowPixels,1);
 assert.equal(quality.quality.snowPixels,1);
 assert.equal(quality.quality.sensorAcquisitionVerified,false);
});
test("v1.16 linked STAC SCL masking hides signed URLs",async()=>{
 const scene={type:"Feature",id:"S2-LZW",collection:"sentinel-2-l2a",
  properties:{datetime:"2026-10-01T12:00:00Z"},geometry:null,
  assets:{SCL:{href:"https://assets.example.test/SCL.tif?sig=SECRET",type:"image/tiff"}}};
 const output=await analyzeLinkedObservationQa({
  copernicus:{item:async()=>scene},planetaryComputer:{item:async()=>{throw Error("unused");}}
 },{provider:"copernicus",collection:"sentinel-2-l2a",itemId:"S2-LZW",area:aoi},
  {allowedHosts:["assets.example.test"],fetch:ranged(small).fetch});
 assert.equal(output.quality.cloudPixels,2);
 assert.equal(output.independentlyVerifiedSceneAssociation,false);
 assert.equal(JSON.stringify(output).includes("SECRET"),false);
});
test("v1.16 no full HTTP download or unsafe image host",async()=>{
 await assert.rejects(readCogWindowUrl("https://blocked.example/SCL.tif",aoi,
  {allowedHosts:["assets.example.test"],fetch:ranged(small).fetch}),/trusted/);
 await assert.rejects(readCogWindowUrl("https://assets.example.test/SCL.tif",aoi,
  {allowedHosts:["assets.example.test"],fetch:async()=>new Response(small)}),/206 Partial Content/);
});
