/** Stage 15 live proof: same 10m Prague tile; three consecutive actual
 * annual Sentinel-2 L2A source pairs, source-calibrated NDVI and SCL.
 * Never substitute fixture pixels when a source COG is inaccessible.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
const cache=resolve("test-results/terrain-prague-stream-ci");
await mkdir(cache,{recursive:true});
const server=spawn(process.execPath,[
 fileURLToPath(new URL("./terrain-prague-stream.mjs",import.meta.url)),
 "--port","0","--no-open","--cache",cache
],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let stdout="",stderr="";
server.stderr.on("data",x=>stderr+=x.toString());
try{
 const origin=await new Promise((res,rej)=>{
   const timer=setTimeout(()=>rej(Error("Multi-year Prague server did not start: "+stderr)),20000);
   const onData=data=>{
     stdout+=data.toString();
     const port=stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
     if(port){clearTimeout(timer);server.stdout.off("data",onData);
       res("http://127.0.0.1:"+port[1]);}
   };
   server.stdout.on("data",onData);server.once("error",rej);
 });
 const cases=[{from:2023,to:2025,month:8,cloud:50},
   {from:2022,to:2024,month:8,cloud:65}];
 let verified=null,lastError=null;
 for(const item of cases){
   try{
     const query=new URLSearchParams(Object.entries(item).map(([key,v])=>[key,String(v)]));
     const catalogUrl=origin+"/api/observations/multiyear/scenes/0/3/3.json?"+query;
     const catResponse=await fetch(catalogUrl,{signal:AbortSignal.timeout(80000)});
     if(!catResponse.ok)throw Error("STAC HTTP "+catResponse.status+
       " "+(await catResponse.text()).slice(0,250));
     const found=await catResponse.json();
     assert.equal(found.status,"real-sentinel-multiyear-catalog");
     assert.equal(found.key,"0-3-3");
     assert.equal(found.seasons.length,3);
     for(const [index,s] of found.seasons.entries()){
       assert.equal(s.year,item.from+index);
       assert.equal(s.scenes.length,2);
       assert.ok(s.scenes.every(o=>new Date(o.acquiredAt).getUTCFullYear()===s.year));
       assert.ok(s.scenes.every(o=>new Date(o.acquiredAt).getUTCMonth()+1===item.month));
     }
     const prefix=origin+"/api/observations/multiyear/0/3/3/"+
       item.from+"/"+item.to+"/"+item.month+".";
     const res=await fetch(prefix+"json?cloud="+item.cloud,
       {signal:AbortSignal.timeout(240000)});
     if(!res.ok)throw Error("Real annual source COG HTTP "+res.status+
       " "+(await res.text()).slice(0,340));
     const data=await res.json();
     assert.equal(data.status,"real-sentinel-multiyear-seasonal-trend");
     assert.equal(data.version,1);assert.equal(data.key,"0-3-3");
     assert.equal(data.month,item.month);assert.equal(data.years.length,3);
     assert.equal(data.statistics.yearCount,3);
     assert.equal(data.statistics.firstYear,item.from);
     assert.equal(data.statistics.lastYear,item.to);
     assert.equal(data.qa.allSourceSclMasked,true);
     assert.equal(data.qa.allSameGrid,true);
     assert.equal(data.qa.fixedCommonPixelPopulation,true);
     assert.equal(data.qa.leaveOneYearOutSensitivity,true);
     assert.equal(data.qa.noGapFilling,true);
     assert.equal(data.terrainElevationUnchanged,true);
     assert.ok(data.statistics.commonValidPixels>=16);
     assert.equal(data.statistics.increasingPixels+
       data.statistics.decreasingPixels+data.statistics.stablePixels,
       data.statistics.commonValidPixels);
     assert.ok(data.statistics.robustAllYearsPixels<=data.statistics.commonValidPixels);
     for(let i=0;i<found.seasons.length;i++){
       assert.deepEqual(data.years[i].scenes.map(x=>x.sceneId),
         found.seasons[i].scenes.map(x=>x.id));
       assert.deepEqual(data.years[i].scenes.map(x=>x.acquiredAt),
         found.seasons[i].scenes.map(x=>x.acquiredAt));
     }
     const n=data.width*data.height;
     function floats(b64){
       const bytes=Buffer.from(b64,"base64");
       assert.equal(bytes.byteLength,n*4);
       return new Float32Array(bytes.buffer.slice(bytes.byteOffset,
         bytes.byteOffset+bytes.byteLength));
     }
     const slope=floats(data.slopeF32LE),
       low=floats(data.loF32LE),high=floats(data.hiF32LE);
     const support=Buffer.from(data.robustB64,"base64");
     assert.equal(support.byteLength,n);
     assert.equal(slope.filter(Number.isFinite).length,
       data.statistics.commonValidPixels);
     assert.equal(low.filter(Number.isFinite).length,
       data.statistics.commonValidPixels);
     assert.equal(high.filter(Number.isFinite).length,
       data.statistics.commonValidPixels);
     assert.equal(support.filter(x=>x===1).length,
       data.statistics.robustAllYearsPixels);
     for(let i=0;i<n;i++)
       if(Number.isFinite(slope[i])){
         assert.ok(low[i]<=high[i]);
         assert.ok(Number.isFinite(slope[i]));
       }else{
         assert.ok(Number.isNaN(slope[i]));
         assert.ok(Number.isNaN(low[i]));
         assert.ok(Number.isNaN(high[i]));
       }
     const png=await fetch(prefix+"png?cloud="+item.cloud,
       {signal:AbortSignal.timeout(20000)});
     assert.equal(png.status,200);
     const bytes=Buffer.from(await png.arrayBuffer());
     assert.ok(bytes.byteLength>100);
     assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
     verified={status:"real-sentinel-multiyear-verified",selection:item,
       years:data.years,statistics:data.statistics,qa:data.qa,
       source:data.source,area:data.area,grid:data.grid,
       terrainElevationUnchanged:true,
       note:"Three original consecutive same-month annual Sentinel-2 L2A COG pairs. Theil-Sen and leave-one-year-out sensitivity from original calibrated numeric NDVI."};
     break;
   }catch(error){
     lastError=error;
     console.error("Multi-year original source candidate failed "+
       JSON.stringify(item)+": "+error);
   }
 }
 if(!verified)throw Error("No verifiable three-year source coverage: "+lastError);
 await writeFile(join(cache,"multiyear-live-report.json"),JSON.stringify(verified,null,2));
 const s=verified.statistics;
 console.log("PASS genuine "+s.firstYear+".."+s.lastYear+
   " 3-year six-real-scene Sentinel Prague Theil-Sen: "+
   s.commonValidPixels+" true SCL-valid pixels ("+
   s.commonValidPercent.toFixed(2)+" %), robust-two-per-year "+
   s.robustAllYearsPixels+", mean slope "+
   s.meanSlopeNdviPerYear.toFixed(5)+" NDVI/year, "+
   s.signSensitivePixels+" leave-year-out sign-sensitive pixels; "+
   "no imaginary data and NOT statistical confidence");
}finally{server.kill();}
