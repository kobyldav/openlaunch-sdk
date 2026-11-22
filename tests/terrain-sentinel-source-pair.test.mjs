import test from "node:test";
import assert from "node:assert/strict";
import {loadSentinelSourcePair} from "../dist/index.js";

test("Stage 21: two original Sentinel scenes overlap only when explicitly enabled and remain chronologically ordered",async()=>{
 const sources=[{id:"S2A_20250807_REAL",acquiredAt:"2025-08-07T10:00:00Z"},
   {id:"S2B_20250822_REAL",acquiredAt:"2025-08-22T10:00:00Z"}];
 let active=0,max=0,events=[];
 const load=async scene=>{
   active++;max=Math.max(max,active);events.push("start:"+scene.id);
   // The first acquisition deliberately finishes last. These are scheduler
   // fixtures, NOT fabricated spectral/NDVI observations or COGs.
   await new Promise(r=>setTimeout(r,scene===sources[0]?20:2));
   active--;events.push("finish:"+scene.id);
   return {id:scene.id,acquiredAt:scene.acquiredAt,origin:"test-only metadata"};
 };
 const serial=await loadSentinelSourcePair(sources,load,1);
 assert.equal(max,1);
 assert.deepEqual(serial.map(v=>v.id),sources.map(v=>v.id));
 assert.deepEqual(events.slice(0,3),[
   "start:"+sources[0].id,"finish:"+sources[0].id,"start:"+sources[1].id
 ]);
 active=0;max=0;events=[];
 const parallel=await loadSentinelSourcePair(sources,load,2);
 assert.equal(max,2);
 assert.deepEqual(parallel.map(v=>v.id),sources.map(v=>v.id));
 assert.deepEqual(events.slice(0,2),["start:"+sources[0].id,"start:"+sources[1].id]);
 assert.ok(events.indexOf("finish:"+sources[1].id)<
   events.indexOf("finish:"+sources[0].id),
   "Finishing out of order must never reorder acquisition dates");
});

test("Stage 21: any unavailable authentic acquisition rejects the whole pair, without another date or source substitution",async()=>{
 const ids=["S2A_original","S2B_original"];
 let started=[];
 await assert.rejects(loadSentinelSourcePair(ids,async id=>{
   started.push(id);
   if(id===ids[1])throw Error("Original Sentinel COG range unavailable");
   await new Promise(r=>setTimeout(r,8));
   return {source:id};
 },2),/Original Sentinel COG range unavailable/);
 assert.deepEqual(started,ids);
 await assert.rejects(loadSentinelSourcePair(ids,async id=>{
   if(id===ids[0])throw Error("Cloud-only source");
   return id;
 },1),/Cloud-only source/);
});

test("Stage 21: concurrency outside hard budget or incomplete source pair is never accepted",async()=>{
 const f=async x=>x;
 for(const p of [[],[1],[1,2,3],null])
   await assert.rejects(loadSentinelSourcePair(p,f,2),/Exactly two/);
 for(const mode of [0,3,-1,NaN,"2"])
   await assert.rejects(loadSentinelSourcePair([1,2],f,mode),/concurrency 1 or 2/);
});
