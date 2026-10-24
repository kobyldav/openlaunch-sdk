import { webcrypto } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";
import { MeteosatCloudflareKvStore } from "../dist/providers/meteosat-kv.js";
import { MeteosatImageCache } from "../dist/providers/meteosat-cache.js";
import { meteosatWmsMapUrl } from "../dist/providers/meteosat.js";

const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const opts={layer:"demo:clouds",bounds3857:[1,2,3,4],width:128,height:128,time:"2020-01-01T10:00:00Z"};
const xml="<WMT_MS_Capabilities><Capability><Layer><Name>demo:clouds</Name><Extent name=\"time\">2020-01-01T10:00:00Z,2020-01-01T10:10:00Z,2020-01-01T10:20:00Z</Extent></Layer></Capability></WMT_MS_Capabilities>";
class TestKv {
 constructor(){this.values=new Map();this.gets=0;this.puts=0;this.fail=false;}
 async get(key,type){
   assert.equal(type,"arrayBuffer");
   this.gets++;
   if(this.fail)throw Error("KV temporarily offline");
   const value=this.values.get(key);
   return value ? value.slice(0):null;
 }
 async put(key,value,{expirationTtl}){
   assert.ok(expirationTtl>=60);
   this.puts++;
   if(this.fail)throw Error("KV temporarily offline");
   this.values.set(key,value.slice(0));
 }
}
const makeStore=(kv,options={})=>new MeteosatCloudflareKvStore(kv,{...options,
  digest: data=>webcrypto.subtle.digest("SHA-256",data)});
const wmsFetcher=(tracker)=>async url=>{
  if(new URL(String(url)).searchParams.get("REQUEST")==="GetCapabilities")
    return new Response(xml,{headers:{"content-type":"text/xml"}});
  tracker.count++;
  return new Response(png.slice(),{headers:{"content-type":"image/png"}});
};
test("v1.7 second SDK instance reads shared KV without another EUMETSAT image request",async()=>{
 const kv=new TestKv();
 const store=makeStore(kv,{prefix:"openlaunch:test"});
 const trace={count:0};
 const one=new SpaceMapClient({fetch:wmsFetcher(trace),meteosatCache:{sharedStore:store}});
 const two=new SpaceMapClient({fetch:wmsFetcher(trace),meteosatCache:{sharedStore:store}});
 const a=await one.meteosatImage(opts);
 assert.equal(a.cacheState,"miss");
 assert.equal(trace.count,1);
 assert.equal(kv.puts,1);
 const b=await two.meteosatImage({...opts,time:"2020-01-01T10:00:00.000Z"});
 assert.equal(b.cacheState,"shared-hit");
 assert.equal(trace.count,1);
 assert.deepEqual([...b.image],[...png]);
 b.image[0]=0;
 assert.equal((await two.meteosatImage(opts)).image[0],137);
 assert.equal(two.meteosatCacheStats().sharedHits,1);
 assert.equal((await one.meteosatImage(opts)).cacheState,"hit");
 assert.equal(await store.keyFor(meteosatWmsMapUrl(opts).url),
   await store.keyFor(meteosatWmsMapUrl({...opts,time:"2020-01-01T10:00:00.000Z"}).url));
 assert.equal((await two.meteosatPlayback({layer:opts.layer,bounds3857:opts.bounds3857,width:128,height:128,maxChecks:1,maxFrames:1})).playableFrames,1);
});
test("v1.7 expired remote records are ignored even while present in KV",async()=>{
 let time=10000;
 const kv=new TestKv(),store=makeStore(kv,{now:()=>time});
 const supplier={fetchMap:async()=>({image:png.slice(),contentType:"image/png",descriptor:meteosatWmsMapUrl(opts)}),timeline:async()=>({})};
 const cache1=new MeteosatImageCache(supplier,{sharedStore:store,ttlMs:1000},()=>time);
 assert.equal((await cache1.fetchMap(opts)).cacheState,"miss");
 time+=1100;
 const cache2=new MeteosatImageCache(supplier,{sharedStore:store,ttlMs:1000},()=>time);
 assert.equal((await cache2.fetchMap(opts)).cacheState,"miss");
 assert.equal(cache2.stats().sharedMisses,1);
});
test("v1.7 rejects corrupt KV blobs and validates URL/namespace boundaries",async()=>{
 const kv=new TestKv(),store=makeStore(kv);
 const key=await store.keyFor(meteosatWmsMapUrl(opts).url);
 kv.values.set(key,new TextEncoder().encode("<ServiceException/>").buffer);
 assert.equal(await store.get(meteosatWmsMapUrl(opts).url),null);
 await assert.rejects(store.keyFor("https://evil.example/anything?TIME=x&REQUEST=GetMap"),/official/);
 await assert.rejects(store.keyFor(meteosatWmsMapUrl({...opts,time:undefined}).url),/explicitly timed/);
 assert.throws(()=>makeStore(kv,{prefix:"bad prefix"}),/prefix/);
});
test("v1.7 fails open on KV read/write errors and never writes untimed WMS frames",async()=>{
 const kv=new TestKv();kv.fail=true;
 const store=makeStore(kv);
 const trace={count:0};
 const sdk=new SpaceMapClient({fetch:wmsFetcher(trace),meteosatCache:{sharedStore:store}});
 const a=await sdk.meteosatImage(opts);
 assert.equal(a.cacheState,"miss");
 assert.equal(sdk.meteosatCacheStats().sharedErrors,2);
 assert.equal(trace.count,1);
 const dynamic=await sdk.meteosatImage({...opts,time:undefined});
 assert.equal(dynamic.cacheState,"bypass");
 assert.equal(kv.puts,1);
 assert.equal(trace.count,2);
});
test("v1.7 shared cache respects MIME/payload validation independently of local cache",async()=>{
 const kv=new TestKv(),store=makeStore(kv);
 const url=meteosatWmsMapUrl(opts).url;
 await store.put(url,{image:new TextEncoder().encode("oops"),contentType:"image/png",expiresAt:Date.now()+300000});
 let downloaded=0;
 const cache=new MeteosatImageCache({fetchMap:async()=>{downloaded++;return {image:png.slice(),contentType:"image/png",descriptor:meteosatWmsMapUrl(opts)};},timeline:async()=>({})},{sharedStore:store});
 const r=await cache.fetchMap(opts);
 assert.equal(r.cacheState,"miss");
 assert.equal(downloaded,1);
 assert.equal(cache.stats().sharedHits,0);
});
