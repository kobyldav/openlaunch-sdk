/** Real Prague streamed 3D: starts immediately, downloads each requested
 * DSM/orthophoto tile only when the camera needs it, caches genuine data on disk.
 * No global all-city DEM/texture or synthetic imagery is allocated.
 */
import {createServer} from "node:http";
import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {deflateSync} from "node:zlib";
import {spawn} from "node:child_process";
import {OpenLaunch} from "../dist/index.js";
import {bbox} from "../dist/geo/types.js";
import {tileSpec,tileOriginOffset,pragueStreamManifest} from "./terrain-prague-stream-grid.mjs";
import {buildSeamMesh,TERRAIN_SEAM_VERSION} from "./terrain-prague-stream-seams.mjs";
import {fetchOsmFootprints,fetchGroundDmr,buildBuildings,BUILDING_LAYER_VERSION}
  from "./terrain-prague-buildings.mjs";

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
    const pathname=new URL(req.url??"/","http://127.0.0.1").pathname;
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
    send(res,err?.code==="TILE_NOT_CACHED"?404:err instanceof RangeError?400:503,
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
  console.log("Tiles are requested only as needed; repeat visits use "+cacheRoot);
  if(offline)console.log("Offline mode: serving only genuine ČÚZK tiles already on disk; no Internet requests.");
  if(!args.includes("--no-open")&&process.platform==="win32"){
    const cmd=spawn("cmd",["/c","start","",url],{windowsHide:true,detached:true,stdio:"ignore"});
    cmd.unref();
  }
});
for(const sig of ["SIGINT","SIGTERM"])process.once(sig,()=>server.close(()=>process.exit(0)));
