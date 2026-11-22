/** Real Prague streamed 3D: starts immediately, downloads each requested
 * DSM/orthophoto tile only when the camera needs it, caches genuine data on disk.
 * No global all-city DEM/texture or synthetic imagery is allocated.
 */
import {createServer} from "node:http";
import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {deflateSync} from "node:zlib";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {OpenLaunch} from "../dist/index.js";
import {bbox} from "../dist/geo/types.js";
import {tileSpec,tileOriginOffset,pragueStreamManifest} from "./terrain-prague-stream-grid.mjs";
import {buildSeamMesh,TERRAIN_SEAM_VERSION} from "./terrain-prague-stream-seams.mjs";
import {fetchOsmFootprints,fetchGroundDmr,buildBuildings,BUILDING_LAYER_VERSION}
  from "./terrain-prague-buildings.mjs";
import {SENTINEL_TERRAIN_OVERLAY_VERSION,validateObservationDates}
  from "../dist/terrain/sentinel-overlay.js";
import {SENTINEL_NDVI_CHANGE_VERSION} from "../dist/terrain/sentinel-change.js";
import {SENTINEL_NDVI_TREND_VERSION,SENTINEL_TREND_MAX_SCENES}
  from "../dist/terrain/sentinel-trend.js";
import {SENTINEL_SEASONAL_COMPOSITE_VERSION} from "../dist/terrain/sentinel-seasonal.js";
import {SentinelMultiYearRegionAccumulator} from "../dist/terrain/sentinel-region.js";
import {SENTINEL_MULTIYEAR_VERSION} from "../dist/terrain/sentinel-multiyear.js";

const args=process.argv.slice(2);
const getArg=(name,def)=>{const i=args.indexOf("--"+name);return i<0?def:args[i+1];};
const port=Number(getArg("port","8765"));
if(!Number.isInteger(port)||port<0||port>65535)throw Error("--port must be 0..65535");
const cacheRoot=resolve(getArg("cache","test-results/terrain-prague-stream-cache"));
const offline=args.includes("--offline");
await mkdir(cacheRoot,{recursive:true});
const viewport=await readFile(new URL("./terrain-prague-stream-viewer.html",import.meta.url),"utf8");
const visibilityScript=await readFile(new URL("./terrain-prague-stream-visibility.js",import.meta.url),"utf8");
const inspectionScript=await readFile(new URL("./terrain-prague-stream-inspect.js",import.meta.url),"utf8");
const sdk=new OpenLaunch();
const buildingTasks=new Map();
const observationCatalog=new Map(),observationTasks=new Map();
const changeTasks=new Map(),trendTasks=new Map(),seasonalTasks=new Map(),multiYearTasks=new Map();
const MAX_OBSERVATION_JOBS=2;
const OBS_SCENE_ID=/^[A-Za-z0-9_-]{5,120}$/;
const tasks=new Map();
let active=0;const queued=[];
const MAX_SIMULTANEOUS=2,MAX_QUEUE=12;
async function limited(fn){
  if(active>=MAX_SIMULTANEOUS){
    if(queued.length>=MAX_QUEUE)throw Error("Terrain tile queue is full; move camera slowly");
    await new Promise(done=>queued.push(done));
  }
  active++;
  try{return await fn();}finally{active--;queued.shift()?.();}
}
const crcTable=Uint32Array.from({length:256},(_,i)=>{
  let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
function chunk(type,data){
  const out=Buffer.alloc(data.length+12);
  out.writeUInt32BE(data.length,0);out.write(type,4,4,"ascii");data.copy(out,8);
  let crc=0xffffffff;
  for(const v of out.subarray(4,8+data.length))crc=crcTable[(crc^v)&255]^(crc>>>8);
  out.writeUInt32BE((crc^0xffffffff)>>>0,8+data.length);
  return out;
}
function rgbaPng(tex){
  const {width,height,rgba}=tex;
  if(width<1||height<1||width>1024||height>1024||rgba.length!==width*height*4)
    throw Error("Invalid genuine ortho pixels");
  const raw=Buffer.alloc(height*(1+width*4));
  for(let row=0;row<height;row++){
    const at=row*(width*4+1);
    raw[at]=0;raw.set(rgba.subarray(row*width*4,(row+1)*width*4),at+1);
  }
  const hdr=Buffer.alloc(13);
  hdr.writeUInt32BE(width,0);hdr.writeUInt32BE(height,4);hdr[8]=8;hdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR",hdr),chunk("IDAT",deflateSync(raw,{level:6})),
    chunk("IEND",Buffer.alloc(0))]);
}
async function storedPair(spec){
  const path=join(cacheRoot,"v"+TERRAIN_SEAM_VERSION+"-"+spec.key);
  try{
    const [json,png]=await Promise.all([readFile(path+".json"),readFile(path+".png")]);
    const data=JSON.parse(json.toString("utf8"));
    if(data.status==="real-data"&&data.key===spec.key&&png.length>100)
      return {json,png};
  }catch{}
  return null;
}
async function generate(spec){
  const cached=await storedPair(spec);
  if(cached)return cached;
  if(offline){
    const error=new Error("This tile has not yet been downloaded; offline mode forbids source requests.");
    error.code="TILE_NOT_CACHED";
    throw error;
  }
  console.log("Fetching measured ČÚZK tile "+spec.key+" ("+
    spec.demResolutionM+"m DEM / "+spec.textureResolutionM+"m ortho)");
  const area=bbox(spec.west,spec.south,spec.east,spec.north);
  const map=await sdk.terrain.load({
    area,elevationProvider:"cuzk-dmpok",
    imageryProvider:"cuzk-ortofoto",
    resolutionM:spec.demResolutionM,
    orthophotoResolutionM:spec.textureResolutionM
  });
  const {mesh,elevation,imageryTexture,metadata}=map;
  if(mesh.validVertices<4||mesh.triangles.length<3||
     mesh.positions.length/3>50000||mesh.positions.length/3>=65536)
    throw Error("Measured ČÚZK tile has invalid or excessive geometry");
  if(map.kind!=="orthophoto-on-cuzk-dmpok"||metadata.verticalDatum!=="Bpv (Baltic 1957)")
    throw Error("Tile source provenance or height datum mismatch");
  // Keep the actual SDK grid, including NoData, no fabricated geometry.
  const originMeters=tileOriginOffset(elevation);
  const render=buildSeamMesh(mesh,elevation.width,elevation.height,
    [spec.west,spec.south,spec.east,spec.north],originMeters);
  const positions=render.positions,faceArray=render.triangles;
  const document={
    status:"real-data",key:spec.key,z:spec.z,x:spec.x,y:spec.y,
    bbox:[spec.west,spec.south,spec.east,spec.north],
    width:elevation.width,height:elevation.height,
    validVertices:mesh.validVertices,triangles:faceArray.length/3,
    renderVertices:render.renderVertices,measuredTriangles:render.measuredTriangles,
    seam:{version:TERRAIN_SEAM_VERSION,apronTriangles:render.apronTriangles,
      skirtTriangles:render.skirtTriangles,skirtDepthM:render.skirtDepthM,
      maxExtensionM:render.maxExtensionM,provenance:render.provenance},
    originMeters,
    positionsF32LE:Buffer.from(positions.buffer,positions.byteOffset,positions.byteLength).toString("base64"),
    uvsF32LE:Buffer.from(render.uvs.buffer,render.uvs.byteOffset,render.uvs.byteLength).toString("base64"),
    trianglesU16LE:Buffer.from(faceArray.buffer,faceArray.byteOffset,faceArray.byteLength).toString("base64"),
    texture:{width:imageryTexture.width,height:imageryTexture.height,
      validPixels:imageryTexture.validPixels,resolutionM:imageryTexture.groundResolutionM,
      file:"/api/tiles/"+spec.z+"/"+spec.x+"/"+spec.y+".png"},
    verticalDatum:metadata.verticalDatum,source:metadata.demSource,
    imagerySource:metadata.imagerySource,
    attribution:[metadata.demAttribution,metadata.imageryAttribution],
    heightMinM:metadata.heightMinM,heightMaxM:metadata.heightMaxM
  };
  const json=Buffer.from(JSON.stringify(document));
  const png=rgbaPng(imageryTexture);
  const path=join(cacheRoot,"v"+TERRAIN_SEAM_VERSION+"-"+spec.key);
  // Stage temporary files and publish the metadata last.
  const nonce=process.pid+"-"+Date.now();
  await writeFile(path+"."+nonce+".png",png);
  await rename(path+"."+nonce+".png",path+".png");
  await writeFile(path+"."+nonce+".json",json);
  await rename(path+"."+nonce+".json",path+".json");
  console.log("Cached "+spec.key+": "+mesh.validVertices+" measured vertices + "+
    (render.renderVertices-mesh.validVertices)+" seam/NoData positions, "+
    imageryTexture.validPixels+" actual Ortofoto pixels");
  return {json,png};
}
function obtain(spec){
  const key=spec.key;
  if(tasks.has(key))return tasks.get(key);
  const promise=limited(()=>generate(spec)).finally(()=>tasks.delete(key));
  tasks.set(key,promise);
  return promise;
}
async function generateBuildings(spec){
 const file=join(cacheRoot,"buildings-v"+BUILDING_LAYER_VERSION+"-"+spec.key+".json");
 try{
   const cached=JSON.parse(await readFile(file,"utf8"));
   if(cached.status==="real-source-buildings"&&cached.key===spec.key)
     return Buffer.from(JSON.stringify(cached));
 }catch{}
 if(offline){
   const error=Error("Building tile has not been downloaded; offline mode forbids requests.");
   error.code="TILE_NOT_CACHED";throw error;
 }
 // Source DSM raster must be genuine and georeferenced, not imagined building heights.
 const pair=await obtain(spec);
 const data=JSON.parse(pair.json.toString("utf8"));
 if(data.status!=="real-data"||data.verticalDatum!=="Bpv (Baltic 1957)"||
    data.seam?.version!==2)throw Error("Building roof DSM source failed provenance check");
 // Buffer.byteOffset must be respected when creating typed arrays.
 const raw=Buffer.from(data.positionsF32LE,"base64");
 const measured=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
 const [elements,ground]=await Promise.all([
   fetchOsmFootprints(spec),fetchGroundDmr(spec)
 ]);
 const result=buildBuildings(spec,elements,ground,{
   positions:measured,width:data.width,height:data.height,
   originMeters:data.originMeters,verticalDatum:data.verticalDatum
 });
 const bytes=Buffer.from(JSON.stringify(result));
 const temporary=file+"."+process.pid+"-"+Date.now()+".tmp";
 await writeFile(temporary,bytes);await rename(temporary,file);
 console.log("Real building layer "+spec.key+": "+result.buildings+" (OSM height "+
   result.heightMethods.explicitOsmHeight+", DMP/DMR derived "+
   result.heightMethods.estimatedDsmMinusDmr+")");
 return bytes;
}
function obtainBuildings(spec){
 if(buildingTasks.has(spec.key))return buildingTasks.get(spec.key);
 const promise=generateBuildings(spec).finally(()=>buildingTasks.delete(spec.key));
 buildingTasks.set(spec.key,promise);return promise;
}
/** Cached historical STAC metadata, no user-controlled remote COG URLs. */
async function observationScenes(spec,from,to,maxCloud){
 validateObservationDates(from,to);
 if(!Number.isFinite(maxCloud)||maxCloud<0||maxCloud>100)
   throw RangeError("cloud must be 0..100 percent");
 const label="observations-scenes-v"+SENTINEL_TERRAIN_OVERLAY_VERSION+"-"+
   spec.key+"-"+from+"-"+to+"-"+maxCloud+".json";
 const file=join(cacheRoot,label);
 let raw=null;
 try{
   raw=JSON.parse(await readFile(file,"utf8"));
   if(!Array.isArray(raw.items)||!Array.isArray(raw.scenes))raw=null;
 }catch{}
 if(!raw){
   if(offline){
     const e=Error("No real Sentinel catalog is cached for this date range.");
     e.code="TILE_NOT_CACHED";throw e;
   }
   const result=await sdk.terrain.discoverObservations({
     area:bbox(spec.west,spec.south,spec.east,spec.north),
     from,to,maxCloudPercent:maxCloud,limit:40
   });
   raw={status:"real-sentinel-catalog",key:spec.key,items:result.items,
     scenes:result.scenes,from,to,maxCloud,source:"Element84 Earth Search STAC v1",
     retrievedAt:new Date().toISOString()};
   const temp=file+"."+process.pid+"-"+Date.now()+".tmp";
   await writeFile(temp,JSON.stringify(raw));await rename(temp,file);
 }
 for(const item of raw.items){
   if(!OBS_SCENE_ID.test(item.id))continue;
   observationCatalog.set(item.id,item);
 }
 return {status:"real-sentinel-catalog",key:spec.key,
   from,to,maxCloud,retrievedAt:raw.retrievedAt,
   source:raw.source,scenes:raw.scenes,
   note:"Scene-wide cloud fraction is not local cloud-free proof; SCL pixel QA is applied during reading."};
}
function observationPath(spec,sceneId){
 if(!OBS_SCENE_ID.test(sceneId))throw RangeError("Invalid Sentinel scene ID");
 return join(cacheRoot,"observations-v"+SENTINEL_TERRAIN_OVERLAY_VERSION+"-"+
   sceneId+"-"+spec.key);
}
async function storedObservation(spec,sceneId){
 const path=observationPath(spec,sceneId);
 try{
   const [json,rgb,ndvi]=await Promise.all([
     readFile(path+".json"),readFile(path+".rgb.png"),readFile(path+".ndvi.png")]);
   const doc=JSON.parse(json.toString("utf8"));
   if(doc.status==="real-sentinel2-observation"&&doc.sceneId===sceneId&&
     doc.key===spec.key&&doc.version===SENTINEL_TERRAIN_OVERLAY_VERSION&&
     doc.qa?.sclMask===true&&doc.grid?.crs==="EPSG:3857"&&
     typeof doc.ndviF32LE==="string"&&
     Buffer.from(doc.ndviF32LE,"base64").byteLength===doc.width*doc.height*4&&
     rgb.length>100&&ndvi.length>100)
     return {json,rgb,ndvi};
 }catch{}
 return null;
}
async function generateObservation(spec,sceneId){
 const cached=await storedObservation(spec,sceneId);
 if(cached)return cached;
 if(offline){
   const e=Error("Scene overlay is not yet cached; offline mode forbids remote COG requests.");
   e.code="TILE_NOT_CACHED";throw e;
 }
 const scene=observationCatalog.get(sceneId);
 if(!scene){
   const e=Error("Scene metadata not selected. Search for a dated Sentinel-2 scene first.");
   e.code="TILE_NOT_CACHED";throw e;
 }
 console.log("Loading real Sentinel-2 RGB+NDVI "+sceneId+" on Prague tile "+spec.key);
 const product=await sdk.terrain.observeSentinel2({
   area:bbox(spec.west,spec.south,spec.east,spec.north),
   scene,resolutionM:10
 });
 if(product.status!=="real-sentinel2-observation"||
    product.sceneId!==sceneId||product.qa.sclMask!==true||
    product.statistics.validPixels<4)
   throw Error("Sentinel-2 raster failed calibrated single-scene provenance checks");
 const doc={status:product.status,version:product.version,
   key:spec.key,sceneId:product.sceneId,acquiredAt:product.acquiredAt,
   cloudPercent:product.cloudPercent,source:product.source,
   collection:product.collection,area:product.area,
   width:product.width,height:product.height,
   groundSamplingM:product.groundSamplingM,grid:product.grid,
   ndviF32LE:Buffer.from(product.ndviValues.buffer,
     product.ndviValues.byteOffset,product.ndviValues.byteLength).toString("base64"),
   statistics:product.statistics,qa:product.qa,caveats:product.caveats,
   imageryOnly:true,terrainElevationUnchanged:true,
   images:{
     rgb:"/api/observations/0/"+spec.x+"/"+spec.y+"/"+sceneId+".rgb.png",
     ndvi:"/api/observations/0/"+spec.x+"/"+spec.y+"/"+sceneId+".ndvi.png"
   }};
 const json=Buffer.from(JSON.stringify(doc)),rgb=rgbaPng({
   width:product.width,height:product.height,rgba:product.rgbRgba
 }),ndvi=rgbaPng({
   width:product.width,height:product.height,rgba:product.ndviRgba
 });
 const path=observationPath(spec,sceneId),nonce="."+process.pid+"-"+Date.now();
 await writeFile(path+nonce+".rgb.png",rgb);
 await writeFile(path+nonce+".ndvi.png",ndvi);
 await rename(path+nonce+".rgb.png",path+".rgb.png");
 await rename(path+nonce+".ndvi.png",path+".ndvi.png");
 await writeFile(path+nonce+".json",json);
 await rename(path+nonce+".json",path+".json");
 console.log("Cached Sentinel scene "+sceneId+" / "+spec.key+
   " "+doc.statistics.validPixels+" SCL-accepted pixels, NDVI avg "+
   doc.statistics.ndviMean);
 return {json,rgb,ndvi};
}
function obtainObservation(spec,sceneId){
 const key=spec.key+"/"+sceneId;
 if(observationTasks.has(key))return observationTasks.get(key);
 if(observationTasks.size>=MAX_OBSERVATION_JOBS){
   const e=Error("Too many satellite scenes in progress; retry once current analysis finishes.");
   e.code="OBSERVATION_BUSY";throw e;
 }
 const task=generateObservation(spec,sceneId).finally(()=>observationTasks.delete(key));
 observationTasks.set(key,task);return task;
}

/** Cached pairwise change requires TWO real source observations, both
 * sharing an identical 10m EPSG:3857 grid and valid SCL masks. */
function changePath(spec,beforeId,afterId){
 if(!OBS_SCENE_ID.test(beforeId)||!OBS_SCENE_ID.test(afterId)||beforeId===afterId)
   throw RangeError("Select two different valid Sentinel scene IDs");
 return join(cacheRoot,"changes-v"+SENTINEL_NDVI_CHANGE_VERSION+"-"+
   beforeId+"--"+afterId+"-"+spec.key);
}
async function generateChange(spec,beforeId,afterId){
 const target=changePath(spec,beforeId,afterId);
 try{
   const [json,png]=await Promise.all([readFile(target+".json"),readFile(target+".png")]);
   const d=JSON.parse(json.toString("utf8"));
   if(d.status==="real-sentinel-ndvi-comparison"&&d.version===SENTINEL_NDVI_CHANGE_VERSION&&
      d.key===spec.key&&d.before?.sceneId===beforeId&&d.after?.sceneId===afterId&&
      d.qa?.bothSclMasked===true&&d.qa?.sameGrid===true&&png.length>100)
     return {json,png};
 }catch{}
 const [baseline,followup]=await Promise.all([
   obtainObservation(spec,beforeId),obtainObservation(spec,afterId)
 ]);
 function measuredDocument(data,expected){
   const d=JSON.parse(data.json.toString("utf8"));
   if(d.status!=="real-sentinel2-observation"||d.version!==SENTINEL_TERRAIN_OVERLAY_VERSION||
      d.sceneId!==expected||d.key!==spec.key||d.grid?.crs!=="EPSG:3857"||
      d.terrainElevationUnchanged!==true||d.qa?.sclMask!==true||
      !OBS_SCENE_ID.test(d.sceneId)||typeof d.ndviF32LE!=="string")
     throw Error("Source observation has no numerical, calibrated NDVI proof");
   const raw=Buffer.from(d.ndviF32LE,"base64");
   if(raw.byteLength!==d.width*d.height*4||raw.byteLength>200000)
     throw Error("Source NDVI buffer does not match its true georeferenced grid");
   const values=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
   return {...d,ndviValues:values};
 }
 const change=sdk.terrain.compareSentinelNdvi(
   measuredDocument(baseline,beforeId),measuredDocument(followup,afterId),
   {thresholdNdvi:.15,minOverlapPixels:16}
 );
 const result={status:change.status,version:change.version,key:spec.key,
   before:change.before,after:change.after,source:change.source,
   width:change.width,height:change.height,area:change.area,grid:change.grid,
   groundSamplingM:change.groundSamplingM,statistics:change.statistics,
   qa:change.qa,caveats:change.caveats,
   deltaF32LE:Buffer.from(change.deltaValues.buffer,
     change.deltaValues.byteOffset,change.deltaValues.byteLength).toString("base64"),
   image:"/api/observations/compare/0/"+spec.x+"/"+spec.y+"/"+beforeId+"/"+afterId+".png",
   terrainElevationUnchanged:true};
 const json=Buffer.from(JSON.stringify(result)),
   png=rgbaPng({width:change.width,height:change.height,rgba:change.deltaRgba});
 const nonce="."+process.pid+"-"+Date.now();
 await writeFile(target+nonce+".png",png);
 await rename(target+nonce+".png",target+".png");
 await writeFile(target+nonce+".json",json);
 await rename(target+nonce+".json",target+".json");
 console.log("PASS real paired ΔNDVI "+spec.key+": "+
   beforeId+" -> "+afterId+"; "+change.statistics.overlapPixels+
   " clear pixels in both scenes; mean "+change.statistics.meanDeltaNdvi);
 return {json,png};
}
function obtainChange(spec,beforeId,afterId){
 const key=spec.key+"/"+beforeId+"/"+afterId;
 if(changeTasks.has(key))return changeTasks.get(key);
 if(changeTasks.size>=2){
   const e=Error("Two NDVI comparisons are already running");
   e.code="OBSERVATION_BUSY";throw e;
 }
 const p=generateChange(spec,beforeId,afterId).finally(()=>changeTasks.delete(key));
 changeTasks.set(key,p);return p;
}
/** A single user-selected time series is an explicit 3..6-source operation.
 * No arbitrary provider URL is accepted; observation metadata comes from
 * the server-side STAC-qualified / cached scene catalog only.
 */
function trendPath(spec,sceneIds){
 if(!Array.isArray(sceneIds)||sceneIds.length<3||
    sceneIds.length>SENTINEL_TREND_MAX_SCENES||
    new Set(sceneIds).size!==sceneIds.length||
    sceneIds.some(id=>!OBS_SCENE_ID.test(id)))
   throw RangeError("Trend requires 3..6 different qualified Sentinel scene IDs");
 const digest=createHash("sha256").update(sceneIds.join("\n")).digest("hex").slice(0,24);
 return join(cacheRoot,"trends-v"+SENTINEL_NDVI_TREND_VERSION+"-"+
   spec.key+"-"+digest);
}
async function generateTrend(spec,sceneIds){
 const path=trendPath(spec,sceneIds);
 try{
   const [json,png]=await Promise.all([readFile(path+".json"),readFile(path+".png")]);
   const doc=JSON.parse(json.toString("utf8"));
   if(doc.status==="real-sentinel-ndvi-time-series"&&
      doc.version===SENTINEL_NDVI_TREND_VERSION&&doc.key===spec.key&&
      JSON.stringify(doc.requestedSceneIds)===JSON.stringify(sceneIds)&&
      doc.qa?.allSclMasked===true&&doc.qa?.fixedCommonPixelPopulation===true&&
      Buffer.from(doc.slopeF32LE??"","base64").byteLength===
        doc.width*doc.height*4&&png.byteLength>100)
     return {json,png};
 }catch{}
 const measures=[];
 // Bounded sequential COG access: no storm of >2 simultaneous raster
 // jobs while the flight viewer streams real DEM tiles separately.
 for(const sceneId of sceneIds){
   const product=await obtainObservation(spec,sceneId);
   const d=JSON.parse(product.json.toString("utf8"));
   if(d.status!=="real-sentinel2-observation"||d.version!==SENTINEL_TERRAIN_OVERLAY_VERSION||
      d.key!==spec.key||d.sceneId!==sceneId||
      d.grid?.crs!=="EPSG:3857"||d.qa?.sclMask!==true||
      d.terrainElevationUnchanged!==true||typeof d.ndviF32LE!=="string"||
      !Number.isInteger(d.width)||!Number.isInteger(d.height)||
      d.width*d.height>50000)
     throw Error("Temporal source is not a verified SCL-masked Sentinel L2A observation");
   const bytes=Buffer.from(d.ndviF32LE,"base64");
   if(bytes.byteLength!==d.width*d.height*4)
     throw Error("Temporal source numerical NDVI is missing/invalid");
   const values=new Float32Array(bytes.buffer.slice(bytes.byteOffset,
     bytes.byteOffset+bytes.byteLength));
   measures.push({...d,ndviValues:values});
 }
 const analysis=sdk.terrain.analyzeSentinelNdviTrend(measures,{
   thresholdNdviPer30Days:.12,minCommonPixels:16
 });
 const result={status:analysis.status,version:analysis.version,key:spec.key,
   requestedSceneIds:sceneIds,scenes:analysis.scenes,
   source:analysis.source,area:analysis.area,grid:analysis.grid,
   width:analysis.width,height:analysis.height,
   groundSamplingM:analysis.groundSamplingM,
   statistics:analysis.statistics,qa:analysis.qa,caveats:analysis.caveats,
   slopeF32LE:Buffer.from(analysis.slopePer30Days.buffer,
     analysis.slopePer30Days.byteOffset,
     analysis.slopePer30Days.byteLength).toString("base64"),
   image:"/api/observations/trend/0/"+spec.x+"/"+spec.y+"/"+
     sceneIds.join(",")+".png",
   terrainElevationUnchanged:true};
 const json=Buffer.from(JSON.stringify(result));
 const png=rgbaPng({width:analysis.width,height:analysis.height,rgba:analysis.trendRgba});
 const temporary=path+"."+process.pid+"-"+Date.now();
 await writeFile(temporary+".png",png);
 await rename(temporary+".png",path+".png");
 await writeFile(temporary+".json",json);
 await rename(temporary+".json",path+".json");
 console.log("PASS genuine "+sceneIds.length+"-date Sentinel trend "+
   spec.key+" with "+analysis.statistics.commonValidPixels+
   " pixels valid in every scene; Theil-Sen NDVI/30d "+
   analysis.statistics.meanSlopePer30Days);
 return {json,png};
}
function obtainTrend(spec,sceneIds){
 const key=spec.key+"/"+sceneIds.join(",");
 if(trendTasks.has(key))return trendTasks.get(key);
 if(trendTasks.size>=1){
   const error=Error("One time-series computation is already running");
   error.code="OBSERVATION_BUSY";throw error;
 }
 const promise=generateTrend(spec,sceneIds).finally(()=>trendTasks.delete(key));
 trendTasks.set(key,promise);return promise;
}

/** Annual comparability: two independently acquired Sentinel scenes in
 * the same calendar month of each distinct year. Only true scene-wide
 * cloud metadata may rank candidates; pixel SCL is assessed afterward.
 */
function seasonalArguments(beforeYear,afterYear,month,cloud){
 if(!Number.isInteger(beforeYear)||!Number.isInteger(afterYear)||
    beforeYear<2017||afterYear>2100||beforeYear>=afterYear||
    afterYear-beforeYear>15||!Number.isInteger(month)||month<1||month>12||
    !Number.isFinite(cloud)||cloud<0||cloud>100)
   throw RangeError("Seasonal query requires two ascending years, one month and cloud 0..100");
}
function seasonalDates(year,month){
 const two=String(month).padStart(2,"0");
 const end=new Date(Date.UTC(year,month,0)).getUTCDate();
 return [year+"-"+two+"-01",year+"-"+two+"-"+end];
}
function selectSeasonalSources(scenes,year,month){
 const candidates=scenes.filter(s=>
   OBS_SCENE_ID.test(s.id)&&typeof s.acquiredAt==="string"&&
   new Date(s.acquiredAt).getUTCFullYear()===year&&
   new Date(s.acquiredAt).getUTCMonth()+1===month
 ).sort((a,b)=>{
   const diff=(a.cloudPercent??101)-(b.cloudPercent??101);
   return diff||Math.abs(new Date(a.acquiredAt).getUTCDate()-16)-
     Math.abs(new Date(b.acquiredAt).getUTCDate()-16);
 });
 const selected=[];
 for(const s of candidates){
   const day=Date.parse(s.acquiredAt);
   if(!Number.isFinite(day)||selected.some(old=>
     Math.abs(Date.parse(old.acquiredAt)-day)<4*86400000))continue;
   selected.push(s);
   if(selected.length===2)break;
 }
 return selected.sort((a,b)=>a.acquiredAt.localeCompare(b.acquiredAt));
}
async function seasonalSceneSelection(spec,beforeYear,afterYear,month,cloud){
 seasonalArguments(beforeYear,afterYear,month,cloud);
 const catalogs=[];
 for(const year of [beforeYear,afterYear]){
   const [from,to]=seasonalDates(year,month);
   const data=await observationScenes(spec,from,to,cloud);
   const picked=selectSeasonalSources(data.scenes,year,month);
   if(picked.length<2){
     const error=Error("Fewer than two genuine, distinct Sentinel-2 acquisitions "+
       "in "+year+"-"+String(month).padStart(2,"0")+
       ". Try a different month or scene-wide cloud limit.");
     error.code="OBSERVATION_INSUFFICIENT";throw error;
   }
   catalogs.push({year,scenes:picked});
 }
 return {status:"real-sentinel-seasonal-catalog",key:spec.key,
   month,cloud,maxScenesPerYear:2,before:catalogs[0],after:catalogs[1],
   note:"Scene-wide cloud score is only for discovery ranking; every source pixel uses independent SCL QA."};
}
function seasonalCachePath(spec,meta){
 const selected=[...meta.before.scenes,...meta.after.scenes].map(s=>s.id);
 const digest=createHash("sha256").update(JSON.stringify({
   key:spec.key,beforeYear:meta.before.year,afterYear:meta.after.year,
   month:meta.month,cloud:meta.cloud,selected
 })).digest("hex").slice(0,24);
 return join(cacheRoot,"seasonal-v"+SENTINEL_SEASONAL_COMPOSITE_VERSION+"-"+
   spec.key+"-"+digest);
}
async function generateSeasonal(spec,beforeYear,afterYear,month,cloud){
 const meta=await seasonalSceneSelection(spec,beforeYear,afterYear,month,cloud);
 const target=seasonalCachePath(spec,meta);
 try{
   const [json,png]=await Promise.all([readFile(target+".json"),readFile(target+".png")]);
   const d=JSON.parse(json.toString("utf8"));
   if(d.status==="real-sentinel-interannual-ndvi"&&
      d.version===SENTINEL_SEASONAL_COMPOSITE_VERSION&&d.key===spec.key&&
      d.before?.year===beforeYear&&d.after?.year===afterYear&&
      d.before?.month===month&&d.qa?.pixelSclMasked===true&&
      d.qa?.medianPerYear===true&&
      d.statistics?.overlapPixels>=16&&
      Buffer.from(d.deltaF32LE??"","base64").byteLength===d.width*d.height*4&&
      Buffer.from(d.beforeCountB64??"","base64").byteLength===d.width*d.height&&
      Buffer.from(d.afterCountB64??"","base64").byteLength===d.width*d.height&&
      png.byteLength>100)return {json,png};
 }catch{}
 const values=[];
 for(const group of [meta.before,meta.after]){
   const data=[];
   for(const s of group.scenes){
     const source=await obtainObservation(spec,s.id);
     const observation=JSON.parse(source.json.toString("utf8"));
     if(observation.sceneId!==s.id||observation.key!==spec.key||
        observation.status!=="real-sentinel2-observation"||
        observation.version!==SENTINEL_TERRAIN_OVERLAY_VERSION||
        observation.qa?.sclMask!==true||
        observation.grid?.crs!=="EPSG:3857"||
        observation.terrainElevationUnchanged!==true||
        typeof observation.ndviF32LE!=="string"||
        !Number.isInteger(observation.width)||!Number.isInteger(observation.height)||
        observation.width*observation.height>50000)
       throw Error("No source-qualified numerical same-season NDVI in selected observation");
     const raw=Buffer.from(observation.ndviF32LE,"base64");
     if(raw.byteLength!==observation.width*observation.height*4)
       throw Error("Observed annual source raster contains invalid numeric samples");
     data.push({...observation,ndviValues:new Float32Array(
       raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength))});
   }
   values.push(data);
 }
 const product=sdk.terrain.compareSentinelSeasons(values[0],values[1],{
   thresholdNdvi:.15,minOverlapPixels:16,minValidPerYear:1
 });
 const result={status:product.status,version:product.version,key:spec.key,
   before:product.before,after:product.after,source:product.source,
   area:product.area,grid:product.grid,
   width:product.width,height:product.height,groundSamplingM:product.groundSamplingM,
   statistics:product.statistics,qa:product.qa,caveats:product.caveats,
   deltaF32LE:Buffer.from(product.deltaValues.buffer,product.deltaValues.byteOffset,
     product.deltaValues.byteLength).toString("base64"),
   beforeCountB64:Buffer.from(product.beforeValidCount).toString("base64"),
   afterCountB64:Buffer.from(product.afterValidCount).toString("base64"),
   image:"/api/observations/seasonal/0/"+spec.x+"/"+spec.y+"/"+
     beforeYear+"/"+afterYear+"/"+month+".png?cloud="+cloud,
   terrainElevationUnchanged:true};
 const json=Buffer.from(JSON.stringify(result));
 const png=rgbaPng({width:product.width,height:product.height,rgba:product.deltaRgba});
 const nonce="."+process.pid+"-"+Date.now();
 await writeFile(target+nonce+".png",png);
 await rename(target+nonce+".png",target+".png");
 await writeFile(target+nonce+".json",json);
 await rename(target+nonce+".json",target+".json");
 console.log("PASS genuine same-season "+beforeYear+" -> "+afterYear+
   " for "+spec.key+": "+product.statistics.overlapPixels+" paired pixels, "+
   product.statistics.robustTwoPerYearPixels+" two-per-year robust pixels, "+
   "ΔNDVI "+product.statistics.meanDeltaNdvi.toFixed(5));
 return {json,png};
}
function obtainSeasonal(spec,beforeYear,afterYear,month,cloud){
 seasonalArguments(beforeYear,afterYear,month,cloud);
 const key=spec.key+"/"+beforeYear+"/"+afterYear+"/"+month+"/"+cloud;
 if(seasonalTasks.has(key))return seasonalTasks.get(key);
 if(seasonalTasks.size>=1){
   const e=Error("Another real Sentinel yearly comparison is in progress");
   e.code="OBSERVATION_BUSY";throw e;
 }
 const promise=generateSeasonal(spec,beforeYear,afterYear,month,cloud)
   .finally(()=>seasonalTasks.delete(key));
 seasonalTasks.set(key,promise);
 return promise;
}

/** Cross-year seasonal analysis never obtains scenes from client URLs.
 * STAC source metadata for each of 3–5 years is discovered server-side.
 */
function multiyearArguments(from,to,month,cloud){
 if(!Number.isInteger(from)||!Number.isInteger(to)||
   from<2017||to>2100||to-from<2||to-from>4||
   !Number.isInteger(month)||month<1||month>12||
   !Number.isFinite(cloud)||cloud<0||cloud>100)
   throw RangeError("Multi-year Sentinel requires 3..5 consecutive years, one month and scene cloud 0..100");
}
async function multiyearSceneSelection(spec,from,to,month,cloud){
 multiyearArguments(from,to,month,cloud);
 const seasons=[];
 for(let year=from;year<=to;year++){
   const [start,end]=seasonalDates(year,month);
   const catalog=await observationScenes(spec,start,end,cloud);
   const chosen=selectSeasonalSources(catalog.scenes,year,month);
   if(chosen.length!==2){
     const error=Error("Unable to verify two different real Sentinel L2A acquisitions in "+
       year+"-"+String(month).padStart(2,"0")+
       ". Change the season or cloud limit; no missing year will be guessed.");
     error.code="OBSERVATION_INSUFFICIENT";throw error;
   }
   seasons.push({year,scenes:chosen});
 }
 return {status:"real-sentinel-multiyear-catalog",key:spec.key,
   from,to,month,cloud,seasons,
   source:"Copernicus Sentinel-2 L2A via Element84 Earth Search STAC",
   note:"Per-year source scenes ranked by scene cloud percentage; only SCL pixel-level tests establish overlap."};
}
function multiyearCachePath(spec,catalog){
 const digest=createHash("sha256").update(JSON.stringify({
   key:spec.key,from:catalog.from,to:catalog.to,month:catalog.month,
   cloud:catalog.cloud,sourceIds:catalog.seasons.map(s=>s.scenes.map(o=>o.id))
 })).digest("hex").slice(0,24);
 return join(cacheRoot,"multiyear-v"+SENTINEL_MULTIYEAR_VERSION+"-"+
   spec.key+"-"+digest);
}
async function generateMultiyear(spec,from,to,month,cloud){
 const catalog=await multiyearSceneSelection(spec,from,to,month,cloud);
 const path=multiyearCachePath(spec,catalog);
 try{
   const [json,png]=await Promise.all([readFile(path+".json"),readFile(path+".png")]);
   const doc=JSON.parse(json.toString("utf8"));
   if(doc.status==="real-sentinel-multiyear-seasonal-trend"&&
      doc.version===SENTINEL_MULTIYEAR_VERSION&&doc.key===spec.key&&
      doc.statistics?.firstYear===from&&doc.statistics?.lastYear===to&&
      doc.month===month&&doc.qa?.fixedCommonPixelPopulation===true&&
      doc.qa?.leaveOneYearOutSensitivity===true&&
      Buffer.from(doc.slopeF32LE??"","base64").byteLength===doc.width*doc.height*4&&
      Buffer.from(doc.loF32LE??"","base64").byteLength===doc.width*doc.height*4&&
      Buffer.from(doc.hiF32LE??"","base64").byteLength===doc.width*doc.height*4&&
      Buffer.from(doc.robustB64??"","base64").byteLength===doc.width*doc.height&&
      png.byteLength>100)return {json,png};
 }catch{}
 const seasons=[];
 for(const sourceYear of catalog.seasons){
   const observations=[];
   for(const scene of sourceYear.scenes){
     const product=await obtainObservation(spec,scene.id);
     const doc=JSON.parse(product.json.toString("utf8"));
     if(doc.status!=="real-sentinel2-observation"||
        doc.version!==SENTINEL_TERRAIN_OVERLAY_VERSION||
        doc.sceneId!==scene.id||doc.acquiredAt!==scene.acquiredAt||
        doc.key!==spec.key||doc.qa?.sclMask!==true||
        doc.grid?.crs!=="EPSG:3857"||
        doc.terrainElevationUnchanged!==true||
        !Number.isInteger(doc.width)||!Number.isInteger(doc.height)||
        doc.width*doc.height>50000||typeof doc.ndviF32LE!=="string")
       throw Error("Multi-year source observation is missing real numeric calibrated NDVI / SCL provenance");
     const bytes=Buffer.from(doc.ndviF32LE,"base64");
     if(bytes.byteLength!==doc.width*doc.height*4)
       throw Error("Numeric annual NDVI raster has invalid actual source length");
     observations.push({...doc,ndviValues:new Float32Array(
       bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))});
   }
   seasons.push({year:sourceYear.year,observations});
 }
 const product=sdk.terrain.analyzeSentinelMultiYear(seasons,{
   thresholdNdviPerYear:.04,minCommonPixels:16,minValidPerYear:1
 });
 const buffer=floats=>Buffer.from(floats.buffer,
   floats.byteOffset,floats.byteLength).toString("base64");
 const report={
   status:product.status,version:product.version,key:spec.key,
   month:product.month,years:product.years,source:product.source,
   area:product.area,grid:product.grid,
   width:product.width,height:product.height,
   groundSamplingM:product.groundSamplingM,
   statistics:product.statistics,qa:product.qa,caveats:product.caveats,
   slopeF32LE:buffer(product.slopePerYear),
   loF32LE:buffer(product.sensitivityLow),
   hiF32LE:buffer(product.sensitivityHigh),
   robustB64:Buffer.from(product.robustAllYears).toString("base64"),
   image:"/api/observations/multiyear/0/"+spec.x+"/"+spec.y+"/"+
     from+"/"+to+"/"+month+".png?cloud="+cloud,
   terrainElevationUnchanged:true
 };
 const json=Buffer.from(JSON.stringify(report)),
   png=rgbaPng({width:product.width,height:product.height,rgba:product.trendRgba});
 const nonce="."+process.pid+"-"+Date.now();
 await writeFile(path+nonce+".png",png);
 await rename(path+nonce+".png",path+".png");
 await writeFile(path+nonce+".json",json);
 await rename(path+nonce+".json",path+".json");
 console.log("PASS true "+product.statistics.yearCount+"-year seasonal Sentinel "+
   from+".."+to+": "+product.statistics.commonValidPixels+" common pixels, "+
   product.statistics.robustAllYearsPixels+" with 2 genuine sources per year, "+
   "Theil-Sen "+product.statistics.meanSlopeNdviPerYear.toFixed(5)+" NDVI/year");
 return {json,png};
}
function obtainMultiyear(spec,from,to,month,cloud){
 multiyearArguments(from,to,month,cloud);
 const key=spec.key+"/"+from+"/"+to+"/"+month+"/"+cloud;
 if(multiYearTasks.has(key))return multiYearTasks.get(key);
 if(multiYearTasks.size>=1){
   const e=Error("One multi-year source analysis already running");
   e.code="OBSERVATION_BUSY";throw e;
 }
 const promise=generateMultiyear(spec,from,to,month,cloud)
   .finally(()=>multiYearTasks.delete(key));
 multiYearTasks.set(key,promise);return promise;
}

/** Stage 16: bounded regional source processing. Only one large regional
 * job runs at once; every sequential tile can be released after summarizing.
 * NDJSON events carry honest coverage/no-data and terminal regional statistics.
 */
let regionalJobActive=false;
async function streamRegionalMultiyear(req,res,params){
 if(regionalJobActive){
   const err=Error("A regional source analysis is already running");
   err.code="OBSERVATION_BUSY";throw err;
 }
 const numeric=(name,def)=>Number(params.get(name)??def);
 const x=numeric("x",2),y=numeric("y",2),
   cols=numeric("cols",2),rows=numeric("rows",2),
   from=numeric("from",2023),to=numeric("to",2025),
   month=numeric("month",8),cloud=numeric("cloud",50);
 multiyearArguments(from,to,month,cloud);
 if(![x,y,cols,rows].every(Number.isInteger)||
   x<0||y<0||cols<1||rows<1||cols>4||rows>4||
   cols*rows>16||x+cols>6||y+rows>6)
   throw RangeError("Regional selection must be 1..4 by 1..4 inside the Prague overview grid");
 const specs=[];
 for(let iy=y;iy<y+rows;iy++)
   for(let ix=x;ix<x+cols;ix++)specs.push(tileSpec(0,ix,iy));
 const aggregate=new SentinelMultiYearRegionAccumulator(
   from,to,month,specs.map(t=>t.key));
 regionalJobActive=true;
 try{
   res.writeHead(200,{"Content-Type":"application/x-ndjson; charset=utf-8",
     "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
     "Cross-Origin-Resource-Policy":"same-origin"});
   const emit=event=>{if(!res.destroyed)res.write(JSON.stringify(event)+"\n");};
   emit({type:"start",status:"real-sentinel-region-started",
     from,to,month,cloud,x,y,cols,rows,
     tiles:specs.map(t=>({key:t.key,x:t.x,y:t.y,
       bounds:{west:t.west,south:t.south,east:t.east,north:t.north}}))});
   for(const spec of specs){
     if(res.destroyed)break;
     const bounds={west:spec.west,south:spec.south,east:spec.east,north:spec.north};
     try{
       // The same genuine Stage 15 STAC/COG/SCL pipeline; no alternate raster sources.
       const product=await obtainMultiyear(spec,from,to,month,cloud);
       const doc=JSON.parse(product.json.toString("utf8"));
       aggregate.addResult(spec.key,bounds,doc);
     }catch(err){
       const reason=String(err?.message??err).slice(0,180);
       const insufficient=err?.code==="OBSERVATION_INSUFFICIENT"||
         /Insufficient real common SCL-valid pixels/.test(reason);
       aggregate.addUnavailable(spec.key,bounds,
         insufficient?"insufficient":"error",reason);
     }
     const snapshot=aggregate.snapshot();
     emit({type:"tile",tile:snapshot.tiles[snapshot.tiles.length-1],
       processed:snapshot.processedTiles,total:snapshot.requestedTiles});
   }
   if(!res.destroyed){
     emit({type:"complete",result:aggregate.finish()});
     res.end();
   }
 }finally{regionalJobActive=false;}
}

function send(res,status,data,contentType){
  const bytes=typeof data==="string"?Buffer.from(data):data;
  res.writeHead(status,{"Content-Type":contentType,
    "Content-Length":bytes.byteLength,"Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Cross-Origin-Resource-Policy":"same-origin",
    "Content-Security-Policy":"default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"});
  res.end(bytes);
}
const server=createServer(async(req,res)=>{
  try{
    const host=req.headers.host??"";
    if(!/^(?:127\.0\.0\.1|localhost):\d{1,5}$/.test(host)){
      send(res,403,"Forbidden host","text/plain; charset=utf-8");return;
    }
    const incoming=new URL(req.url??"/","http://127.0.0.1");
    const pathname=incoming.pathname;
    if(req.method!=="GET"){send(res,405,"Only GET is supported","text/plain");return;}
    if(pathname==="/"){
      send(res,200,viewport,"text/html; charset=utf-8");return;
    }
    if(pathname==="/api/inspect.js"){
      send(res,200,inspectionScript,"application/javascript; charset=utf-8");return;
    }
    if(pathname==="/api/visibility.js"){
      send(res,200,visibilityScript,"application/javascript; charset=utf-8");return;
    }
    if(pathname==="/api/config"){
      send(res,200,JSON.stringify({...pragueStreamManifest(),offlineMode:offline}),"application/json; charset=utf-8");return;
    }
    if(pathname==="/api/observations/multiyear/region.ndjson"){
      await streamRegionalMultiyear(req,res,incoming.searchParams);return;
    }
    const obsCatalogPath=/^\/api\/observations\/scenes\/0\/([0-9]{1,2})\/([0-9]{1,2})\.json$/.exec(pathname);
    if(obsCatalogPath){
      const spec=tileSpec(0,Number(obsCatalogPath[1]),Number(obsCatalogPath[2]));
      const from=incoming.searchParams.get("from")??"2025-06-01";
      const to=incoming.searchParams.get("to")??"2025-09-30";
      const maxCloud=Number(incoming.searchParams.get("cloud")??"35");
      const catalog=await observationScenes(spec,from,to,maxCloud);
      send(res,200,JSON.stringify(catalog),"application/json; charset=utf-8");return;
    }
    const multiScenes=/^\/api\/observations\/multiyear\/scenes\/0\/([0-9]{1,2})\/([0-9]{1,2})\.json$/.exec(pathname);
    if(multiScenes){
      const spec=tileSpec(0,Number(multiScenes[1]),Number(multiScenes[2]));
      const from=Number(incoming.searchParams.get("from")??"2023");
      const to=Number(incoming.searchParams.get("to")??"2025");
      const month=Number(incoming.searchParams.get("month")??"8");
      const cloud=Number(incoming.searchParams.get("cloud")??"50");
      const data=await multiyearSceneSelection(spec,from,to,month,cloud);
      send(res,200,JSON.stringify(data),"application/json; charset=utf-8");return;
    }
    const multiResult=/^\/api\/observations\/multiyear\/0\/([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})\/([0-9]{4})\/([0-9]{1,2})\.(json|png)$/.exec(pathname);
    if(multiResult){
      const spec=tileSpec(0,Number(multiResult[1]),Number(multiResult[2]));
      const from=Number(multiResult[3]),to=Number(multiResult[4]);
      const month=Number(multiResult[5]);
      const cloud=Number(incoming.searchParams.get("cloud")??"50");
      const data=await obtainMultiyear(spec,from,to,month,cloud);
      send(res,200,multiResult[6]==="json"?data.json:data.png,
        multiResult[6]==="json"?"application/json; charset=utf-8":"image/png");
      return;
    }
    const seasonalScenes=/^\/api\/observations\/seasonal\/scenes\/0\/([0-9]{1,2})\/([0-9]{1,2})\.json$/.exec(pathname);
    if(seasonalScenes){
      const spec=tileSpec(0,Number(seasonalScenes[1]),Number(seasonalScenes[2]));
      const beforeYear=Number(incoming.searchParams.get("before")??"2024");
      const afterYear=Number(incoming.searchParams.get("after")??"2025");
      const month=Number(incoming.searchParams.get("month")??"8");
      const cloud=Number(incoming.searchParams.get("cloud")??"50");
      const result=await seasonalSceneSelection(spec,beforeYear,afterYear,month,cloud);
      send(res,200,JSON.stringify(result),"application/json; charset=utf-8");return;
    }
    const seasonalResult=/^\/api\/observations\/seasonal\/0\/([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})\/([0-9]{4})\/([0-9]{1,2})\.(json|png)$/.exec(pathname);
    if(seasonalResult){
      const spec=tileSpec(0,Number(seasonalResult[1]),Number(seasonalResult[2]));
      const beforeYear=Number(seasonalResult[3]),afterYear=Number(seasonalResult[4]);
      const month=Number(seasonalResult[5]);
      const cloud=Number(incoming.searchParams.get("cloud")??"50");
      const result=await obtainSeasonal(spec,beforeYear,afterYear,month,cloud);
      send(res,200,seasonalResult[6]==="json"?result.json:result.png,
        seasonalResult[6]==="json"?"application/json; charset=utf-8":"image/png");
      return;
    }
    const trendMatch=/^\/api\/observations\/trend\/0\/([0-9]{1,2})\/([0-9]{1,2})\/([A-Za-z0-9_,-]{16,760})\.(json|png)$/.exec(pathname);
    if(trendMatch){
      const spec=tileSpec(0,Number(trendMatch[1]),Number(trendMatch[2]));
      const sceneIds=trendMatch[3].split(",");
      const result=await obtainTrend(spec,sceneIds);
      send(res,200,trendMatch[4]==="json"?result.json:result.png,
        trendMatch[4]==="json"?"application/json; charset=utf-8":"image/png");
      return;
    }
    const changeMatch=/^\/api\/observations\/compare\/0\/([0-9]{1,2})\/([0-9]{1,2})\/([A-Za-z0-9_-]{5,120})\/([A-Za-z0-9_-]{5,120})\.(json|png)$/.exec(pathname);
    if(changeMatch){
      const spec=tileSpec(0,Number(changeMatch[1]),Number(changeMatch[2]));
      const result=await obtainChange(spec,changeMatch[3],changeMatch[4]);
      send(res,200,changeMatch[5]==="json"?result.json:result.png,
        changeMatch[5]==="json"?"application/json; charset=utf-8":"image/png");
      return;
    }
    const obsMatch=/^\/api\/observations\/0\/([0-9]{1,2})\/([0-9]{1,2})\/([A-Za-z0-9_-]{5,120})\.(json|rgb\.png|ndvi\.png)$/.exec(pathname);
    if(obsMatch){
      const spec=tileSpec(0,Number(obsMatch[1]),Number(obsMatch[2]));
      const sceneId=obsMatch[3],kind=obsMatch[4];
      const product=await obtainObservation(spec,sceneId);
      send(res,200,kind==="json"?product.json:
        kind==="rgb.png"?product.rgb:product.ndvi,
        kind==="json"?"application/json; charset=utf-8":"image/png");
      return;
    }
    const buildingMatch=/^\/api\/buildings\/0\/([0-9]{1,2})\/([0-9]{1,2})\.json$/.exec(pathname);
    if(buildingMatch){
      const spec=tileSpec(0,Number(buildingMatch[1]),Number(buildingMatch[2]));
      const bytes=await obtainBuildings(spec);
      send(res,200,bytes,"application/json; charset=utf-8");return;
    }
    const match=/^\/api\/tiles\/([01])\/([0-9]{1,2})\/([0-9]{1,2})\.(json|png)$/.exec(pathname);
    if(match){
      const spec=tileSpec(Number(match[1]),Number(match[2]),Number(match[3]));
      const data=await obtain(spec);
      send(res,200,match[4]==="json"?data.json:data.png,
        match[4]==="json"?"application/json; charset=utf-8":"image/png");
      return;
    }
    send(res,404,JSON.stringify({error:"Unknown local tile path"}),
      "application/json; charset=utf-8");
  }catch(err){
    console.error("Tile error:",String(err));
    const message=String(err?.message??err).slice(0,250);
    send(res,err?.code==="TILE_NOT_CACHED"?404:err?.code==="OBSERVATION_BUSY"?429:err?.code==="OBSERVATION_INSUFFICIENT"?422:err instanceof RangeError?400:503,
      JSON.stringify({error:message,syntheticFallback:false}),
      "application/json; charset=utf-8");
  }
});
server.listen(port,"127.0.0.1",()=>{
  const actual=server.address().port;
  const url="http://127.0.0.1:"+actual+"/";
  console.log("OpenLaunch live real 3D Prague: "+url);
  console.log("Region: ~4×4 km, coarse 12m and detailed 2m real DMP OK tiles.");
  console.log("Optional honest building LOD1 layer: OSM footprints + ČÚZK DMR 5G/DMP OK; never synthetic heights.");
  console.log("Sentinel-2 analytics: actual dated RGB/NDVI, two-date change, three-date series, two-year medians and 3..5-year same-month observational trend with leave-one-year-out sensitivity.");
  console.log("Tiles are requested only as needed; repeat visits use "+cacheRoot);
  if(offline)console.log("Offline mode: serving only genuine ČÚZK tiles already on disk; no Internet requests.");
  if(!args.includes("--no-open")&&process.platform==="win32"){
    const cmd=spawn("cmd",["/c","start","",url],{windowsHide:true,detached:true,stdio:"ignore"});
    cmd.unref();
  }
});
for(const sig of ["SIGINT","SIGTERM"])process.once(sig,()=>server.close(()=>process.exit(0)));
