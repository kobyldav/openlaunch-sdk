import test from "node:test";
import assert from "node:assert/strict";
import {SpaceMapClient} from "../dist/intelligence/map-layers.js";
import {WebMapTileCache} from "../dist/intelligence/web-map-tile-cache.js";

const base={layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:17,y:11};
const jpg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,255,217]);
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
function sdkWithFetch(fetch,cache={}){
 let count=0;
 const sdk=new SpaceMapClient({fetch:async(...args)=>{
  count++;return fetch(...args);
 },webMapTileCache:cache});
 return {sdk,count:()=>count};
}
const jpeg=()=>new Response(jpg.slice(),{headers:{"content-type":"image/jpeg"}});
test("v1.22 one verified NASA tile is cached; bytes are immutable to consumers",async()=>{
 const {sdk,count}=sdkWithFetch(async()=>jpeg());
 const first=await sdk.webMapDailyTileCached(base);
 assert.equal(first.status,"available");assert.equal(first.cacheStatus,"fetched");
 assert.equal(first.imageVerified,true);assert.equal(first.verifiedAcquisition,false);
 assert.equal(first.contentType,"image/jpeg");
 first.image[0]=0;first.image[1]=0;
 const second=await sdk.webMapDailyTileCached({...base,date:new Date("2026-10-17T20:00:00.000Z")});
 assert.equal(second.cacheStatus,"hit");
 assert.deepEqual([...second.image],[...jpg]);
 second.image.fill(0);
 const third=await sdk.webMapDailyTileCached(base);
 assert.deepEqual([...third.image],[...jpg]);
 assert.equal(count(),1);
 assert.equal(sdk.webMapTileCacheStats().entries,1);
 assert.equal(sdk.webMapTileCacheStats().bytes,jpg.length);
 assert.equal(sdk.webMapTileCacheStats().hits,2);
 assert.equal(JSON.stringify(third).includes("gibs.earthdata.nasa.gov"),false);
});
test("v1.22 TTL expires and revalidates on the next request with deterministic time",async()=>{
 let time=1000,seen=0;
 const client={nasaDailyTiles:new SpaceMapClient().nasaDailyTiles.bind(new SpaceMapClient())};
 const cache=new WebMapTileCache(client,{fetch:async()=>{
  seen++;return jpeg();
 }},{ttlMs:100,maxEntries:2,maxTotalBytes:100},()=>time);
 assert.equal((await cache.get(base)).cacheStatus,"fetched");
 time=1099;
 assert.equal((await cache.get(base)).cacheStatus,"hit");
 time=1100;
 assert.equal((await cache.get(base)).cacheStatus,"fetched");
 assert.equal(seen,2);
});
test("v1.22 missing/error/invalid responses are never cached",async()=>{
 let n=0;
 const {sdk}=sdkWithFetch(async()=>{
  n++;
  if(n===1)return new Response(null,{status:404});
  if(n===2)return new Response("<xml>SECRET</xml>",{status:502});
  if(n===3)return new Response("<html>not image</html>",{headers:{"content-type":"image/jpeg"}});
  return jpeg();
 });
 for(const [status,reason] of [["missing","not-found"],["unavailable","upstream-error"],["invalid","invalid-image"]]){
  const result=await sdk.webMapDailyTileCached(base);
  assert.equal(result.status,status);assert.equal(result.reason,reason);
  assert.equal(result.image,null);
  assert.equal(sdk.webMapTileCacheStats().entries,0);
  assert.equal(JSON.stringify(result).includes("SECRET"),false);
 }
 assert.equal((await sdk.webMapDailyTileCached(base)).status,"available");
 assert.equal(n,4);
 assert.equal((await sdk.webMapDailyTileCached(base)).cacheStatus,"hit");
 assert.equal(n,4);
});
test("v1.22 in-flight dedupe: concurrent same tile executes only one upstream request",async()=>{
 let release,started=0;
 const gate=new Promise(resolve=>release=resolve);
 const {sdk}=sdkWithFetch(async()=>{
  started++;await gate;return jpeg();
 });
 const first=sdk.webMapDailyTileCached(base);
 const second=sdk.webMapDailyTileCached({...base});
 const third=sdk.webMapDailyTileCached({...base,date:"2026-10-17"});
 await Promise.resolve();
 assert.equal(started,1);
 assert.equal(sdk.webMapTileCacheStats().inFlight,1);
 release();
 const [a,b,c]=await Promise.all([first,second,third]);
 assert.equal(a.cacheStatus,"fetched");
 assert.equal(b.cacheStatus,"shared");
 assert.equal(c.cacheStatus,"shared");
 assert.equal(sdk.webMapTileCacheStats().joined,2);
 assert.equal(sdk.webMapTileCacheStats().inFlight,0);
 a.image.fill(0);
 assert.deepEqual([...b.image],[...jpg]);
 assert.deepEqual([...c.image],[...jpg]);
});
test("v1.22 batch has bounded unique fetch concurrency, input order and duplicate dedupe",async()=>{
 const tiles=[
  {...base,x:1},{...base,x:2},{...base,x:3},
  {...base,x:2},{...base,x:4},{...base,x:5}
 ];
 let active=0,peak=0,started=0;
 const {sdk}=sdkWithFetch(async(url)=>{
   started++;active++;peak=Math.max(peak,active);
   await new Promise(resolve=>setTimeout(resolve,4+(Number(new URL(url).pathname.split("/").at(-1).split(".")[0])%4)*3));
   active--;
   return jpeg();
 });
 const batch=await sdk.webMapDailyTilesBatch({tiles,concurrency:2});
 assert.equal(batch.requested,6);
 assert.equal(batch.uniqueRequested,5);
 assert.equal(batch.available,6);
 assert.equal(batch.verifiedAcquisition,false);
 assert.equal(batch.missing,0);
 assert.equal(batch.shared,1);
 assert.equal(batch.cacheHits,0);
 assert.ok(peak<=2);
 assert.equal(started,5);
 assert.deepEqual(batch.results.map(x=>x.x),[1,2,3,2,4,5]);
 assert.ok(batch.results.every(x=>x.imageVerified&&x.image?.byteLength===jpg.length));
 const again=await sdk.webMapDailyTilesBatch({tiles,concurrency:4});
 assert.equal(again.cacheHits,6);
 assert.equal(started,5);
});
test("v1.22 batch records missing/error per tile without discarding successful neighbors",async()=>{
 const {sdk}=sdkWithFetch(async url=>{
  const x=Number(new URL(url).pathname.split("/").at(-1).split(".")[0]);
  if(x===1)return jpeg();
  if(x===2)return new Response(null,{status:404});
  if(x===3)return new Response("FAIL", {status:503});
  return new Response(png.slice(),{headers:{"content-type":"image/png"}});
 });
 const batch=await sdk.webMapDailyTilesBatch({tiles:[1,2,3,4].map(x=>({...base,x}))});
 assert.deepEqual([batch.available,batch.missing,batch.unavailable,batch.invalid],[2,1,1,0]);
 assert.deepEqual(batch.results.map(x=>x.status),["available","missing","unavailable","available"]);
 assert.equal(sdk.webMapTileCacheStats().entries,2);
});
test("v1.22 LRU evicts least recently used entry when count or byte limit reached",async()=>{
 const {sdk,count}=sdkWithFetch(async()=>jpeg(),{maxEntries:2,maxTotalBytes:2*jpg.length});
 const tile=x=>({...base,x});
 await sdk.webMapDailyTileCached(tile(1));
 await sdk.webMapDailyTileCached(tile(2));
 await sdk.webMapDailyTileCached(tile(1)); // promote 1
 await sdk.webMapDailyTileCached(tile(3)); // evicts 2
 assert.equal(sdk.webMapTileCacheStats().entries,2);
 assert.equal(sdk.webMapTileCacheStats().bytes,2*jpg.length);
 assert.equal((await sdk.webMapDailyTileCached(tile(1))).cacheStatus,"hit");
 assert.equal((await sdk.webMapDailyTileCached(tile(2))).cacheStatus,"fetched");
 assert.equal(count(),4);
 assert.ok(sdk.webMapTileCacheStats().evictions>=1);
 sdk.clearWebMapTileCache();
 assert.deepEqual([sdk.webMapTileCacheStats().entries,sdk.webMapTileCacheStats().bytes],[0,0]);
});
test("v1.22 0 TTL disables storage; a single image exceeding memory budget is not cached",async()=>{
 const a=sdkWithFetch(async()=>jpeg(),{ttlMs:0});
 await a.sdk.webMapDailyTileCached(base);
 await a.sdk.webMapDailyTileCached(base);
 assert.equal(a.count(),2);assert.equal(a.sdk.webMapTileCacheStats().entries,0);
 const b=sdkWithFetch(async()=>jpeg(),{maxTotalBytes:8});
 await b.sdk.webMapDailyTileCached(base);
 await b.sdk.webMapDailyTileCached(base);
 assert.equal(b.count(),2);assert.equal(b.sdk.webMapTileCacheStats().entries,0);
});
test("v1.22 batch validates ALL coordinates, size and concurrency before ANY network calls",async()=>{
 const {sdk,count}=sdkWithFetch(async()=>jpeg());
 const tile={...base};
 for(const tiles of [[],Array.from({length:17},()=>tile),[tile,{...tile,x:-1}],[
   {...tile,date:"bad"},tile],null]){
  await assert.rejects(sdk.webMapDailyTilesBatch({tiles}),/batch supports|XYZ coordinates|Invalid/);
 }
 for(const concurrency of [0,5,1.1,NaN,Infinity]){
  await assert.rejects(sdk.webMapDailyTilesBatch({tiles:[tile],concurrency}),/concurrency/);
 }
 for(const options of [{ttlMs:-1},{maxEntries:129},{maxTotalBytes:33*1024*1024}]){
  assert.throws(()=>new SpaceMapClient({webMapTileCache:options}),/must be between/);
 }
 assert.equal(count(),0);
});
test("v1.22 cache is instance-local; same tile across two instances is independently verified",async()=>{
 let count=0;
 const fetch=async()=>{count++;return jpeg()};
 const a=new SpaceMapClient({fetch});
 const b=new SpaceMapClient({fetch});
 await a.webMapDailyTileCached(base);await a.webMapDailyTileCached(base);
 await b.webMapDailyTileCached(base);await b.webMapDailyTileCached(base);
 assert.equal(count,2);
 assert.equal(a.webMapTileCacheStats().entries,1);
 assert.equal(b.webMapTileCacheStats().entries,1);
});
test("v1.22 rejected unexpected provider URL cannot become an arbitrary URL cache key",async()=>{
 let count=0;
 const unsafe={nasaDailyTiles:()=>({
  provider:"nasa-gibs",kind:"wmts-xyz",
  urlTemplate:"https://gibs.earthdata.nasa.gov.evil.example/wmts/epsg3857/best/layer/{z}/{y}/{x}.jpg",
  requestedDate:"2026-10-17",maxZoom:9,attribution:"invalid"
 })};
 const cache=new WebMapTileCache(unsafe,{fetch:async()=>{count++;return jpeg()}});
 await assert.rejects(cache.get(base),/Unexpected NASA map descriptor/);
 assert.equal(count,0);
});
