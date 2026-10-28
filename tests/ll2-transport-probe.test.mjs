import test from "node:test";
import assert from "node:assert/strict";
import {probeLl2} from "../scripts/ll2-transport-probe.mjs";
import {PRODUCTION_BASE_URL,DEVELOPMENT_BASE_URL} from "../dist/index.js";

const json=(body,status=200,headers={})=>new Response(
 JSON.stringify(body),{status,headers:{"content-type":"application/json",...headers}}
);
const launch={
 id:"test-1",name:"Test launch",net:"2035-01-01T00:00:00Z",
 status:{id:1,name:"Go"},vid_urls:[],rocket:{configuration:{name:"Mock rocket"}}
};
test("one LL2 request succeeds with normalized data, without leaking URL or response",async()=>{
 let calls=0;
 const result=await probeLl2({fetchImpl:async(url)=>{
  calls++;assert.match(String(url),/^https:\/\/ll\.thespacedevs\.com\/2\.3\.0\/launches\/upcoming\//);
  return json({count:1,next:null,previous:null,results:[launch]});
 }});
 assert.equal(calls,1);
 assert.equal(result.requests,1);
 assert.equal(result.outcome,"ok");
 assert.equal(result.status,200);
 assert.equal(result.launchPresent,true);
 assert.doesNotMatch(JSON.stringify(result),/launches\/upcoming|Test launch/);
});
test("a 429 with long retry-after returns immediately and never loops",async()=>{
 let calls=0;
 const started=Date.now();
 const result=await probeLl2({fetchImpl:async()=>{
  calls++;return json({detail:"SECRET_RESPONSE_BODY"},429,{"retry-after":"3600"});
 }});
 assert.equal(calls,1);
 assert.equal(result.requests,1);
 assert.equal(result.outcome,"rate_limited");
 assert.equal(result.status,429);
 assert.equal(result.retryAfterSeconds,3600);
 assert.ok(Date.now()-started<2000);
 assert.doesNotMatch(JSON.stringify(result),/SECRET_RESPONSE_BODY/);
});
test("403 is reported as auth or other HTTP failure without printing provider text",async()=>{
 const result=await probeLl2({fetchImpl:async()=>{
  return json({detail:"private-secret"},403);
 }});
 assert.equal(result.outcome,"http_error");
 assert.equal(result.status,403);
 assert.doesNotMatch(JSON.stringify(result),/private-secret/);
});
test("hung abort-aware provider returns an SDK timeout, not a runner kill",async()=>{
 const result=await probeLl2({timeoutMs:25,fetchImpl:async(_url,init)=>{
  return await new Promise((_resolve,reject)=>{
   if(init.signal.aborted)return reject(new Error("Aborted"));
   init.signal.addEventListener("abort",()=>reject(new Error("Aborted")),{once:true});
  });
 }});
 assert.equal(result.outcome,"sdk_timeout");
 assert.equal(result.requests,1);
});
test("probe rejects untrusted endpoints and invalid timeout without network",async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;throw Error("network should never run");};
 await assert.rejects(probeLl2({baseUrl:"https://example.com/",fetchImpl}),/official fixed endpoints/);
 await assert.rejects(probeLl2({timeoutMs:0,fetchImpl}),/timeout/);
 assert.equal(calls,0);
 const dev=await probeLl2({baseUrl:DEVELOPMENT_BASE_URL,fetchImpl:async()=>{
  calls++;return json({count:0,next:null,previous:null,results:[]});
 }});
 assert.equal(dev.endpoint,"development");
 assert.equal(dev.launchPresent,false);
 assert.equal(calls,1);
});
