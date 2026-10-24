import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync} from "node:zlib";
import {bbox} from "../dist/geo/types.js";
import {analyzeAoiPixelQuality,analyzeRemoteAoiPixelQuality} from "../dist/eo/aoi-quality.js";
import {SpaceMapClient} from "../dist/intelligence/map-layers.js";

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
const qa=(w,h,codes,transform=[0,1,0,h,0,-1],crs="EPSG:4326")=>({
  width:w,height:h,values:new Float64Array(codes),transform,crs
});
const scl="sentinel-2-l2a-scl",landsat="landsat-c2-l2-qa-pixel-l89";

test("SCL cloud/clear/shadow/snow/no-data counted only inside AOI",()=>{
 const x=analyzeAoiPixelQuality({
  mask:qa(4,3,[4,8,3,11,6,9,0,7,4,5,6,1]),area:bbox(0,0,3,2),source:scl
 });
 assert.equal(x.aoiPixelCount,6);
 assert.equal(x.clearPixels,4);assert.equal(x.cloudPixels,1);assert.equal(x.noDataPixels,1);
 assert.equal(x.usablePercentOfAoi,66.67);assert.equal(x.cloudPercentOfClassified,20);
 assert.equal(x.pixelEvidence,true);assert.equal(x.sensorAcquisitionVerified,false);
});
test("Aligned science NoData overrides clear pixels; misalignment rejected",()=>{
 const mask=qa(2,2,[4,8,6,5]),area=bbox(0,0,2,2);
 const x=analyzeAoiPixelQuality({mask,data:qa(2,2,[1,1,NaN,1]),area,source:scl});
 assert.equal(x.clearPixels,2);assert.equal(x.noDataPixels,1);assert.equal(x.cloudPixels,1);
 assert.equal(x.cloudPercentOfClassified,33.33);
 assert.throws(()=>analyzeAoiPixelQuality({mask,data:qa(2,2,[1,1,1,1],[0,1,0,2,0,-2]),area,source:scl}),/aligned/);
});
test("Landsat QA_PIXEL bitflags distinguish fill cloud cirrus shadow snow clear and unknown",()=>{
 const x=analyzeAoiPixelQuality({mask:qa(4,2,[64,8,16,32,1,0,4,2]),area:bbox(0,0,4,2),source:landsat});
 assert.deepEqual([x.clearPixels,x.cloudPixels,x.shadowPixels,x.snowPixels,x.unknownPixels,x.noDataPixels],[1,3,1,1,1,1]);
 assert.equal(x.usablePercentOfAoi,12.5);assert.equal(x.classifiedPercentOfAoi,75);
 assert.equal(x.cloudPercentOfClassified,50);
});
test("Polygon hole excludes center; empty and ambiguous masks do not fabricate quality",()=>{
 const area={bbox:[0,0,3,3],geometry:{type:"Polygon",coordinates:[
  [[0,0],[3,0],[3,3],[0,3],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]]
 ]}};
 const x=analyzeAoiPixelQuality({mask:qa(3,3,Array(9).fill(4)),area,source:scl});
 assert.equal(x.aoiPixelCount,8);assert.equal(x.outsideAoiPixelCount,1);
 const y=analyzeAoiPixelQuality({mask:qa(2,2,[0,1,7,2]),area:bbox(0,0,2,2),source:scl});
 assert.equal(y.clearPixels,0);assert.equal(y.unknownPixels,2);assert.equal(y.noDataPixels,2);
 assert.equal(y.cloudPercentOfClassified,null);
 const none=analyzeAoiPixelQuality({mask:qa(2,2,[4,4,4,4]),area:bbox(10,10,11,11),source:scl});
 assert.equal(none.aoiPixelCount,0);assert.equal(none.usablePercentOfAoi,null);
});
test("Invalid QA type, oversized work and Point AOI rejected",()=>{
 const mask=qa(2,2,[4,4,4,4]),area=bbox(0,0,2,2);
 assert.throws(()=>analyzeAoiPixelQuality({mask,area,source:"invalid"}),/Unsupported/);
 assert.throws(()=>analyzeAoiPixelQuality({mask,area,source:scl,maxPixels:3}),/maxPixels/);
 assert.throws(()=>analyzeAoiPixelQuality({mask,area,source:scl,maxPixels:3.5}),/maxPixels/);
 assert.throws(()=>analyzeAoiPixelQuality({mask,area:{geometry:{type:"Point",coordinates:[1,1]},bbox:[1,1,1,1]},source:scl}),/Polygon/);
});
test("Remote REAL ranged TIFF bytes are decoded and classified as SCL over AOI",async()=>{
 const bytes=fixture({width:3,height:2,values:[4,8,9,3,11,6]});
 const req=mockRangeSource(bytes);
 const out=await analyzeRemoteAoiPixelQuality({
  href:"https://assets.example.test/qa.tif",allowedHosts:["assets.example.test"],
  area:bbox(14,50.98,14.03,51),source:scl,fetch:req.fetch
 });
 assert.equal(out.quality.aoiPixelCount,6);
 assert.deepEqual([out.quality.clearPixels,out.quality.cloudPixels,
  out.quality.shadowPixels,out.quality.snowPixels],[2,2,1,1]);
 assert.equal(out.quality.usablePercentOfAoi,33.33);
 assert.equal(out.transferStrategy,"http-byte-ranges");
 assert.ok(out.downloadedBytes>0);
 assert.ok(req.calls.every(x=>x.startsWith("bytes=")));
 const sdk=new SpaceMapClient();
 assert.equal(sdk.analyzeAoiPixelQuality({mask:qa(1,1,[4]),area:bbox(0,0,1,1),source:scl}).clearPixels,1);
});
test("Remote COG access fails closed for untrusted host or missing HTTP ranges",async()=>{
 const request={href:"https://evil.example/qa.tif",allowedHosts:["assets.example.test"],
  area:bbox(14,50.99,14.01,51),source:scl};
 await assert.rejects(analyzeRemoteAoiPixelQuality(request),/trusted/);
 const bytes=fixture({values:[4,8,9,3,11,6]});
 await assert.rejects(analyzeRemoteAoiPixelQuality({...request,href:"https://assets.example.test/qa.tif",
  fetch:async()=>new Response(bytes)}),/206 Partial Content/);
});
