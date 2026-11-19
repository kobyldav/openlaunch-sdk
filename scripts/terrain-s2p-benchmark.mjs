import {mkdir,writeFile,readFile,stat} from "node:fs/promises";
import {resolve,join} from "node:path";
import {loadTerrainRpcImage,reconstructTerrainFromSource,refineTerrainSurface,estimateTerrainHeightBand,terrainPointCloudPly} from "../dist/terrain/index.js";
import {decodeGeoTiff} from "../dist/eo/geotiff.js";
import {alignRasterTo} from "../dist/eo/raster.js";
import {writeRealTerrainViewer} from "./terrain-real-viewer.mjs";
const args=process.argv.slice(2),opt=name=>args[args.indexOf("--"+name)+1],id=opt("dataset"),out=resolve(opt("out"));
if(!["s2p-pair","s2p-triplet"].includes(id))throw Error("Invalid s2p case");
await mkdir(out,{recursive:true});
const dataset=id.split("-")[1],base="https://raw.githubusercontent.com/centreborelli/s2p/75ea354dc7de658bf696eabf11944e92c65412c5/tests/data/";
async function download(path,name){
 const file=join(out,name);let data=await readFile(file).catch(()=>null);
 if(!data){const r=await fetch(base+path,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error("Download "+path+" HTTP "+r.status);data=Buffer.from(await r.arrayBuffer());if(data.length>15_000_000)throw Error("Unexpected file size");await writeFile(file,data);}
 return data;
}
const data=await Promise.all(Array.from({length:dataset==="pair"?2:3},(_,i)=>i+1).map(async i=>{const name="img_0"+i+".tif";return loadTerrainRpcImage(await download("input_"+dataset+"/"+name,name),name);}));
const images=data.map(d=>d.image),rpcs=data.map(d=>d.rpc),first=rpcs[0];
const source={kind:"satellite",images:data.map(d=>({...d.image,calibration:{kind:"rpc",rpc:d.rpc}}))};
const lo=Math.max(...rpcs.map(r=>r.heightOffset-r.heightScale)),hi=Math.min(...rpcs.map(r=>r.heightOffset+r.heightScale));
if(hi<=lo)throw Error("No shared calibrated height domain");
// Solve image centre at the calibration height using Newton iteration, not reference DSM.
let lon=first.longitudeOffset,lat=first.latitudeOffset;const h=(lo+hi)/2;
const targetX=(images[0].width-1)/2,targetY=(images[0].height-1)/2,project=(x,y)=>images[0].camera.project({longitudeDeg:x,latitudeDeg:y,heightM:h});
for(let j=0;j<16;j++){const p=project(lon,lat),a=project(lon+1e-6,lat),b=project(lon,lat+1e-6);if(!p||!a||!b)throw Error("Image center outside RPC");const ex=targetX-p.x,ey=targetY-p.y;if(Math.hypot(ex,ey)<.01)break;const ax=a.x-p.x,ay=a.y-p.y,bx=b.x-p.x,by=b.y-p.y,det=ax*by-bx*ay;if(Math.abs(det)<1e-15)throw Error("Degenerate RPC center");lon+=1e-6*(ex*by-ey*bx)/det;lat+=1e-6*(ax*ey-ay*ex)/det;}
const size=48,resolutionM=2,dy=resolutionM/111320,dx=dy/Math.cos(lat*Math.PI/180);
const grid={width:size,height:size,crs:"EPSG:4326",transform:[lon-size*dx/2,dx,0,lat+size*dy/2,0,-dy]};
const started=Date.now(),step=Math.max(.5,(hi-lo)/800);
const pilot=estimateTerrainHeightBand({images,grid,minHeightM:lo,maxHeightM:hi,heightStepM:step},{pilotStepM:Math.max(1,step),clusterRadiusM:20,marginM:25});
const minHeightM=pilot.minHeightM,maxHeightM=pilot.maxHeightM,heightStepM=Math.max(.5,(maxHeightM-minHeightM)/120);
const result=reconstructTerrainFromSource({source,grid,minHeightM,maxHeightM,heightStepM,patchRadius:2,minCorrelation:.7,minPeakGap:.02,peakExclusionM:3,recoverMissing:true,maxWork:250_000_000});
const refined=refineTerrainSurface(result.elevationMap,{outlierM:8,fillRadius:1}),vals=Array.from(refined.grid.values).filter(Number.isFinite);
const report={sourceKind:"satellite",synthetic:false,source:base+"input_"+dataset,model:result.model,verticalDatum:result.verticalDatum,center:{longitudeDeg:lon,latitudeDeg:lat},resolutionM,validPixels:result.validPixels,totalPixels:result.totalPixels,coverage:result.validPixels/result.totalPixels,filteredCoverage:vals.length/result.totalPixels,rejected:refined.rejected,interpolated:refined.filled,recoveredPixels:result.recoveredPixels,heightRangeM:vals.length?[Math.min(...vals),Math.max(...vals)]:null,elapsedMs:Date.now()-started,pilot};
// Only after reconstruction: compare against s2p expected output, not independent ground truth.
try{
 const dem=await decodeGeoTiff(await download("expected_output/"+dataset+"/dsm.tif","reference-s2p.tif"));
 const aligned=alignRasterTo(dem,result.elevationMap,"nearest");
 const errors=[];for(let i=0;i<aligned.values.length;i++){const a=refined.grid.values[i],b=aligned.values[i];if(Number.isFinite(a)&&Number.isFinite(b))errors.push(a-b);}
 if(errors.length<10)throw Error("Insufficient reference overlap");
 const mean=errors.reduce((s,x)=>s+x,0)/errors.length;
 report.reference={source:"S2P expected-output DSM (algorithm comparison, NOT independent truth)",count:errors.length,meanDifferenceM:mean,centeredRmseM:Math.sqrt(errors.reduce((s,x)=>s+(x-mean)**2,0)/errors.length)};
 report.referencePassed=report.reference.centeredRmseM<=15&&Math.abs(mean)<=50;
}catch(e){report.referenceError=String(e);report.referencePassed=false;}
 await writeFile(join(out,"report.json"),JSON.stringify(report,null,2));await writeFile(join(out,"point-cloud.ply"),terrainPointCloudPly(result));await writeRealTerrainViewer(out,{result,refined,report});console.log(JSON.stringify(report,null,2));
 if(report.coverage<.3||!report.referencePassed)throw Error("S2P case quality / reference gate failed");
