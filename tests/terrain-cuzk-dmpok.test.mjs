import test from "node:test";
import assert from "node:assert/strict";
import {bbox} from "../dist/geo/types.js";
import {OpenLaunch,cuzkDmpOkExportUrl,fetchCuzkDmpOkRaster,
  sampleRealTerrain,profileRealTerrain} from "../dist/index.js";
import {lonLatToGridCrs} from "../dist/eo/raster.js";

const area=bbox(14.416,50.087,14.418,50.089);
const [xmin,ymin]=lonLatToGridCrs(14.416,50.087,"EPSG:3857");
const [xmax,ymax]=lonLatToGridCrs(14.418,50.089,"EPSG:3857");
const grid={width:8,height:6,crs:"EPSG:3857",
  transform:[xmin,(xmax-xmin)/8,0,ymax,0,-(ymax-ymin)/6],
  values:new Float64Array(8*6).fill(NaN),unit:"m Bpv"};
function makeFloatTiff(width,height,value,format=3){
  const tags=[
    [256,4,width],[257,4,height],[258,3,32],[259,3,1],[262,3,1],
    [273,4,0],[277,3,1],[278,4,height],[279,4,width*height*4],[339,3,format]
  ];
  const start=8+2+tags.length*12+4;
  tags.find(t=>t[0]===273)[2]=start;
  const bytes=Buffer.alloc(start+width*height*4);
  bytes.write("II",0,"ascii");
  bytes.writeUInt16LE(42,2);bytes.writeUInt32LE(8,4);
  bytes.writeUInt16LE(tags.length,8);
  for(let i=0;i<tags.length;i++){
    const [tag,type,val]=tags[i],off=10+i*12;
    bytes.writeUInt16LE(tag,off);
    bytes.writeUInt16LE(type,off+2);
    bytes.writeUInt32LE(1,off+4);
    if(type===3)bytes.writeUInt16LE(val,off+8);
    else bytes.writeUInt32LE(val,off+8);
  }
  bytes.writeUInt32LE(0,10+tags.length*12);
  for(let i=0;i<width*height;i++)bytes.writeFloatLE(value(i),start+i*4);
  return bytes;
}
test("ČÚZK ArcGIS URL requests georeferenced raw F32 elevations with bounded dimensions",()=>{
  const url=new URL(cuzkDmpOkExportUrl(grid));
  assert.equal(url.origin,"https://ags.cuzk.gov.cz");
  assert.equal(url.searchParams.get("format"),"tiff");
  assert.equal(url.searchParams.get("pixelType"),"F32");
  assert.equal(url.searchParams.get("bboxSR"),"3857");
  assert.equal(url.searchParams.get("imageSR"),"3857");
  assert.equal(url.searchParams.get("size"),"8,6");
  assert.throws(()=>cuzkDmpOkExportUrl({...grid,width:50000}),/bounded/);
});
test("ČÚZK F32 decoder preserves real height samples without creating values",async()=>{
  let url;
  const source=makeFloatTiff(8,6,i=>i===7?-9999:210+(i%8)*.7);
  const raster=await fetchCuzkDmpOkRaster(area,grid,{
    fetch:async input=>{url=String(input);return new Response(source,{status:200,headers:{"content-type":"image/tiff"}});}
  });
  assert.ok(url.includes("/dmp/ImageServer/exportImage"));
  assert.equal(raster.crs,"EPSG:3857");
  assert.equal(raster.values[0],210);
  assert.ok(Math.abs(raster.values[1]-210.7)<.00002);
  assert.ok(Number.isNaN(raster.values[7]));
  assert.equal(raster.unit,"m Bpv");
});
test("ČÚZK never quietly accepts a colorized image, server errors or no-data elevation",async()=>{
  await assert.rejects(()=>fetchCuzkDmpOkRaster(area,grid,{
    fetch:async()=>new Response(makeFloatTiff(8,6,()=>210,1),{status:200})
  }),/floating-point/);
  await assert.rejects(()=>fetchCuzkDmpOkRaster(area,grid,{
    fetch:async()=>new Response('{"error":{"message":"denied"}}',{status:200})
  }),/error, not an elevation TIFF/);
  await assert.rejects(()=>fetchCuzkDmpOkRaster(area,grid,{
    fetch:async()=>new Response("",{status:503})
  }),/HTTP 503/);
  await assert.rejects(()=>fetchCuzkDmpOkRaster(area,grid,{
    fetch:async()=>new Response(makeFloatTiff(8,6,()=>-9999),{status:200})
  }),/no measured surface/);
  await assert.rejects(()=>fetchCuzkDmpOkRaster(bbox(10,10,10.01,10.01),grid),/within the Czech Republic/);
});
const sourceGrid={width:40,height:40,crs:"EPSG:4326",
  transform:[14.41,.0003,0,50.096,0,-.0003]};
function band(n){
  return {...sourceGrid,values:new Float64Array(1600).map((_,i)=>n+i%40+Math.floor(i/40)),unit:"source"};
}
const scene={provider:"Element84 Earth Search / Copernicus Sentinel-2 L2A",
  sceneId:"TEST_REAL_S2",acquiredAt:"2025-08-12T10:06:56Z",
  sceneCloudPercent:2,nativeResolutionM:10,
  bands:{red:band(1000),green:band(1100),blue:band(1200)},warnings:[]};
test("SDK integrates DMP OK measured surface with real-image semantics and distinct Bpv height datum",async()=>{
  const map=await new OpenLaunch().terrain.load({
    area,elevationProvider:"cuzk-dmpok",resolutionM:2,
    rgbLoader:async()=>scene,
    cuzkReader:async (_,target)=>({
      ...target,unit:"m Bpv",values:new Float64Array(target.width*target.height)
        .map((_,i)=>Math.floor((i%target.width)/6)%2?240:220)
    })
  });
  assert.equal(map.kind,"satellite-rgb-on-cuzk-dmpok");
  assert.equal(map.metadata.elevationProvider,"cuzk-dmpok");
  assert.equal(map.metadata.verticalDatum,"Bpv (Baltic 1957)");
  assert.equal(map.metadata.demNativeResolutionM,.5);
  assert.match(map.metadata.demAttribution,/ČÚZK.*CC BY 4\.0/);
  assert.match(map.metadata.demLicenseUrl,/creativecommons\.org\/licenses\/by\/4\.0/);
  assert.equal(map.metadata.demTileUrls.length,0);
  assert.ok(map.elevation.width>50);
  assert.equal(map.mesh.validVertices,map.elevation.values.length);
  assert.ok(map.metadata.heightMaxM-map.metadata.heightMinM>=20);
  const center=sampleRealTerrain(map,14.417,50.088);
  assert.equal(center.verticalDatum,"Bpv (Baltic 1957)");
  const profile=profileRealTerrain(map,[14.4163,50.088],[14.4177,50.088],{samples:36});
  assert.equal(profile.verticalDatum,"Bpv (Baltic 1957)");
  assert.equal(profile.samples.length,36);
});
test("ČÚZK provider never falls back to global DEM if the Czech service fails",async()=>{
  await assert.rejects(()=>new OpenLaunch().terrain.load({
    area,elevationProvider:"cuzk-dmpok",resolutionM:3,
    rgbLoader:async()=>scene,
    cuzkReader:async()=>{throw new Error("ČÚZK provider offline");}
  }),/ČÚZK provider offline/);
});
