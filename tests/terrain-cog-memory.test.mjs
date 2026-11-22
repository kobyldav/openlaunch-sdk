/** Stage 23: deterministic policy samples are TEST MEMORY FIXTURES, not
 * claimed physical memory measurements. The TIFF bytes are an independent
 * Pillow/libtiff LZW image, not synthetic Sentinel spectral observations.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {CogRangeCache} from "../dist/eo/cog-range-cache.js";
import {AdaptiveCogRangeMemory} from "../dist/eo/cog-range-memory.js";
import {readCogWindowUrl} from "../dist/eo/cog.js";
import {bbox} from "../dist/geo/types.js";

const M=1048576;
const sample=(rssMiB,freeMiB)=>({
 rssBytes:rssMiB*M,systemFreeBytes:freeMiB*M
});
const url="https://assets.example.test/genuine/unique-SCL-original.tif";
const original=Uint8Array.from(Buffer.from(
 "SUkqABIAAACAAQEAkBgsDQEADAAAAQMAAQAAAAMAAAABAQMAAQAAAAIAAAACAQMAAQAAAAgAAAADAQMAAQAAAAUAAAAGAQMAAQAAAAEAAAARAQQAAQAAAAgAAAAWAQMAAQAAAAIAAAAXAQQAAQAAAAkAAAAcAQMAAQAAAAEAAAAOgwwAAwAAAKgAAACChAwABgAAAMAAAACvhwMACAAAAPAAAAAAAAAAexSuR+F6hD97FK5H4XqEPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAIBJQAAAAAAAAAAAAQABAAAAAQAACAAAAQDmEA==",
 "base64"));
const area=bbox(14,50.98,14.03,51);
const source=(originalEtag='"original-version-1"')=>{
 let hits=0;
 return {
  get hits(){return hits;},
  fetch:async(_url,opts)=>{
   hits++;
   const m=/^bytes=(\d+)-(\d+)$/.exec(opts.headers.Range);
   assert.ok(m,"Only verified original HTTP byte ranges may be fetched");
   const ifRange=opts.headers["If-Range"];
   if(ifRange&&ifRange!==originalEtag)
     return new Response(original,{status:200,headers:{etag:originalEtag}});
   const from=Number(m[1]),to=Math.min(Number(m[2]),original.length-1);
   const bytes=original.slice(from,to+1);
   return new Response(bytes,{status:206,headers:{
     "content-range":`bytes ${from}-${to}/${original.length}`,
     "content-length":String(bytes.length),etag:originalEtag
   }});
  }
 };
};
const read=(cache,remote)=>readCogWindowUrl(url,area,{
 allowedHosts:["assets.example.test"],fetch:remote.fetch,rangeCache:cache
});

test("Stage 23: measured process RSS pressure shrinks source cache immediately; healthy samples recover in bounded stages",()=>{
 const cache=new CogRangeCache(64*M);
 cache.accept(url,0,3,Uint8Array.of(1,2,3),100,'"stable-etag"');
 cache.accept(url,30,10,new Uint8Array(10),100,'"stable-etag"');
 const controller=new AdaptiveCogRangeMemory(cache,{
   mode:"adaptive",processLimitBytes:512*M,recoverySamples:3,recoveryStepBytes:16*M
 });
 assert.equal(controller.observe(sample(200,4096)).activeBudgetMiB,64);
 const forced=controller.observe(sample(460,4096));
 assert.equal(forced.activeBudgetMiB,0);
 assert.equal(forced.decreases,1);
 assert.equal(forced.lastConstraint,"process-rss");
 assert.equal(cache.snapshot().residentBytes,0);
 assert.equal(cache.snapshot().verifiedObjects,1,
   "Changing RAM capacity must not change authenticated original COG identity");
 assert.ok(forced.evictedOnPressureBytes>=13);
 assert.equal(controller.observe(sample(180,4096)).activeBudgetMiB,0);
 assert.equal(controller.observe(sample(180,4096)).activeBudgetMiB,0);
 assert.equal(controller.observe(sample(180,4096)).activeBudgetMiB,16);
 assert.equal(controller.observe(sample(180,4096)).activeBudgetMiB,16);
 assert.equal(controller.observe(sample(180,4096)).activeBudgetMiB,16);
 assert.equal(controller.observe(sample(180,4096)).activeBudgetMiB,32);
 assert.equal(controller.snapshot().minimumBudgetMiB,0);
 assert.equal(controller.snapshot().increases,2);
 assert.equal(cache.configuredMaxResidentBytes,64*M);
});
test("Stage 23: host free memory independently limits cache even with healthy Node RSS",()=>{
 const cache=new CogRangeCache(64*M);
 const c=new AdaptiveCogRangeMemory(cache,{mode:"adaptive",processLimitBytes:512*M});
 let r=c.observe(sample(100,520));
 assert.equal(r.activeBudgetMiB,4);
 assert.equal(r.lastConstraint,"host-free-memory");
 assert.equal(r.pressureSamples,1);
 r=c.observe(sample(100,400));
 assert.equal(r.activeBudgetMiB,0);
 assert.equal(r.lastConstraint,"host-free-memory");
 assert.equal(cache.maxResidentBytes,0);
 assert.equal(cache.snapshot().residentBytes,0);
});
test("Stage 23: fixed baseline cannot silently resize under synthetic memory pressure",()=>{
 const cache=new CogRangeCache(64*M);
 const c=new AdaptiveCogRangeMemory(cache,{mode:"fixed",processLimitBytes:320*M});
 for(let i=0;i<10;i++)c.observe(sample(400,64));
 assert.equal(cache.maxResidentBytes,64*M);
 assert.equal(c.snapshot().mode,"fixed");
 assert.equal(c.snapshot().decreases,0);
 assert.equal(c.snapshot().pressureSamples,0);
 assert.equal(c.snapshot().lastConstraint,"disabled");
});
test("Stage 23: strict hard bounds reject illegal budgets, invalid samples and excessive target",()=>{
 const cache=new CogRangeCache(64*M);
 for(const bytes of [-1,65*M,NaN,1.5])
   assert.throws(()=>cache.resizeBudgetBytes(bytes),/configured COG memory limit/);
 const c=new AdaptiveCogRangeMemory(cache,{mode:"adaptive",processLimitBytes:512*M});
 for(const m of [null,{rssBytes:-1,systemFreeBytes:1024*M},
   {rssBytes:NaN,systemFreeBytes:1024*M},
   {rssBytes:200*M,systemFreeBytes:Infinity}])
   assert.throws(()=>c.observe(m),/measured finite/);
 assert.throws(()=>c.setProcessLimitBytes(100*M),/256..8192/);
 assert.throws(()=>new AdaptiveCogRangeMemory(cache,{
   mode:"adaptive",processLimitBytes:512*M,recoverySamples:1
 }),/Invalid bounded/);
 assert.throws(()=>new AdaptiveCogRangeMemory(cache,{
   mode:"auto",processLimitBytes:512*M
 }),/fixed or adaptive/);
 c.setProcessLimitBytes(320*M);
 assert.equal(c.snapshot().processLimitMiB,320);
});
test("Stage 23: independent authentic TIFF pixel values survive cache shrink, recovery and original ETag rechecks",async()=>{
 const cache=new CogRangeCache(64*M);
 const controller=new AdaptiveCogRangeMemory(cache,{mode:"adaptive",processLimitBytes:512*M});
 const remote=source();
 const first=await read(cache,remote);
 assert.deepEqual([...first.raster.values],[4,8,9,3,11,6]);
 const originalFetches=remote.hits;
 assert.equal(originalFetches,2);
 controller.observe(sample(450,4096));
 assert.equal(cache.maxResidentBytes,0);
 const shrunk=await read(cache,remote);
 assert.deepEqual([...shrunk.raster.values],[...first.raster.values]);
 assert.equal(remote.hits,4,"Source bytes must be re-fetched after pressure-driven eviction");
 for(let i=0;i<12;i++)controller.observe(sample(140,4096));
 assert.equal(cache.maxResidentBytes,64*M);
 const restored=await read(cache,remote);
 const afterRestoredFetches=remote.hits;
 assert.deepEqual([...restored.raster.values],[...first.raster.values]);
 const reused=await read(cache,remote);
 assert.deepEqual([...reused.raster.values],[...first.raster.values]);
 assert.equal(remote.hits,afterRestoredFetches,"Only the exact original ETag can authorize reuse");
 assert.ok(cache.snapshot().rangeCacheHits>0);
 cache.resizeBudgetBytes(0);
 cache.resizeBudgetBytes(64*M);
 const changed=source('"different-original-source-version"');
 await assert.rejects(()=>read(cache,changed),/HTTP 206 Partial Content|ETag|source size/);
 assert.equal(cache.snapshot().verifiedObjects,1);
});


test("Stage 23: even ZERO cached bytes retain a pinned source version within one original TIFF read",async()=>{
 const cache=new CogRangeCache(0);
 const old=source('"old-strong-ETag"'),next=source('"new-strong-ETag"');
 let ranges=0;
 const mixed={
   fetch:(url,opts)=>{
     ranges++;
     return ranges===1?old.fetch(url,opts):next.fetch(url,opts);
   }
 };
 await assert.rejects(()=>read(cache,mixed),/206 Partial Content|ETag|source size changed/);
 assert.equal(ranges,2);
 assert.equal(cache.snapshot().entries,0);
 assert.equal(cache.snapshot().rangeCacheHits,0);
});
test("Stage 23: shrinking a COG cache between original TIFF header and block cannot mix ETag versions",async()=>{
 const cache=new CogRangeCache(64*M);
 const old=source('"original-ETag"'),changed=source('"changed-ETag"');
 let parts=0;
 const mixed={
   fetch:async(url,opts)=>{
     parts++;
     if(parts===1){
       const response=await old.fetch(url,opts);
       cache.resizeBudgetBytes(0);
       return response;
     }
     return changed.fetch(url,opts);
   }
 };
 await assert.rejects(()=>read(cache,mixed),/206 Partial Content|ETag/);
 assert.equal(parts,2);
 assert.equal(cache.maxResidentBytes,0);
 assert.equal(cache.snapshot().residentBytes,0);
});
