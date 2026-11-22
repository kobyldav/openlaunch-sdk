/** Stage 22: protocol assertions on independent Pillow/libtiff TIFF bytes.
 * No fixture is a synthetic or claimed actual Sentinel NDVI observation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {CogRangeCache} from "../dist/eo/cog-range-cache.js";
import {readCogWindowUrl} from "../dist/eo/cog.js";
import {bbox} from "../dist/geo/types.js";

const small=Uint8Array.from(Buffer.from(
 "SUkqABIAAACAAQEAkBgsDQEADAAAAQMAAQAAAAMAAAABAQMAAQAAAAIAAAACAQMAAQAAAAgAAAADAQMAAQAAAAUAAAAGAQMAAQAAAAEAAAARAQQAAQAAAAgAAAAWAQMAAQAAAAIAAAAXAQQAAQAAAAkAAAAcAQMAAQAAAAEAAAAOgwwAAwAAAKgAAACChAwABgAAAMAAAACvhwMACAAAAPAAAAAAAAAAexSuR+F6hD97FK5H4XqEPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAIBJQAAAAAAAAAAAAQABAAAAAQAACAAAAQDmEA==",
 "base64"));
const area=bbox(14,50.98,14.03,51);
const url="https://assets.example.test/original/sentinel-scl.tif";
const makeSource=(etag='"original-immutable-tiff-v1"',body=small)=>{
 const calls=[];
 const fetch=async (href,init)=>{
   const range=init?.headers?.Range;
   const ifRange=init?.headers?.["If-Range"]??null;
   calls.push({href,range,ifRange});
   assert.ok(/^bytes=\d+-\d+$/.test(range??""),"Every source request must be a genuine Range request");
   const m=/^bytes=(\d+)-(\d+)$/.exec(range);
   if(ifRange&&ifRange!==etag)
     return new Response(body,{status:200,headers:{"etag":etag}});
   const start=Number(m[1]),end=Math.min(Number(m[2]),body.length-1);
   if(start>=body.length)return new Response(null,{status:416});
   const segment=body.slice(start,end+1);
   const headers={
     "content-range":`bytes ${start}-${end}/${body.length}`,
     "content-length":String(segment.length)
   };
   if(etag)headers.etag=etag;
   return new Response(segment,{status:206,headers});
 };
 return {fetch,calls};
};
const read=(href,cache,source)=>readCogWindowUrl(href,area,{
 allowedHosts:["assets.example.test"],
 fetch:source.fetch,maxBlocks:2,rangeCache:cache
});
const values=r=>Array.from(r.raster.values);

test("Stage 22: exact strong-ETag source ranges give byte-identical LZW/SCL raster and fewer actual HTTPS requests",async()=>{
 const baseline=makeSource();
 const disabled=new CogRangeCache(0);
 const old1=await read(url,disabled,baseline);
 const old2=await read(url,disabled,baseline);
 const baselineRequests=baseline.calls.length;
 assert.equal(baselineRequests,4,"One TIFF header and one compressed block on each COG read");
 const cached=new CogRangeCache(1024*1024);
 const source=makeSource();
 const one=await read(url,cached,source);
 const two=await read(url,cached,source);
 assert.deepEqual(values(one),values(old1));
 assert.deepEqual(values(two),values(old2));
 assert.deepEqual(values(two),[4,8,9,3,11,6]);
 assert.equal(source.calls.length,2);
 assert.equal(cached.snapshot().httpRequests,2);
 assert.equal(cached.snapshot().rangeCacheHits,2);
 assert.ok(cached.snapshot().reusedBytes>0);
 assert.ok(cached.snapshot().entries>0);
 assert.ok(cached.snapshot().verifiedObjects===1);
 assert.ok(cached.snapshot().residentBytes<=1024*1024);
 assert.equal(cached.snapshot().rangeCacheMisses,2);
});

test("Stage 22: distinct STAC COG asset URLs never share source range bytes",async()=>{
 const c=new CogRangeCache(1024*1024);
 const origin=makeSource();
 const a=await read(url,c,origin);
 const b=await read("https://assets.example.test/original/another-date-scl.tif",c,origin);
 assert.deepEqual(values(a),values(b));
 assert.equal(origin.calls.length,4);
 assert.equal(c.snapshot().verifiedObjects,2);
 assert.equal(c.snapshot().rangeCacheHits,0);
});
test("Stage 22: missing/weak ETag never authorizes a cached source range",async()=>{
 for(const etag of [null,'W/"weak-version"']){
   const c=new CogRangeCache(1024*1024),origin=makeSource(etag);
   await read(url,c,origin);await read(url,c,origin);
   assert.equal(c.snapshot().entries,0);
   assert.equal(c.snapshot().rangeCacheHits,0);
   assert.equal(c.snapshot().httpRequests,4);
   assert.ok(origin.calls.every(x=>x.ifRange===null));
 }
});
test("Stage 22: changed ETag between original TIFF metadata and COG source block fails closed",async()=>{
 const c=new CogRangeCache(1024*1024);
 const first=makeSource('"original-v1"');
 const second=makeSource('"changed-v2"');
 let calls=0;
 const changed={fetch:async(href,opts)=>{
   calls++;
   return calls===1?first.fetch(href,opts):second.fetch(href,opts);
 }};
 await assert.rejects(read(url,c,changed),/206 Partial Content|ETag|source size changed/);
 assert.ok(c.snapshot().rangeCacheHits===0);
 assert.ok(second.calls[0].ifRange==='"original-v1"');
});
test("Stage 22: strong ETag inconsistency with HTTP 206 must also fail closed",async()=>{
 const c=new CogRangeCache(1024*1024),source=makeSource('"v1"');
 let calls=0;
 const wrong={fetch:async(href,opts)=>{
   calls++;
   const response=await source.fetch(href,opts);
   if(calls===2){
     const bytes=new Uint8Array(await response.arrayBuffer());
     return new Response(bytes,{status:206,headers:{
       "content-range":response.headers.get("content-range"),
       "content-length":String(bytes.length),"etag":'"changed-v2"'
     }});
   }
   return response;
 }};
 await assert.rejects(read(url,c,wrong),/ETag|source size changed/);
});
test("Stage 22: bounds, eviction and stored-byte defensive copies",()=>{
 assert.throws(()=>new CogRangeCache(-1),/0..128 MiB/);
 assert.throws(()=>new CogRangeCache(129*1048576),/0..128 MiB/);
 const c=new CogRangeCache(4,1),original=Uint8Array.from([1,2,3]);
 c.accept(url,0,3,original,100,'"strong"');
 original[0]=99;
 assert.deepEqual(Array.from(c.get(url,0,3).bytes),[1,2,3]);
 c.accept(url,3,3,Uint8Array.from([4,5,6]),100,'"strong"');
 assert.equal(c.snapshot().entries,1);
 assert.ok(c.snapshot().residentBytes<=4);
 assert.equal(c.snapshot().evictions,1);
 assert.deepEqual(Array.from(c.get(url,0,3).bytes),[1,2,3],
   "Original verified TIFF header must survive large compressed block LRU churn");
 assert.equal(c.get(url,3,3),null,
   "Larger nonmetadata block is evicted first under hard byte limit");
 assert.throws(()=>c.accept(url,6,1,Uint8Array.of(7),101,'"changed"'),/ETag|size changed/);
});
