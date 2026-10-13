import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  bbox,polygon,point,decodeGeoTiff,ndviRaster,rasterStatistics,
  alignRasterTo,clipRasterToAoi,rasterDifference,elevationToLocalMesh,
  sampleRaster,pixelToWorld,worldToPixel,lonLatToGridCrs,
  OpenLaunch,
} from "../dist/index.js";

/** Exact-value generated GeoTIFF bytes, never a mock decoder. */
function fixture({
  width=3,height=2,values=[100,200,300,400,500,600],
  compression=1,predictor=1,epsg=4326,
  tiled=false,bigTiff=false,
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
  const scale=Buffer.alloc(24);[.01,.01,0].forEach((v,i)=>scale.writeDoubleLE(v,i*8));
  const tie=Buffer.alloc(48);[0,0,0,14,51,0].forEach((v,i)=>tie.writeDoubleLE(v,i*8));
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

test("Decode genuine classic TIFF uncompressed pixel data and GeoTIFF transform",async()=>{
  const g=await decodeGeoTiff(fixture());
  assert.equal(g.width,3);
  assert.equal(g.height,2);
  assert.equal(g.crs,"EPSG:4326");
  assert.deepEqual([...g.values],[100,200,300,400,500,600]);
  assert.deepEqual(g.transform,[14,.01,0,51,0,-.01]);
  assert.deepEqual(rasterStatistics(g),{count:6,valid:6,min:100,max:600,mean:350,sum:2100});
});

test("Decode zlib-Deflate GeoTIFF and horizontal integer predictor correctly",async()=>{
  const g=await decodeGeoTiff(fixture({compression:8,predictor:2}));
  assert.deepEqual([...g.values],[100,200,300,400,500,600]);
});

test("Decode BigTIFF LONG8 layout, not only classic TIFF",async()=>{
  const g=await decodeGeoTiff(fixture({bigTiff:true}));
  assert.deepEqual([...g.values],[100,200,300,400,500,600]);
});

test("Decode nodata as NaN without pretending 0 is valid reflectance",async()=>{
  const g=await decodeGeoTiff(fixture({values:[100,0,300,0,500,600]}));
  assert.ok(Number.isNaN(g.values[1]));
  assert.ok(Number.isNaN(g.values[3]));
  assert.equal(rasterStatistics(g).valid,4);
});

test("Decode guards reject arbitrary unsupported CRS and unsafe sizes",async()=>{
  const bytes=fixture({epsg:32633});
  await assert.rejects(decodeGeoTiff(bytes),/GeoTIFF CRS.*unsupported/);
  await assert.rejects(decodeGeoTiff(fixture(),{maxPixels:5}),/maxPixels/);
  await assert.rejects(decodeGeoTiff(fixture(),{maxInputBytes:50}),/maxInputBytes/);
});

const mk=(width,height,values,transform=[14,.01,0,51,0,-.01],crs="EPSG:4326")=>({
  width,height,values:new Float64Array(values),transform,crs,
});
test("ROI clips correct pixel rows and columns and preserves affine origin",()=>{
  const raster=mk(4,4,Array.from({length:16},(_,i)=>i+1));
  const clipped=clipRasterToAoi(raster,bbox(14.01,50.97,14.03,50.99));
  assert.deepEqual([clipped.width,clipped.height],[2,2]);
  assert.deepEqual([...clipped.values],[6,7,10,11]);
  assert.deepEqual([clipped.transform[0],clipped.transform[3]],[14.01,50.99]);
});
test("Polygon masking excludes outside pixels without changing ROI bounding-box",()=>{
  const raster=mk(3,3,[1,2,3,4,5,6,7,8,9]);
  const p=polygon([[14,51],[14.03,51],[14,50.97]]);
  const result=clipRasterToAoi(raster,p);
  assert.equal(result.width,3);
  assert.equal(result.height,3);
  assert.ok([...result.values].some(v=>Number.isNaN(v)));
  assert.ok([...result.values].some(v=>Number.isFinite(v)));
});

test("Raster regrid preserves world centroids, masks and rejects mismatched CRS",()=>{
  const a=mk(2,2,[10,20,30,40],[14,.02,0,51,0,-.02]);
  const ref=mk(4,4,Array(16).fill(0));
  const aligned=alignRasterTo(a,ref);
  assert.deepEqual([...aligned.values].slice(0,8),[10,10,20,20,10,10,20,20]);
  assert.throws(()=>alignRasterTo(a,mk(4,4,Array(16).fill(0),ref.transform,"EPSG:3857")) ,/CRS mismatch/);
});

test("NDVI performs calibrated pixel arithmetic, preserves nodata, and detects change",()=>{
  const red=mk(3,1,[.2,.0,NaN]),nir=mk(3,1,[.8,.0,.3]);
  const ndvi=ndviRaster(red,nir);
  assert.ok(Math.abs(ndvi.values[0]-.6)<1e-12);
  assert.ok(Number.isNaN(ndvi.values[1]));
  assert.ok(Number.isNaN(ndvi.values[2]));
  const after=mk(3,1,[.9,2,0]);
  const delta=rasterDifference(red,after);
  assert.equal(delta.comparedPixels,2);
  assert.ok(Math.abs(delta.values?.[0]??delta.grid.values[0]-.7)<1e-12);
  assert.ok(Number.isNaN(delta.grid.values[2]));
  assert.throws(()=>ndviRaster(red,mk(3,1,[.1,.2,.3],[20,.01,0,51,0,-.01])),/Raster grids/);
});

test("Terrain mesh produces local metre-based triangles and omits missing elevations",()=>{
  const m=mk(2,2,[100,120,140,NaN],[1000,30,0,2000,0,-30],"EPSG:3857");
  const mesh=elevationToLocalMesh(m);
  assert.equal(mesh.validVertices,3);
  assert.equal(mesh.positions.length,12);
  assert.deepEqual([...mesh.triangles],[0,1,2]);
  assert.deepEqual([...mesh.positions].slice(0,3),[0,0,100]);
  assert.throws(()=>elevationToLocalMesh(mk(2,2,[0,0,0,0])),/EPSG:3857/);
});

test("WGS84 and Mercator projected coordinates invert within tolerance",()=>{
  const [x,y]=lonLatToGridCrs(14.4208,50.088,"EPSG:3857");
  assert.ok(x>1e6&&y>6e6);
  const g=mk(1,1,[42],[x,10,0,y,0,-10],"EPSG:3857");
  const p=pixelToWorld(g.transform,.5,.5);
  assert.equal(sampleRaster(g,...p),42);
  assert.deepEqual(worldToPixel(g.transform,...p),[.5,.5]);
});

test("High-level OpenLaunch raster decoder consumes actual binary returned by a trusted source",async()=>{
  const tiff=fixture();
  const sdk=new OpenLaunch();
  const scene={
    type:"Feature",id:"test-actual-bytes",collection:"sentinel-2-l2a",
    geometry:null,properties:{datetime:"2026-10-01T10:00:00Z"},
    assets:{B04:{href:"https://assets.example.test/red.tif",type:"image/tiff",roles:["data"],gsd:10}},
  };
  const grid=await sdk.earth.downloadRaster(scene,"B04",{
    allowedHosts:["assets.example.test"],
    fetch:async()=>new Response(tiff,{headers:{"content-type":"image/tiff"}}),
  });
  assert.equal(grid.values[4],500);
  assert.equal(grid.source,"test-actual-bytes:B04");
  await assert.rejects(sdk.earth.downloadRaster(scene,"B08",{fetch:async()=>new Response(tiff)}),/does not exist/);
});
