/** Real single-scene Sentinel-2 L2A RGB + calibrated vegetation index on a bounded
 * terrain tile. Data, QA and georeferencing live in the SDK, not the WebGL UI.
 * Height is never inferred from optical reflectance; this only returns 2D rasters.
 */
import {bbox,areaKm2Approx,type AreaOfInterest} from "../geo/types.js";
import {StacClient,type StacItem} from "../providers/stac.js";
import {SENTINEL2_EARTH_SEARCH,SENTINEL2_PUBLIC_COG_HOSTS}
  from "../eo/sentinel2-rgb.js";
import {readCogWindowUrl,type CogReadResult} from "../eo/cog.js";
import {reprojectRasterTo,lonLatToGridCrs,ndviRaster,rasterStatistics,
  validateRaster,type RasterGrid} from "../eo/raster.js";

export const SENTINEL_TERRAIN_OVERLAY_VERSION=1;
const BAND_NAMES=["red","green","blue","nir","scl"] as const;
type BandName=typeof BAND_NAMES[number];
export interface SentinelTerrainScene{
  id:string;
  acquiredAt:string;
  cloudPercent:number|null;
  platform:string|null;
  hasScl:true;
}
export interface SentinelTerrainOverlay{
  status:"real-sentinel2-observation";
  version:number;
  sceneId:string;
  acquiredAt:string;
  cloudPercent:number|null;
  source:string;
  collection:"sentinel-2-l2a";
  area:AreaOfInterest["bbox"];
  width:number;
  height:number;
  groundSamplingM:number;
  rgbRgba:Uint8Array;
  ndviRgba:Uint8Array;
  statistics:{validPixels:number;maskedPixels:number;ndviMean:number|null;
    ndviMin:number|null;ndviMax:number|null};
  qa:{sclMask:true;maskClasses:number[];invalidReflectanceMasked:true;
    calibration:Record<"red"|"green"|"blue"|"nir",{scale:number;offset:number}>};
  caveats:string[];
}
export interface SentinelTerrainDiscoveryOptions{
  area:AreaOfInterest;
  from:string;to:string;maxCloudPercent?:number;
  limit?:number;
  client?:Pick<StacClient,"search">;
}
export interface SentinelTerrainLoadOptions{
  area:AreaOfInterest;
  scene:StacItem;
  readWindow?:typeof readCogWindowUrl;
  resolutionM?:number;
}
const finite=Number.isFinite;
function validDate(v:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+"T00:00:00Z");
 return finite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
export function validateObservationDates(from:string,to:string){
 if(typeof from!=="string"||typeof to!=="string"||
   !validDate(from)||!validDate(to)||from>to)
   throw new RangeError("Sentinel observation dates require ascending YYYY-MM-DD");
 const span=(Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000;
 if(span>370)throw new RangeError("Sentinel date interval cannot exceed 370 days");
}
function validateArea(area:AreaOfInterest){
 if(!area||area.geometry.type!=="Polygon"||
    area.bbox.length!==4||area.bbox.some(x=>!finite(x)))
   throw new RangeError("Observation requires a bounded geographic bbox");
 const [w,s,e,n]=area.bbox;
 if(w<12||e>19||s<48||n>52||w>=e||s>=n||
    areaKm2Approx(area)<=0||areaKm2Approx(area)>9)
   throw new RangeError("Stage 11 Sentinel 3D overlay requires a small Czech AOI <=9 km2");
 const canonical=bbox(w,s,e,n);
 if(JSON.stringify(area.geometry.coordinates)!==JSON.stringify(canonical.geometry.coordinates))
   throw new RangeError("Stage 11 accepts rectangular bbox() only");
}
export function sentinelTerrainAssetHref(scene:StacItem,band:BandName):string|null{
 const href=scene.assets?.[band]?.href;
 if(typeof href!=="string")return null;
 try{
   const url=new URL(href);
   if(url.protocol!=="https:"||url.port||url.username||url.password||
      !url.pathname.toLowerCase().endsWith(".tif")||
      !SENTINEL2_PUBLIC_COG_HOSTS.some(host=>url.hostname===host))return null;
   return url.href;
 }catch{return null;}
}
export function supportedTerrainScenes(items:readonly StacItem[],maxCloudPercent=35):StacItem[]{
 if(!finite(maxCloudPercent)||maxCloudPercent<0||maxCloudPercent>100)
   throw RangeError("Scene cloud threshold must be 0..100");
 return items.filter(scene=>{
   if(scene?.type!=="Feature"||scene.collection!=="sentinel-2-l2a"||
      !/^[a-zA-Z0-9_-]{5,120}$/.test(scene.id)||
      typeof scene.properties?.datetime!=="string"||
      !finite(Date.parse(scene.properties.datetime))||
      BAND_NAMES.some(name=>sentinelTerrainAssetHref(scene,name)===null))return false;
   const cloud=scene.properties["eo:cloud_cover"];
   return cloud===undefined||cloud===null||
     (typeof cloud==="number"&&finite(cloud)&&cloud>=0&&cloud<=maxCloudPercent);
 }).sort((a,b)=>String(b.properties.datetime).localeCompare(String(a.properties.datetime)));
}
const client=()=>new StacClient({baseUrl:SENTINEL2_EARTH_SEARCH,timeoutMs:35000,retries:1});
export async function discoverSentinelTerrainScenes(o:SentinelTerrainDiscoveryOptions):
 Promise<{items:StacItem[];scenes:SentinelTerrainScene[]}>{
 validateArea(o.area);validateObservationDates(o.from,o.to);
 const limit=o.limit??35;
 if(!Number.isInteger(limit)||limit<1||limit>60)
   throw RangeError("Scene discovery limit must be 1..60");
 const result=await (o.client??client()).search({
   collections:["sentinel-2-l2a"],bbox:o.area.bbox,
   datetime:o.from+"T00:00:00Z/"+o.to+"T23:59:59Z",limit
 });
 if(!Array.isArray(result.features))throw Error("Sentinel STAC response lacks scene features");
 const items=supportedTerrainScenes(result.features,o.maxCloudPercent??35).slice(0,12);
 return {items,scenes:items.map(item=>({
   id:item.id,acquiredAt:item.properties.datetime as string,
   cloudPercent:typeof item.properties["eo:cloud_cover"]==="number"?
     item.properties["eo:cloud_cover"]:null,
   platform:typeof item.properties.platform==="string"?item.properties.platform:null,
   hasScl:true as const
 }))};
}
/** STAC v1 raster:bands radiometric scaling with documented Earth Search
 * already-offset flag. Do not double-subtract BOA offset.
 * Refuse ambiguous missing metadata, rather than publishing invalid NDVI.
 */
export function sentinelReflectanceCalibration(scene:StacItem,band:
 "red"|"green"|"blue"|"nir"):{scale:number;offset:number}{
 const asset=scene.assets[band] as Record<string,unknown>|undefined;
 const raster=asset?.["raster:bands"];
 if(!Array.isArray(raster)||!raster.length||!raster[0]||
    typeof raster[0]!=="object")
   throw Error("Missing STAC raster:bands calibration for "+band);
 const metadata=raster[0] as Record<string,unknown>;
 const scale=metadata.scale, offset=metadata.offset;
 if(typeof scale!=="number"||!finite(scale)||scale<=0||scale>1)
   throw Error("Invalid Sentinel reflectance scale for "+band);
 if(offset!==undefined&&(typeof offset!=="number"||!finite(offset)||Math.abs(offset)>2))
   throw Error("Invalid Sentinel reflectance offset for "+band);
 const applied=scene.properties["earthsearch:boa_offset_applied"];
 if(applied!==undefined&&typeof applied!=="boolean")
   throw Error("Invalid Earth Search BOA offset provenance");
 return {scale,offset:applied===true?0:typeof offset==="number"?offset:0};
}
function outputGrid(area:AreaOfInterest,resolutionM:number):RasterGrid{
 if(!finite(resolutionM)||resolutionM<10||resolutionM>60)
   throw RangeError("Sentinel terrain grid must be 10..60 metres; upsampling is not new detail");
 const [w,s,e,n]=area.bbox;
 const [left,bottom]=lonLatToGridCrs(w,s,"EPSG:3857");
 const [right,top]=lonLatToGridCrs(e,n,"EPSG:3857");
 const localScale=Math.cos((s+n)*.5*Math.PI/180);
 const step=resolutionM/localScale;
 const width=Math.max(2,Math.ceil((right-left)/step));
 const height=Math.max(2,Math.ceil((top-bottom)/step));
 if(width>512||height>512||width*height>50000)
   throw RangeError("Sentinel overlay raster exceeds bounded sample budget");
 return {width,height,crs:"EPSG:3857",
   transform:[left,(right-left)/width,0,top,0,-(top-bottom)/height],
   values:new Float64Array(width*height).fill(NaN)};
}
function stretch(values:number[]):[number,number]{
 const sorted=values.filter(finite).sort((a,b)=>a-b);
 if(sorted.length<4)throw Error("Insufficient valid reflectance samples for RGB");
 const min=sorted[Math.floor((sorted.length-1)*.02)]!;
 const max=sorted[Math.floor((sorted.length-1)*.98)]!;
 return [min,Math.max(min+.01,max)];
}
function ndviColor(value:number):[number,number,number]{
 // Color is an analytic visualization, not a measured RGB observation.
 if(value<0)return [65,98,155];
 if(value<.15)return [190,149,98];
 if(value<.35)return [222,208,124];
 if(value<.55)return [136,185,87];
 if(value<.75)return [68,150,66];
 return [21,103,51];
}
export async function loadSentinelTerrainOverlay(o:SentinelTerrainLoadOptions):
 Promise<SentinelTerrainOverlay>{
 validateArea(o.area);
 const scene=o.scene;
 if(!supportedTerrainScenes([scene],100).length)
   throw Error("Requested Sentinel scene is missing source-qualified RGB/NIR/SCL assets");
 const calibration={
   red:sentinelReflectanceCalibration(scene,"red"),
   green:sentinelReflectanceCalibration(scene,"green"),
   blue:sentinelReflectanceCalibration(scene,"blue"),
   nir:sentinelReflectanceCalibration(scene,"nir")
 };
 const urls=BAND_NAMES.map(name=>sentinelTerrainAssetHref(scene,name)!);
 const opts={allowedHosts:[...SENTINEL2_PUBLIC_COG_HOSTS],timeoutMs:90000,
   maxPixels:100000,maxBlocks:64,maxBlockBytes:16*1024*1024};
 const read=o.readWindow??readCogWindowUrl;
 const products:CogReadResult[]=await Promise.all(
   urls.map(url=>read(url,o.area,opts)));
 const target=outputGrid(o.area,o.resolutionM??10);
 const [red,green,blue,nir,scl]=products.map(product=>{
   validateRaster(product.raster);
   return reprojectRasterTo(product.raster,target,"nearest");
 });
 const n=target.width*target.height;
 const reflectance=(raw:number,band:keyof typeof calibration)=>{
   const v=raw*calibration[band].scale+calibration[band].offset;
   return finite(raw)&&raw>0&&finite(v)&&v>=0&&v<=1.5?v:NaN;
 };
 const bands={red:new Float64Array(n),green:new Float64Array(n),
   blue:new Float64Array(n),nir:new Float64Array(n)};
 const good=new Uint8Array(n),rr:Record<"red"|"green"|"blue",number[]>={
   red:[],green:[],blue:[]
 };
 let masked=0;
 const reflectanceBands=["red","green","blue","nir"] as const;
 for(let i=0;i<n;i++){
   const sclClass=scl.values[i]!;
   if(!finite(sclClass)||![4,5,6,7].includes(Math.round(sclClass))){
     masked++;continue;
   }
   for(const name of reflectanceBands)
     bands[name][i]=reflectance(({red,green,blue,nir})[name].values[i]!,name);
   if(reflectanceBands.some(name=>!finite(bands[name][i]!))){
     masked++;continue;
   }
   // A near-zero total surface reflectance is numerically unstable for NDVI.
   if(bands.red[i]!+bands.nir[i]!<=.02){masked++;continue;}
   good[i]=1;
   rr.red.push(bands.red[i]!);rr.green.push(bands.green[i]!);rr.blue.push(bands.blue[i]!);
 }
 const valid=good.reduce((a,b)=>a+b,0);
 if(valid<4)throw Error("Selected Sentinel scene has no cloud-free calibrated RGB/NIR pixels");
 const stretches={red:stretch(rr.red),green:stretch(rr.green),blue:stretch(rr.blue)};
 const aligned=key=>({...target,values:Float64Array.from(bands[key],(v,i)=>good[i]?v:NaN)});
 const resultNdvi=ndviRaster(aligned("red"),aligned("nir"));
 const stats=rasterStatistics(resultNdvi);
 if(stats.valid!==valid||stats.min===null||stats.max===null||
   stats.min< -1.00001||stats.max>1.00001)
   throw Error("Calibrated NDVI is invalid; refusing unverified vegetation index");
 const rgbRgba=new Uint8Array(n*4),ndviRgba=new Uint8Array(n*4);
 for(let i=0;i<n;i++){
   if(!good[i])continue;
   for(const [c,name] of (["red","green","blue"] as const).entries()){
     const [lo,hi]=stretches[name];
     rgbRgba[i*4+c]=Math.round(Math.min(1,Math.max(0,
       (bands[name][i]!-lo)/(hi-lo)))*255);
   }
   rgbRgba[i*4+3]=255;
   const color=ndviColor(resultNdvi.values[i]!);
   ndviRgba.set([...color,255],i*4);
 }
 return {
   status:"real-sentinel2-observation",version:SENTINEL_TERRAIN_OVERLAY_VERSION,
   sceneId:scene.id,acquiredAt:scene.properties.datetime as string,
   cloudPercent:typeof scene.properties["eo:cloud_cover"]==="number"?
     scene.properties["eo:cloud_cover"]:null,
   source:"Element84 Earth Search STAC / Copernicus Sentinel-2 L2A public COG",
   collection:"sentinel-2-l2a",
   area:o.area.bbox,width:target.width,height:target.height,
   groundSamplingM:o.resolutionM??10,rgbRgba,ndviRgba,
   statistics:{validPixels:valid,maskedPixels:masked,
     ndviMean:stats.mean,ndviMin:stats.min,ndviMax:stats.max},
   qa:{sclMask:true,maskClasses:[4,5,6,7],invalidReflectanceMasked:true,
     calibration},
   caveats:[
     "Both RGB and NDVI derive from one actual dated Sentinel-2 L2A scene; scene cloud cover is scene-wide.",
     "SCL clouds, shadows, snow and invalid radiometry are transparent, revealing unchanged ČÚZK orthophoto underneath.",
     "NDVI uses calibrated surface reflectance with Earth Search BOA offset metadata, not uncorrected DN.",
     "10 m Sentinel spectral observations do not increase the 2 m ČÚZK DSM precision; no building heights are inferred.",
     "RGB uses a per-observation contrast stretch; the NDVI palette is a visualization, not RGB photography."
   ]
 };
}
