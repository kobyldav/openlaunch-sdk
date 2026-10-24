import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync} from "node:zlib";
import {bbox} from "../dist/geo/types.js";
import {utmZone,lonLatToUtm,utmToLonLat} from "../dist/eo/utm.js";
import {
  lonLatToGridCrs,gridCrsToLonLat,validateRaster,clipRasterToAoi
} from "../dist/eo/raster.js";
import {decodeGeoTiff} from "../dist/eo/geotiff.js";
import {readCogWindowUrl} from "../dist/eo/cog.js";
import {analyzeRemoteAoiPixelQuality} from "../dist/eo/aoi-quality.js";
function fixture({
  width=3,height=2,values=[100,200,300,400,500,600],
  compression=1,predictor=1,epsg=4326,
  tiled=false,bigTiff=false,originX=14,originY=51,pixelSize=.01,
}={}){
  const samples=Buffer.alloc(values.length*2);
  values.forEach((v,i)=>samples.writeUInt16LE(v,i*2));
  const data=Buffer.from(samples);
  if(predictor===2){
    for(let r=0;r<height;r++)for(let c=width-1;c>=1;c--)
      data.writeUInt16LE((values[r*width+c]-values[r*width+c-1]+65536)%65536,2*(r*width+c));
  }
  const compressed=compression===8?deflateSync(data):data;
  const tags=[
    [256,4,1,width],[257,4,1,height],
    [258,3,1,16],[259,3,1,compression],[262,3,1,1],
    [273,4,1,0],[277,3,1,1],[278,4,1,height],
    [279,4,1,compressed.length],[284,3,1,1],
    [317,3,1,predictor],[339,3,1,1],
    [33550,12,3,null],[33922,12,6,null],
    [34735,3,8,null],[42113,2,2,null],
  ].sort((a,b)=>a[0]-b[0]);
  const entrySize=bigTiff?20:12,head=bigTiff?16:8,entryCount=bigTiff?8:2,tail=bigTiff?8:4,slot=bigTiff?8:4;
  let extra=head+entryCount+tags.length*entrySize+tail;
  const chunks=new Map;
  const fill=(tag,buffer)=>{
    extra=(extra+7)&~7;
    chunks.set(tag,{offset:extra,bytes:buffer});
    extra+=buffer.length;
  };
  const scale=Buffer.alloc(24);[pixelSize,pixelSize,0].forEach((v,i)=>scale.writeDoubleLE(v,i*8));
  const tie=Buffer.alloc(48);[0,0,0,originX,originY,0].forEach((v,i)=>tie.writeDoubleLE(v,i*8));
  const keys=Buffer.alloc(16);[1,1,0,1,epsg===4326?2048:3072,0,1,epsg].forEach((v,i)=>keys.writeUInt16LE(v,i*2));
  fill(33550,scale);fill(33922,tie);fill(34735,keys);
  const rasterOffset=(extra+7)&~7;
  const output=Buffer.alloc(rasterOffset+compressed.length);
  output.write("II",0);output.writeUInt16LE(bigTiff?43:42,2);
  if(bigTiff){output.writeUInt16LE(8,4);output.writeUInt16LE(0,6);output.writeBigUInt64LE(BigInt(head),8);output.writeBigUInt64LE(BigInt(tags.length),head);}
  else{output.writeUInt32LE(head,4);output.writeUInt16LE(tags.length,head);}
  for(let i=0;i<tags.length;i++){
    const [tag,type,count,value]=tags[i],entry=head+entryCount+i*entrySize;
    output.writeUInt16LE(tag,entry);output.writeUInt16LE(type,entry+2);
    if(bigTiff)output.writeBigUInt64LE(BigInt(count),entry+4);
    else output.writeUInt32LE(count,entry+4);
    const field=entry+(bigTiff?12:8);
    const bytesPerType=type===12?8:type===3?2:type===4?4:1;
    const inline=bytesPerType*count<=slot;
    let actual=tag===273?rasterOffset:value;
    if(value===null&&tag===42113)actual=0;
    if(chunks.has(tag))actual=chunks.get(tag).offset;
    if(tag===42113){
      if(bigTiff)output.write("0\0",field,"ascii");else output.write("0\0",field,"ascii");
    }else if(inline&&type===3)output.writeUInt16LE(actual,field);
    else if(bigTiff)output.writeBigUInt64LE(BigInt(actual),field);
    else output.writeUInt32LE(actual,field);
  }
  for(const c of chunks.values())c.bytes.copy(output,c.offset);
  compressed.copy(output,rasterOffset);
  return new Uint8Array(output);
}

function mockRangeSource(bytes){
  const calls=[];
  const fetch=async(_url,init={})=>{
    const range=init.headers?.Range;
    calls.push(range??"none");
    if(!range)return new Response("range required",{status:400});
    const m=/^bytes=(\d+)-(\d+)$/.exec(range);
    if(!m)throw new RangeError("Invalid Range header");
    const start=Number(m[1]),end=Math.min(Number(m[2]),bytes.length-1);
    if(start>=bytes.length)return new Response(null,{status:416});
    const data=bytes.slice(start,end+1);
    return new Response(data,{
      status:206,
      headers:{
        "content-range":`bytes ${start}-${end}/${bytes.length}`,
        "content-length":String(data.length),"content-type":"image/tiff",
      },
    });
  };
  return {fetch,calls};
}
const close=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`Expected ${a} ≈ ${b} (±${epsilon})`);
test("v1.15 supports all 60 north and south WGS84 UTM EPSG zones, not arbitrary EPSG",()=>{
 for(let zone=1;zone<=60;zone++) {
  assert.equal(utmZone(`EPSG:${32600+zone}`)?.hemisphere,"north");
  assert.equal(utmZone(`EPSG:${32700+zone}`)?.hemisphere,"south");
 }
 for(const crs of ["EPSG:32600","EPSG:32661","EPSG:32700","EPSG:32761","EPSG:25833","EPSG:4327","EPSG:3858"]){
  assert.equal(utmZone(crs),null);
  assert.throws(()=>validateRaster({width:1,height:1,crs,transform:[0,1,0,0,0,-1],values:new Float64Array(1)}),/supported/);
 }
});
test("v1.15 WGS84 transverse Mercator equator + both hemispheres is invertible",()=>{
 const north=lonLatToUtm(15,0,"EPSG:32633");
 close(north[0],500000,1e-5);close(north[1],0,1e-5);
 const south=lonLatToUtm(21,0,"EPSG:32734");
 close(south[0],500000,1e-5);close(south[1],10000000,1e-5);
 for(const [lon,lat,epsg] of [
  [14.4208,50.088,"EPSG:32633"],[18.4241,-33.9249,"EPSG:32734"],
  [-73.9857,40.7484,"EPSG:32618"],[151.2093,-33.8688,"EPSG:32756"],
  [0.0,51.5,"EPSG:32630"],[35.2,-1.3,"EPSG:32736"]
 ]){
   const [x,y]=lonLatToGridCrs(lon,lat,epsg);
   assert.ok(Number.isFinite(x)&&Number.isFinite(y));
   const [foundLon,foundLat]=gridCrsToLonLat(x,y,epsg);
   close(foundLon,lon,0.000001);close(foundLat,lat,0.000001);
 }
});
test("v1.15 wrong CRS hemispheres and zones fail without fabricated locations",()=>{
 assert.throws(()=>lonLatToUtm(14.4,-30,"EPSG:32633"),/hemisphere/);
 assert.throws(()=>lonLatToUtm(14.4,50,"EPSG:32733"),/hemisphere/);
 assert.throws(()=>lonLatToUtm(-75,50,"EPSG:32633"),/zone vicinity/);
 assert.throws(()=>lonLatToUtm(15,85,"EPSG:32633"),/latitude/);
 assert.throws(()=>utmToLonLat(0,100,"EPSG:32633"),/easting/);
});
test("v1.15 genuine compressed GeoTIFF with projected CRS decodes correctly",async()=>{
 const [east,north]=lonLatToUtm(14.42,50.088,"EPSG:32633");
 const raw=fixture({epsg:32633,originX:east,originY:north,pixelSize:10,
   values:[100,200,300,400,500,600],compression:8,predictor:2});
 const grid=await decodeGeoTiff(raw);
 assert.equal(grid.crs,"EPSG:32633");
 assert.deepEqual([...grid.values],[100,200,300,400,500,600]);
 const [lon,lat]=gridCrsToLonLat(grid.transform[0],grid.transform[3],grid.crs);
 close(lon,14.42,1e-6);close(lat,50.088,1e-6);
 assert.ok(clipRasterToAoi(grid,bbox(14.42001,50.08789,14.42010,50.08799)).values.length>0);
});
test("v1.15 UTM COG HTTP range requests crop only selected raster pixels",async()=>{
 const [east,north]=lonLatToUtm(14.42,50.088,"EPSG:32633");
 const raw=fixture({epsg:32633,originX:east,originY:north,pixelSize:10,
   width:3,height:2,values:[4,8,9,3,11,6]});
 const mock=mockRangeSource(raw);
 const nw=gridCrsToLonLat(east,north,"EPSG:32633"),
       se=gridCrsToLonLat(east+30,north-20,"EPSG:32633");
 const area=bbox(Math.min(nw[0],se[0]),Math.min(nw[1],se[1]),
   Math.max(nw[0],se[0]),Math.max(nw[1],se[1]));
 const result=await readCogWindowUrl("https://assets.example.test/qa.tif",area,{
   allowedHosts:["assets.example.test"],fetch:mock.fetch
 });
 assert.equal(result.raster.crs,"EPSG:32633");
 assert.ok(result.raster.values.length>0);
 assert.ok(result.raster.values.length<=6);
 assert.equal(result.transferStrategy,"http-byte-ranges");
 assert.ok(mock.calls.every(s=>s.startsWith("bytes=")));
});
test("v1.15 remote AOI SCL quality can decode native UTM COG range windows",async()=>{
 const [east,north]=lonLatToUtm(14.42,50.088,"EPSG:32633");
 const raw=fixture({epsg:32633,originX:east,originY:north,pixelSize:10,
   width:3,height:2,values:[4,8,9,3,11,6]});
 const mock=mockRangeSource(raw);
 const origin=gridCrsToLonLat(east,north,"EPSG:32633");
 const edge=gridCrsToLonLat(east+30,north-20,"EPSG:32633");
 const area=bbox(Math.min(origin[0],edge[0])-0.00002,Math.min(origin[1],edge[1])-0.00002,
   Math.max(origin[0],edge[0])+0.00002,Math.max(origin[1],edge[1])+0.00002);
 const result=await analyzeRemoteAoiPixelQuality({href:"https://assets.example.test/scl.tif",
  allowedHosts:["assets.example.test"],area,source:"sentinel-2-l2a-scl",fetch:mock.fetch});
 assert.equal(result.quality.clearPixels,2);
 assert.equal(result.quality.cloudPixels,2);
 assert.equal(result.quality.shadowPixels,1);
 assert.equal(result.quality.snowPixels,1);
 assert.equal(result.quality.aoiPixelCount,6);
 assert.equal(result.quality.pixelEvidence,true);
 assert.equal(result.quality.sensorAcquisitionVerified,false);
});
test("v1.15 southern hemisphere EPSG:327xx GeoTIFF metadata is honored",async()=>{
 const [east,north]=lonLatToUtm(18.4241,-33.9249,"EPSG:32734");
 const grid=await decodeGeoTiff(fixture({epsg:32734,originX:east,originY:north,pixelSize:10,
   values:[12,34,56,78,90,11]}));
 assert.equal(grid.crs,"EPSG:32734");
 const [lon,lat]=gridCrsToLonLat(east,north,grid.crs);
 close(lon,18.4241,1e-6);close(lat,-33.9249,1e-6);
});
