import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync} from "node:zlib";
import {bbox} from "../dist/geo/types.js";
import {cuzkOrthoExportUrl,decodeCuzkOrthoPng,fetchCuzkOrthophoto,
  CUZK_ORTHO_NATIVE_RESOLUTION_M,OpenLaunch} from "../dist/index.js";
import {lonLatToGridCrs} from "../dist/eo/raster.js";

const area=bbox(14.416,50.087,14.418,50.089);
const [xmin,ymin]=lonLatToGridCrs(14.416,50.087,"EPSG:3857");
const [xmax,ymax]=lonLatToGridCrs(14.418,50.089,"EPSG:3857");
const grid={width:8,height:6,crs:"EPSG:3857",
  transform:[xmin,(xmax-xmin)/8,0,ymax,0,-(ymax-ymin)/6],
  values:new Float64Array(48),unit:"m"};
const crcTable=Uint32Array.from({length:256},(_,i)=>{
  let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
function crc(bytes){
  let c=0xffffffff;for(const x of bytes)c=crcTable[(c^x)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function chunk(type,data){
  const buf=Buffer.alloc(12+data.length);
  buf.writeUInt32BE(data.length,0);buf.write(type,4,"ascii");
  data.copy(buf,8);buf.writeUInt32BE(crc(buf.subarray(4,8+data.length)),8+data.length);
  return buf;
}
function png(width,height,colourType=6,filter=0,alpha=255){
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
  ihdr[8]=8;ihdr[9]=colourType;
  const channels=colourType===6?4:3;
  const raw=Buffer.alloc(height*(1+width*channels));
  for(let y=0;y<height;y++){
    const row=y*(1+width*channels);
    raw[row]=filter;
    for(let x=0;x<width;x++){
      const k=row+1+x*channels;
      if(filter===0){
        raw[k]=10+x*12;raw[k+1]=20+y*4;raw[k+2]=40+x+y;
        if(channels===4)raw[k+3]=alpha;
      }
    }
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR",ihdr),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);
}
test("Ortofoto export uses public EPSG 3857 real-image PNG service",()=>{
  const url=new URL(cuzkOrthoExportUrl(grid));
  assert.equal(url.origin,"https://ags.cuzk.gov.cz");
  assert.equal(url.pathname,"/arcgis1/rest/services/ORTOFOTO_WM/MapServer/export");
  assert.equal(url.searchParams.get("f"),"image");
  assert.equal(url.searchParams.get("format"),"png32");
  assert.equal(url.searchParams.get("imageSR"),"3857");
  assert.equal(url.searchParams.get("bboxSR"),"3857");
  assert.equal(url.searchParams.get("size"),"8,6");
  assert.equal(CUZK_ORTHO_NATIVE_RESOLUTION_M,.125);
  assert.throws(()=>cuzkOrthoExportUrl({...grid,width:1500}),/1024/);
});
test("PNG parser decodes actual 8bit RGBA sample bytes and alpha",async()=>{
  const b=png(8,6,6,0,255);
  const result=await decodeCuzkOrthoPng(b);
  assert.equal(result.width,8);assert.equal(result.height,6);
  assert.equal(result.validPixels,48);
  assert.deepEqual(Array.from(result.rgba.subarray(0,4)),[10,20,40,255]);
  assert.deepEqual(Array.from(result.rgba.subarray(4,8)),[22,20,41,255]);
});
test("PNG decoder and orthophoto service fail closed on malformed or empty image",async()=>{
  const corrupt=png(8,6);
  corrupt[corrupt.length-14]^=1; // invalid IDAT/IEND checksum or payload
  await assert.rejects(()=>decodeCuzkOrthoPng(corrupt),/CRC|trailing|Incomplete|bounds/);
  await assert.rejects(()=>fetchCuzkOrthophoto(area,grid,{
    fetch:async()=>new Response("<html>bad</html>",{status:200})
  }),/not a bounded PNG/);
  await assert.rejects(()=>fetchCuzkOrthophoto(area,grid,{
    fetch:async()=>new Response(png(8,6,6,0,0),{status:200})
  }),/insufficient actual image coverage/);
  await assert.rejects(()=>fetchCuzkOrthophoto(area,grid,{
    fetch:async()=>new Response("",{status:502})
  }),/HTTP 502/);
  await assert.rejects(()=>fetchCuzkOrthophoto(bbox(2,2,2.01,2.01),grid),/Czech geographic/);
});
test("ČÚZK orthophoto fetcher validates aligned pixels, attribution and license",async()=>{
  const result=await fetchCuzkOrthophoto(area,grid,{
    fetch:async request=>{
      assert.match(String(request),/format=png32/);
      return new Response(png(8,6),{status:200,headers:{"content-type":"image/png"}});
    }
  });
  assert.equal(result.validPixels,48);
  assert.match(result.source,/ORTOFOTO_WM/);
  assert.match(result.attribution,/ČÚZK.*CC BY 4/);
  assert.ok(result.groundResolutionM>0);
  assert.equal(result.sourceNativeResolutionM,.125);
});
test("real surface API selects ČÚZK ortho without invoking Sentinel, and preserves observed RGBA",async()=>{
  let orthoCalls=0;
  const result=await new OpenLaunch().terrain.load({
    area,resolutionM:2,elevationProvider:"cuzk-dmpok",
    imageryProvider:"cuzk-ortofoto",orthophotoResolutionM:.5,
    rgbLoader:async()=>{throw Error("Sentinel must not download in ČÚZK orthophoto mode");},
    cuzkReader:async (_,target)=>({...target,
      values:new Float64Array(target.width*target.height).map((_,i)=>180+(i%100)*.1)}),
    orthoReader:async (_,target)=>{
      orthoCalls++;
      const rgba=new Uint8Array(target.width*target.height*4);
      for(let i=0;i<target.width*target.height;i++){
        rgba[i*4]=40;rgba[i*4+1]=100;rgba[i*4+2]=200;rgba[i*4+3]=255;
      }
      return {width:target.width,height:target.height,rgba,
        validPixels:target.width*target.height,groundResolutionM:.5,
        sourceNativeResolutionM:.125,source:"https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer",
        attribution:"© ČÚZK — Ortofoto ČR, CC BY 4.0",licenceUrl:"https://creativecommons.org/licenses/by/4.0/"};
    }
  });
  assert.equal(orthoCalls,1);
  assert.equal(result.kind,"orthophoto-on-cuzk-dmpok");
  assert.equal(result.metadata.imageryProvider,"cuzk-ortofoto");
  assert.equal(result.metadata.verticalDatum,"Bpv (Baltic 1957)");
  assert.equal(result.metadata.imageryNativeResolutionM,.125);
  assert.equal(result.metadata.sceneCloudPercent,null);
  assert.equal(result.metadata.acquiredAt,"unknown");
  assert.equal(result.vertexRgb[0],40);
  assert.equal(result.vertexRgb[1],100);
  assert.equal(result.vertexRgb[2],200);
  assert.ok(result.imageryTexture.width>result.elevation.width);
  assert.equal(result.metadata.textureValidPixels,result.imageryTexture.validPixels);
  assert.match(result.metadata.imageryAttribution,/ČÚZK.*CC BY/);
});
test("ČÚZK orthophoto cannot silently substitute Sentinel or global DEM",async()=>{
  await assert.rejects(()=>new OpenLaunch().terrain.load({
    area,imageryProvider:"cuzk-ortofoto",elevationProvider:"copernicus-glo30"
  }),/requires the Czech DMP OK/);
  await assert.rejects(()=>new OpenLaunch().terrain.load({
    area,imageryProvider:"cuzk-ortofoto",elevationProvider:"cuzk-dmpok",
    cuzkReader:async (_,grid)=>({...grid,values:new Float64Array(grid.width*grid.height).fill(210)}),
    orthoReader:async()=>{throw Error("Ortho offline");}
  }),/Ortho offline/);
});
