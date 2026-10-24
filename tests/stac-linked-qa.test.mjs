import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { bbox } from "../dist/geo/types.js";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";
import { analyzeLinkedObservationQa } from "../dist/intelligence/linked-qa.js";
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
const area=bbox(14,50.98,14.03,51);
const s2request={provider:"copernicus",collection:"sentinel-2-l2a",itemId:"S2-FIXTURE",area};
const l8request={provider:"planetary-computer",collection:"landsat-c2-l2",itemId:"L8-FIXTURE",area};
const s2=(asset={href:"https://assets.example.test/SCL.tif",type:"image/tiff",roles:["data"]})=>({
 type:"Feature",id:"S2-FIXTURE",collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2026-10-10T10:00:00Z"},
 assets:{SCL:asset,visual:{href:"https://assets.example.test/rgb.png",roles:["visual"],type:"image/png"}}
});
const l8=(asset={href:"https://assets.example.test/QA_PIXEL.tif",type:"image/tiff",roles:["data"]})=>({
 type:"Feature",id:"L8-FIXTURE",collection:"landsat-c2-l2",geometry:null,
 properties:{datetime:"2026-10-09T08:00:00Z"},
 assets:{QA_PIXEL:asset}
});
function sdkWith({item,mask=[4,8,9,3,11,6],hosts=["assets.example.test"]}={}){
 const raw=fixture({width:3,height:2,values:mask});
 const remote=mockRangeSource(raw);
 let catalog=0,image=0,sign=0;
 const sdk=new SpaceMapClient({
  qaAllowedHosts:hosts,
  fetch:async(url,init={})=>{
   if(String(url).includes("/collections/")){
     catalog++;
     return new Response(JSON.stringify(item??s2()),{headers:{"content-type":"application/json"}});
   }
   if(String(url).includes("/api/sas/v1/sign")) {
     sign++;
     return new Response(JSON.stringify({href:"https://assets.example.test/QA_PIXEL.tif?sig=SECRET"}));
   }
   image++;
   return remote.fetch(url,init);
  },
 });
 return {sdk,calls:()=>({catalog,image,sign}),remote};
}
test("v1.14 scene -> exact STAC SCL -> real TIFF ranges -> AOI pixel classification",async()=>{
 const {sdk,calls,remote}=sdkWith();
 const result=await sdk.analyzeObservationQa(s2request);
 assert.equal(result.linkedFromStacItem,true);
 assert.equal(result.qaAssetKey,"SCL");
 assert.equal(result.maskType,"sentinel-2-l2a-scl");
 assert.equal(result.catalogAcquiredAt,"2026-10-10T10:00:00.000Z");
 assert.equal(result.quality.aoiPixelCount,6);
 assert.deepEqual([result.quality.clearPixels,result.quality.cloudPixels,
  result.quality.shadowPixels,result.quality.snowPixels],[2,2,1,1]);
 assert.equal(result.quality.usablePercentOfAoi,33.33);
 assert.equal(result.verifiedPixelMask,true);
 assert.equal(result.independentlyVerifiedSceneAssociation,false);
 assert.equal(result.quality.sensorAcquisitionVerified,false);
 assert.deepEqual(calls(),{catalog:1,image:2,sign:0});
 assert.ok(remote.calls.every(x=>x.startsWith("bytes=")));
 assert.equal(JSON.stringify(result).includes("assets.example.test"),false);
});
test("v1.14 Landsat QA_PIXEL is bit decoded only from matching STAC item's exact QA key",async()=>{
 const {sdk}=sdkWith({item:l8(),mask:[64,8,16,32,1,0]});
 const result=await sdk.analyzeObservationQa(l8request);
 assert.equal(result.maskType,"landsat-c2-l2-qa-pixel-l89");
 assert.equal(result.qaAssetKey,"QA_PIXEL");
 assert.deepEqual([result.quality.clearPixels,result.quality.cloudPixels,
  result.quality.shadowPixels,result.quality.snowPixels,
  result.quality.unknownPixels,result.quality.noDataPixels],[1,1,1,1,0,2]);
});
test("v1.14 unsupported pair or empty trust list fails before STAC request",async()=>{
 const {sdk,calls}=sdkWith();
 await assert.rejects(sdk.analyzeObservationQa({...s2request,provider:"planetary-computer"}),/supported STAC QA/);
 await assert.rejects(sdk.analyzeObservationQa({...s2request,itemId:""}),/item ID/);
 assert.equal(calls().catalog,0);
 const closed=sdkWith({hosts:[]});
 await assert.rejects(closed.sdk.analyzeObservationQa(s2request),/qaAllowedHosts/);
 assert.equal(closed.calls().catalog,0);
});
test("v1.14 mismatch STAC item, no QA and ambiguous QA asset never download remotely",async()=>{
 for(const item of [
   {...s2(),id:"OTHER"},
   {...s2(),collection:"sentinel-1-grd"},
   {...s2(),assets:{visual:{href:"https://assets.example.test/preview.png",type:"image/png"}}},
   {...s2(),assets:{SCL:s2().assets.SCL,scl_20m:s2().assets.SCL}},
 ]){
   const {sdk,calls}=sdkWith({item});
   await assert.rejects(sdk.analyzeObservationQa(s2request),/identity|no supported QA|Ambiguous/);
   assert.equal(calls().image,0);
 }
});
test("v1.14 untrusted/HTTP/JP2 QA href is not treated as cloud-free data",async()=>{
 for(const href of ["https://other.example/QA.tif","http://assets.example.test/QA.tif",
  "https://assets.example.test:8443/QA.tif","https://assets.example.test/SCL.jp2",
  "https://127.0.0.1/QA.tif"]){
   const {sdk,calls}=sdkWith({item:s2({href,type:"image/tiff"})});
   await assert.rejects(sdk.analyzeObservationQa(s2request),/hostname|TIFF/);
   assert.equal(calls().image,0);
 }
});
test("v1.14 no arbitrary signing and no provider signed URLs returned",async()=>{
 const src=l8({href:"https://assets.example.test/QA_PIXEL.tif",type:"image/tiff"});
 const raw=fixture({width:3,height:2,values:[64,8,16,32,1,0]});
 const remote=mockRangeSource(raw);
 let signing=0;
 const clients={
  copernicus:{item:async()=>{throw Error("unused");}},
  planetaryComputer:{item:async()=>src},
  signer:{signAsset:async a=>{signing++;return {...a,href:a.href+"?sig=PRIVATE-SAS"};}}
 };
 const out=await analyzeLinkedObservationQa(clients,l8request,{allowedHosts:["assets.example.test"],signPlanetary:true,
  fetch:async(url,options)=>{
   assert.match(String(url),/PRIVATE-SAS/);
   return remote.fetch(url,options);
  }});
 assert.equal(signing,1);
 assert.equal(out.qaAssetKey,"QA_PIXEL");
 assert.equal(JSON.stringify(out).includes("PRIVATE-SAS"),false);
});
test("v1.14 COG decoder/network errors sanitized; no secret URL reaches caller",async()=>{
 const asset={href:"https://assets.example.test/SCL.tif?token=PRIVATE",type:"image/tiff"};
 const item=s2(asset);
 const {sdk}=sdkWith({item,hosts:["assets.example.test"]});
 const clients={
  copernicus:{item:async()=>item},
  planetaryComputer:{item:async()=>{throw Error("unused")}}
 };
 await assert.rejects(analyzeLinkedObservationQa(clients,s2request,{allowedHosts:["assets.example.test"],
  fetch:async()=>{throw new Error("PRIVATE download failed");}}),e=>{
   assert.equal(e.message,"Linked QA GeoTIFF unavailable or cannot be decoded safely");
   assert.ok(!e.message.includes("PRIVATE"));
   return true;
  });
});
