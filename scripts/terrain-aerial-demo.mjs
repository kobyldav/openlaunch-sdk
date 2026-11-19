import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve,join,dirname} from "node:path";
import {reconstructTerrainFromSource,refineTerrainSurface,validateTerrainHeights,terrainPointCloudPly} from "../dist/terrain/index.js";
import {decodeTerrainTiff} from "../dist/eo/geotiff.js";
import {gridCrsToLonLat,pixelToWorld} from "../dist/eo/raster.js";
import {writeRealTerrainViewer} from "./terrain-real-viewer.mjs";
const args=process.argv.slice(2),opt=name=>{const i=args.indexOf("--"+name);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith("--"))throw Error("Missing --"+name+" value");return args[i+1];};
const out=resolve(opt("out")??"test-results/terrain-aerial");
await mkdir(out,{recursive:true});
const manifestPath=opt("manifest");
let grid,source,minHeightM,maxHeightM,heightStepM,resolutionM,reference,description;
if(manifestPath){
 const path=resolve(manifestPath),m=JSON.parse(await readFile(path,"utf8"));
 if(m.version!==1||m.sourceKind!=="aerial"||m.verticalDatum!=="WGS84 ellipsoid"||!Array.isArray(m.images)||m.images.length<2||m.images.length>8)throw Error("Invalid aerial manifest; see documentation");
 grid=m.grid;({minHeightM,maxHeightM,heightStepM,resolutionM}=m);
 if(!grid||!Number.isInteger(grid.width)||!Number.isInteger(grid.height)||grid.width<2||grid.height<2||grid.width*grid.height>40000||!Number.isFinite(resolutionM)||resolutionM<=0)throw Error("Invalid aerial grid");
 // Sensor images, not orthomosaics: image data must match undistorted camera matrices.
 const images=await Promise.all(m.images.map(async im=>{
   if(typeof im.file!=="string"||!im.file.toLowerCase().match(/\.tiff?$/)||!im.source||!im.calibration)throw Error("Expected calibrated single-band TIFF image");
   const raw=await decodeTerrainTiff(await readFile(resolve(dirname(path),im.file)),{maxPixels:33_554_432,maxInputBytes:256*1024*1024});
   if(im.zeroIsNoData)for(let i=0;i<raw.values.length;i++)if(raw.values[i]===0)raw.values[i]=NaN;
   return {...raw,source:im.source,calibration:im.calibration};
 }));
 source={kind:"aerial",images};description="User-supplied calibrated aerial photographs";
}else{
 // Simulated perspective cameras over an independently rendered relief.
 // Only intensities and calibration go into the reconstruction.
 const crs="EPSG:32633",origin=[460000,5540000,200],w=180,h=180,cx=89.5,cy=89.5,f=190,alt=140;
 const surface=(x,y)=>12+9*Math.exp(-((x+7)**2+(y-3)**2)/190)+2*Math.sin(x/9)*Math.cos(y/10);
 const texture=(x,y)=>Math.sin(.57*x+.31*y)+.7*Math.cos(.21*x-.66*y)+.45*Math.sin(.93*x-.27*y)+.2*Math.cos(.044*x*y);
 const view=(camX,camY,id)=>{
   const matrix=[f,0,-cx,-f*camX+cx*alt,0,-f,-cy,f*camY+cy*alt,0,0,-1,alt];
   const values=Float64Array.from({length:w*h},(_,i)=>{
     const u=(i%w-cx)/f,v=(Math.floor(i/w)-cy)/f;let z=12,x=0,y=0;
     for(let j=0;j<24;j++){x=camX+(alt-z)*u;y=camY-(alt-z)*v;z=surface(x,y);}
     return texture(x,y);
   });
   return {width:w,height:h,source:id,values,calibration:{kind:"projected",camera:{crs,worldOffset:origin,matrix}}};
 };
 const n=48,step=.8;resolutionM=step;
 grid={width:n,height:n,crs,transform:[origin[0]-n*step/2,step,0,origin[1]+n*step/2,0,-step]};
 minHeightM=204;maxHeightM=230;heightStepM=.5;
 source={kind:"aerial",images:[view(-30,0,"synthetic-aerial-left"),view(30,0,"synthetic-aerial-right"),view(0,23,"synthetic-aerial-third")]};
 reference=Array.from({length:n*n},(_,i)=>({col:i%n,row:Math.floor(i/n),heightM:origin[2]+surface((i%n+.5-n/2)*step,(n/2-Math.floor(i/n)-.5)*step)}));
 description="Synthetic aerial perspective cameras (not real flight imagery)";
}
if(![minHeightM,maxHeightM,heightStepM,resolutionM].every(Number.isFinite)||heightStepM<=0||maxHeightM<=minHeightM)throw Error("Invalid height search");
console.log("Aerial stereo mode:",description);
const started=Date.now();
const result=reconstructTerrainFromSource({source,grid,minHeightM,maxHeightM,heightStepM,patchRadius:2,minCorrelation:.72,minPeakGap:.015,peakExclusionM:Math.max(heightStepM*3,2),recoverMissing:true,maxWork:250_000_000});
const refined=refineTerrainSurface(result.elevationMap,{outlierM:Math.max(2,resolutionM*4),fillRadius:1});
const vals=Array.from(refined.grid.values).filter(Number.isFinite).sort((a,b)=>a-b);
const [gx,gy]=pixelToWorld(grid.transform,grid.width/2,grid.height/2),[lon,lat]=gridCrsToLonLat(gx,gy,grid.crs);
const validation=reference?validateTerrainHeights(result.elevationMap,reference):null;
const report={sourceKind:"aerial",synthetic:!manifestPath,source:description,model:result.model,verticalDatum:result.verticalDatum,center:{longitudeDeg:lon,latitudeDeg:lat},resolutionM,validPixels:result.validPixels,totalPixels:result.totalPixels,coverage:result.validPixels/result.totalPixels,filteredCoverage:vals.length/result.totalPixels,rejected:refined.rejected,interpolated:refined.filled,recoveredPixels:result.recoveredPixels,initialMatches:result.validPixels-result.recoveredPixels,heightRangeM:vals.length?[vals[0],vals.at(-1)]:null,validation,elapsedMs:Date.now()-started,accuracy:reference?"synthetic validation only":"not independently validated"};
await writeFile(join(out,"report.json"),JSON.stringify(report,null,2));
await writeFile(join(out,"point-cloud.ply"),terrainPointCloudPly(result));
const csv=["lon,lat,raw_height_m,refined_height_m,confidence,quality_flag,match_pass"];
for(let i=0;i<result.totalPixels;i++){const [x,y]=pixelToWorld(grid.transform,i%grid.width+.5,Math.floor(i/grid.width)+.5),[lon,lat]=gridCrsToLonLat(x,y,grid.crs);csv.push([lon,lat,...[result.elevationMap.values[i],refined.grid.values[i],result.confidenceMap.values[i]].map(v=>Number.isFinite(v)?v:""),refined.flags[i],result.matchPass[i]].join(","));}
await writeFile(join(out,"heights.csv"),csv.join("\n")+"\n");
await writeRealTerrainViewer(out,{result,refined,report});
console.log(JSON.stringify(report,null,2));console.log("Open "+join(out,"terrain.html"));
if(report.coverage<.3||(validation&&(validation.rmseM===null||validation.rmseM>3||report.coverage<.65)))throw Error("Aerial reconstruction quality gate failed");
