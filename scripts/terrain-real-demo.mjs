import {mkdir,writeFile,readFile,stat,rename,rm} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import {Readable,Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {execFileSync} from "node:child_process";
import {resolve,join,basename} from "node:path";
import {loadTerrainRpcImage,reconstructTerrain,refineTerrainSurface,terrainPointCloudPly,discoverAsterStereo,estimateTerrainHeightBand} from "../dist/terrain/index.js";
import {compareReference} from "./terrain-reference-check.mjs";
import {writeRealTerrainViewer} from "./terrain-real-viewer.mjs";
const archiveUrl="https://github.com/NeoGeographyToolkit/StereoPipelineSolvedExamples/releases/download/ASTER/ASTER_example.tar";
const args=process.argv.slice(2), opt=name=>{const i=args.indexOf("--"+name);return i>=0?args[i+1]:undefined;};
const out=resolve(opt("out")??"test-results/terrain-real");
await mkdir(out,{recursive:true});
if(args.includes("--snezka")){
 const scenes=await discoverAsterStereo({bounds:[15.68,50.70,15.80,50.78],from:new Date("2000-01-01"),to:new Date(),limit:30});
 await writeFile(join(out,"snezka-catalog.json"),JSON.stringify(scenes,null,2));
 console.log("Snezka ASTER discovery only: "+scenes.length+" granules; calibrated 3N/3B imagery must be prepared before reconstruction. See docs.");
 process.exit(0);
}
const local=opt("left")||opt("right");
let input;
if(local){
 if(!opt("left")||!opt("right"))throw Error("Both --left and --right are required");
 input=[["left",opt("left"),opt("left-xml")],["right",opt("right"),opt("right-xml")]];
}else{
 const archive=join(out,"ASTER_example.tar");
 const present=await stat(archive).catch(()=>null);
 if(!present||present.size!==152197120){
   console.log("Downloading public ASTER stereo archive (152 MB). Only sensor TIFF and RPC XML are read, never reference DEM.");
   const response=await fetch(archiveUrl,{signal:AbortSignal.timeout(300_000)});
   if(!response.ok||!response.body)throw Error("ASTER archive HTTP "+response.status);
   let count=0;const temp=archive+".part";
   try{await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,enc,cb){count+=chunk.length;cb(count>152197120?Error("Archive exceeds expected size"):null,chunk);}}),createWriteStream(temp));
    if(count!==152197120)throw Error("Unexpected archive length "+count);await rename(temp,archive);}
   catch(e){await rm(temp,{force:true});throw e;}
 }
 const list=execFileSync("tar",["-tf",archive],{encoding:"utf8",maxBuffer:4*1024*1024}).split(/\r?\n/).filter(Boolean);
 const candidates=list.filter(x=>/\.tiff?$/i.test(x)&&!/(?:DEM|hillshade|ortho|proj|run-|\bPC\b|mask)/i.test(basename(x)));
 const choose=band=>{const t=candidates.find(x=>new RegExp("(?:band)?3"+band+"(?:[_.-]|$)","i").test(basename(x)));if(!t)throw Error("ASTER band "+band+" not found. Image entries: "+candidates.join(", "));const stem=t.replace(/\.tiff?$/i,"");const xml=list.find(x=>x.toLowerCase()===(stem+".xml").toLowerCase());return [band,t,xml];};
 input=[choose("N"),choose("B")];
 const extract=(name)=>{if(!name||name.startsWith("-")||name.includes("\0"))throw Error("Invalid archive member");return execFileSync("tar",["-xOf",archive,"--",name],{maxBuffer:256*1024*1024});};
 for(const [id,tif,xml] of input){const p=join(out,id+".tif"),q=xml?join(out,id+".xml"):undefined;await writeFile(p,extract(tif));if(q)await writeFile(q,extract(xml));input[input.findIndex(a=>a[0]===id)]=[id,p,q];}
}
const data=await Promise.all(input.map(async([id,tif,xml])=>loadTerrainRpcImage(await readFile(tif),id,{...(xml?{xml:await readFile(xml,"utf8")}:{ }),zeroIsNoData:!local})));
const images=data.map(d=>d.image),rpcs=data.map(d=>d.rpc);
console.log("Loaded calibrated images",data.map(d=>({source:d.image.source,width:d.image.width,height:d.image.height,rpc:{longitude:d.rpc.longitudeOffset,latitude:d.rpc.latitudeOffset,height:d.rpc.heightOffset,heightScale:d.rpc.heightScale}})));
const numeric=(name,fallback)=>{const value=opt(name)===undefined?fallback:Number(opt(name));if(!Number.isFinite(value))throw Error("Invalid --"+name);return value;};
const size=numeric("size",48),res=numeric("resolution",30);
if(!Number.isInteger(size)||size<8||size>150||res<5||res>200)throw Error("size must be 8–150, resolution 5–200 m");
const lo=Math.max(...rpcs.map(r=>r.heightOffset-r.heightScale)),hi=Math.min(...rpcs.map(r=>r.heightOffset+r.heightScale));
let minHeightM=numeric("min-height",Math.max(lo,-100)),maxHeightM=numeric("max-height",hi);
if(!(maxHeightM>minHeightM))throw Error("RPC height domains do not overlap");
let heightStepM=numeric("height-step",10);
const centerLon=rpcs.reduce((s,r)=>s+r.longitudeOffset,0)/rpcs.length,centerLat=rpcs.reduce((s,r)=>s+r.latitudeOffset,0)/rpcs.length;
const dy=res/111320,dx=dy/Math.cos(centerLat*Math.PI/180);
const score=(lon,lat)=>{let total=0;for(const im of images){const p=im.camera.project({longitudeDeg:lon,latitudeDeg:lat,heightM:(minHeightM+maxHeightM)/2});if(!p||p.x<50||p.y<50||p.x>im.width-51||p.y>im.height-51)return -Infinity;let a=[];for(let y=-24;y<=24;y+=6)for(let x=-24;x<=24;x+=6){const v=im.values[(Math.round(p.y)+y)*im.width+Math.round(p.x)+x];if(Number.isFinite(v))a.push(v);}if(a.length<70)return -Infinity;const mean=a.reduce((s,v)=>s+v,0)/a.length;total+=a.reduce((s,v)=>s+(v-mean)**2,0)/a.length;}return total;};
let lon=numeric("lon",centerLon),lat=numeric("lat",centerLat);
if(!opt("lon")&&!opt("lat")){let best=-Infinity;for(let j=-3;j<=3;j++)for(let i=-3;i<=3;i++){const x=centerLon+i*Math.min(...rpcs.map(r=>r.longitudeScale))*.12,y=centerLat+j*Math.min(...rpcs.map(r=>r.latitudeScale))*.12,s=score(x,y);if(s>best){best=s;lon=x;lat=y;}}if(!Number.isFinite(best))throw Error("No common textured image patch located; provide --lon and --lat.");}
const grid={width:size,height:size,crs:"EPSG:4326",transform:[lon-size/2*dx,dx,0,lat+size/2*dy,0,-dy]};
const started=Date.now();
let pilot=null;
if(!opt("min-height")&&!opt("max-height")){
 pilot=estimateTerrainHeightBand({images,grid,minHeightM,maxHeightM,heightStepM});
 ({minHeightM,maxHeightM}=pilot);console.log("Image-only height pilot",pilot);
}
console.log("Reconstructing actual stereo images, no DEM", {lon,lat,size,res,minHeightM,maxHeightM,heightStepM});
const result=reconstructTerrain({images,grid,minHeightM,maxHeightM,heightStepM,patchRadius:3,minCorrelation:.72,minPeakGap:.025,peakExclusionM:40,recoverMissing:!args.includes("--no-recovery"),maxWork:250_000_000});
const refined=refineTerrainSurface(result.elevationMap,{outlierM:Math.max(35,heightStepM*2),fillRadius:1});
const report={synthetic:false,source:local?"user-supplied calibrated stereo":archiveUrl,model:result.model,verticalDatum:result.verticalDatum,center:{longitudeDeg:lon,latitudeDeg:lat},resolutionM:res,validPixels:result.validPixels,totalPixels:result.totalPixels,coverage:result.validPixels/result.totalPixels,rejected:refined.rejected,interpolated:refined.filled,elapsedMs:Date.now()-started,accuracy:"not independently validated"};
report.pilot=pilot;
report.recoveredPixels=result.recoveredPixels;
report.initialMatches=result.validPixels-result.recoveredPixels;
const vals=Array.from(refined.grid.values).filter(Number.isFinite).sort((a,b)=>a-b);
report.heightRangeM=vals.length?[vals[0],vals[vals.length-1]]:null;
report.filteredCoverage=vals.length/result.totalPixels;
if(!local&&!args.includes("--no-reference")){
 try{report.reference=await compareReference(refined.grid,out);report.referencePassed=report.reference.centeredRmseM<=60&&Math.abs(report.reference.meanDifferenceM)<=150;}
 catch(e){report.referenceError=String(e);report.referencePassed=false;}
}
await writeFile(join(out,"report.json"),JSON.stringify(report,null,2));
await writeFile(join(out,"point-cloud.ply"),terrainPointCloudPly(result));
const csv=["lon,lat,raw_height_m,refined_height_m,confidence,quality_flag,match_pass"];for(let i=0;i<result.totalPixels;i++){const fmt=v=>Number.isFinite(v)?v:"";csv.push([grid.transform[0]+(i%size+.5)*dx,grid.transform[3]-(Math.floor(i/size)+.5)*dy,fmt(result.elevationMap.values[i]),fmt(refined.grid.values[i]),fmt(result.confidenceMap.values[i]),refined.flags[i],result.matchPass[i]].join(","));}
await writeFile(join(out,"heights.csv"),csv.join("\n")+"\n");
await writeRealTerrainViewer(out,{result,refined,report});
console.log(JSON.stringify(report,null,2));console.log("Open "+join(out,"terrain.html"));
if(result.validPixels<result.totalPixels*.3||report.filteredCoverage<.25||report.referencePassed===false)throw Error("Reconstruction quality gate failed. Diagnostic files retained; do not treat as a valid terrain model.");
