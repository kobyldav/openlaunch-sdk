import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import { SpaceMapClient, MeteosatCloudflareKvStore } from "@openlaunchsdk/earth";
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const kv=new Map();
const store=new MeteosatCloudflareKvStore({
  get:async key=>kv.get(key)?.slice(0)??null,
  put:async (key,value)=>{kv.set(key,value.slice(0));}
},{digest: data=>webcrypto.subtle.digest("SHA-256",data)});
let fetched=0;
const fetch=async url=>{
  fetched++;
  return new Response(png.slice(),{headers:{"content-type":"image/png"}});
};
const opts={layer:"demo:clouds",bounds3857:[1300000,6200000,1900000,6900000],width:256,height:256,time:"2020-01-01T10:00:00Z"};
const first=new SpaceMapClient({fetch,meteosatCache:{sharedStore:store}});
const second=new SpaceMapClient({fetch,meteosatCache:{sharedStore:store}});
const a=await first.meteosatImage(opts);
const b=await second.meteosatImage(opts);
assert.equal(a.cacheState,"miss");
assert.equal(b.cacheState,"shared-hit");
assert.equal(fetched,1);
console.log("PASS OpenLaunch v1.7 shared Meteosat cache");
console.log("Provider downloads:",fetched);
console.log("Second SDK cache state:",b.cacheState);
console.log("Shared image entries:",kv.size);
console.log("Verified satellite acquisition:",b.descriptor.observedAt!==null);
