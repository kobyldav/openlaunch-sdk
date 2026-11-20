import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {downloadS2pAsset} from "../scripts/terrain-s2p-download.mjs";

const base="https://example.org/s2p/",sourcePath="expected_output/triplet/dsm.tif";
const tiff=Buffer.alloc(128);tiff[0]=73;tiff[1]=73;tiff[2]=42;
const fixture=async fn=>{
 const root=await mkdtemp(join(tmpdir(),"openlaunch-s2p-"));
 try{await fn(root)}finally{await rm(root,{recursive:true,force:true})}
};
test("S2P retries a timed-out network request and shares the verified reference TIFF",()=>fixture(async root=>{
 let calls=0;
 const first=await downloadS2pAsset({base,sourcePath,name:"reference-s2p.tif",
  out:join(root,"first"),cacheDir:join(root,"shared"),attempts:2,timeoutMs:1000,retryDelayMs:0,
  fetchImpl:async()=>{calls++;if(calls===1)throw Error("timeout");return new Response(tiff,{status:200});}});
 assert.equal(calls,2);assert.deepEqual(first,tiff);
 await rm(join(root,"first"),{recursive:true,force:true});
 const cached=await downloadS2pAsset({base,sourcePath,name:"reference-s2p.tif",
  out:join(root,"second"),cacheDir:join(root,"shared"),
  fetchImpl:async()=>{throw Error("Network must not be accessed when cached");}});
 assert.deepEqual(cached,tiff);
 assert.deepEqual(await readFile(join(root,"shared",sourcePath)),tiff);
}));
test("S2P does not write partial or invalid assets when every remote attempt fails",()=>fixture(async root=>{
 const out=join(root,"output"),cacheDir=join(root,"cache");
 let calls=0;
 await assert.rejects(()=>downloadS2pAsset({base,sourcePath,name:"reference-s2p.tif",
  out,cacheDir,attempts:2,timeoutMs:1000,retryDelayMs:0,
  fetchImpl:async()=>{calls++;throw Error("socket offline");}}),/unavailable after 2 attempts/);
 assert.equal(calls,2);
 assert.equal(await stat(join(out,"reference-s2p.tif")).then(()=>true).catch(()=>false),false);
 assert.equal(await stat(join(cacheDir,sourcePath)).then(()=>true).catch(()=>false),false);
}));
test("S2P never caches HTTP errors, HTML masquerading as TIFF, or corrupt local files",()=>fixture(async root=>{
 const out=join(root,"out"),cacheDir=join(root,"shared");await mkdir(out,{recursive:true});
 await writeFile(join(out,"reference-s2p.tif"),"broken");
 let calls=0;
 const result=await downloadS2pAsset({base,sourcePath,out,cacheDir,name:"reference-s2p.tif",
  attempts:3,timeoutMs:1000,retryDelayMs:0,
  fetchImpl:async()=>{calls++;return calls===1?new Response("not a TIFF",{status:200}):new Response(tiff,{status:200})}});
 assert.equal(calls,2);assert.deepEqual(result,tiff);
 let httpCalls=0;
 await assert.rejects(()=>downloadS2pAsset({base,sourcePath:"expected_output/pair/dsm.tif",
  out:join(root,"missing"),cacheDir, name:"missing.tif",attempts:3,timeoutMs:1000,retryDelayMs:0,
  fetchImpl:async()=>{httpCalls++;return new Response("Not found",{status:404});}}),/unavailable/);
 assert.equal(httpCalls,1);
}));
