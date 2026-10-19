import test from "node:test";
import assert from "node:assert/strict";
import { MeteosatImageCache } from "../dist/providers/meteosat-cache.js";
import { meteosatWmsMapUrl } from "../dist/providers/meteosat.js";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";

const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const options={layer:"demo:clouds",bounds3857:[1,2,3,4],width:128,height:128,time:"2020-01-01T10:00:00Z"};
const response=()=>({image:png.slice(),contentType:"image/png",descriptor:meteosatWmsMapUrl(options)});
const fixture="<WMT_MS_Capabilities><Capability><Layer><Name>demo:clouds</Name><Extent name=\"time\">2020-01-01T10:00:00Z,2020-01-01T10:10:00Z,2020-01-01T10:20:00Z</Extent></Layer></Capability></WMT_MS_Capabilities>";
test("v1.6 repeats explicit-time image without duplicate upstream requests; copies bytes and descriptors",async()=>{
 let requests=0,now=10_000;
 const cache=new MeteosatImageCache({fetchMap:async()=>{requests++;return response();},timeline:async()=>({})},
   {ttlMs:1000,maxEntries:3,maxBytes:1024},()=>now);
 const a=await cache.fetchMap(options);
 assert.equal(a.cacheState,"miss");
 assert.equal(requests,1);
 a.image[0]=0;a.descriptor.coordinateBounds3857[0]=9999;
 const b=await cache.fetchMap({...options,time:"2020-01-01T10:00:00.000Z"});
 assert.equal(b.cacheState,"hit");
 assert.equal(b.image[0],137);
 assert.equal(b.descriptor.coordinateBounds3857[0],1);
 assert.equal(requests,1);
 assert.equal(cache.stats().bytes,png.length);
 now+=1001;
 const c=await cache.fetchMap(options);
 assert.equal(c.cacheState,"miss");
 assert.equal(requests,2);
});
test("v1.6 concurrent identical frames coalesce into a single provider download",async()=>{
 let requests=0,release;
 const wait=new Promise(resolve=>{release=resolve});
 const cache=new MeteosatImageCache({fetchMap:async()=>{requests++;await wait;return response();},timeline:async()=>({})});
 const tasks=[cache.fetchMap(options),cache.fetchMap(options),cache.fetchMap(options)];
 assert.equal(cache.stats().pending,1);
 release();
 const results=await Promise.all(tasks);
 assert.equal(requests,1);
 assert.deepEqual(results.map(x=>x.cacheState),["miss","coalesced","coalesced"]);
 results[0].image[0]=0;
 assert.equal(results[1].image[0],137);
});
test("v1.6 evicts least recently used images within byte and entry limits",async()=>{
 let requests=0;
 const cache=new MeteosatImageCache({fetchMap:async()=>{requests++;return response();},timeline:async()=>({})},
   {maxEntries:2,maxBytes:png.length*2});
 const a=options,b={...options,time:"2020-01-01T10:10:00Z"},c={...options,time:"2020-01-01T10:20:00Z"};
 await cache.fetchMap(a);await cache.fetchMap(b);await cache.fetchMap(a);await cache.fetchMap(c);
 assert.equal(cache.stats().entries,2);
 assert.equal(cache.stats().bytes,2*png.length);
 assert.equal(cache.stats().evictions,1);
 const again=await cache.fetchMap(b);
 assert.equal(again.cacheState,"miss");
 assert.equal(requests,4);
});
test("v1.6 never caches upstream errors, fake images, or default-time WMS requests",async()=>{
 let requests=0;
 const cache=new MeteosatImageCache({fetchMap:async o=>{
    requests++;
    if(o.time && requests<=2)throw new Error("Provider HTTP 503");
    return response();
 },timeline:async()=>({})});
 await assert.rejects(cache.fetchMap(options),/HTTP 503/);
 await assert.rejects(cache.fetchMap(options),/HTTP 503/);
 assert.equal((await cache.fetchMap(options)).cacheState,"miss");
 assert.equal(cache.stats().entries,1);
 const noTime={layer:options.layer,bounds3857:options.bounds3857,width:128,height:128};
 assert.equal((await cache.fetchMap(noTime)).cacheState,"bypass");
 assert.equal((await cache.fetchMap(noTime)).cacheState,"bypass");
 assert.equal(requests,5);
 const bad=new MeteosatImageCache({fetchMap:async()=>({
    image:new TextEncoder().encode("<xml>error</xml>"),contentType:"image/png",
    descriptor:meteosatWmsMapUrl(options)}),timeline:async()=>({})});
 await assert.rejects(bad.fetchMap(options),/invalid image/);
 assert.equal(bad.stats().entries,0);
});
test("v1.6 clear prevents in-flight response from silently refilling memory",async()=>{
 let release;
 const wait=new Promise(resolve=>{release=resolve});
 const cache=new MeteosatImageCache({fetchMap:async()=>{await wait;return response();},timeline:async()=>({})});
 const pending=cache.fetchMap(options);
 cache.clear();
 release();
 const value=await pending;
 assert.equal(value.cacheState,"miss");
 assert.equal(cache.stats().entries,0);
});
test("v1.6 SpaceMapClient shares image cache across playback calls and direct image reads",async()=>{
 let imageRequests=0;
 const sdk=new SpaceMapClient({fetch:async url=>{
  if(new URL(String(url)).searchParams.get("REQUEST")==="GetCapabilities")
    return new Response(fixture,{headers:{"content-type":"text/xml"}});
  imageRequests++;
  return new Response(png.slice(),{headers:{"content-type":"image/png"}});
 }});
 const playback={layer:"demo:clouds",bounds3857:[1,2,3,4],width:128,height:128,maxChecks:3,maxFrames:3};
 const one=await sdk.meteosatPlayback(playback);
 const two=await sdk.meteosatPlayback(playback);
 assert.equal(one.playableFrames,3);
 assert.equal(two.playableFrames,3);
 assert.equal(imageRequests,3);
 assert.equal(sdk.meteosatCacheStats().hits,3);
 const again=await sdk.meteosatImage({...options,time:"2020-01-01T10:20:00Z"});
 assert.equal(again.cacheState,"hit");
 const checked=await sdk.probeImage({source:"meteosat",map:{...options,time:"2020-01-01T10:10:00Z"}});
 assert.equal(checked.status,"available");
 assert.equal(imageRequests,3);
 sdk.clearMeteosatCache();
 assert.equal(sdk.meteosatCacheStats().entries,0);
});
