import type {AreaOfInterest} from "../geo/types.js";
import type {StacClient,StacItem} from "../providers/stac.js";
import {StacClient as CatalogClient} from "../providers/stac.js";
import type {RasterGrid} from "./raster.js";
import {areaKm2Approx} from "../geo/types.js";
import {reprojectRasterTo,rasterStatistics,validateRaster} from "./raster.js";
import {readCogWindowUrl,type CogReadResult} from "./cog.js";

/** Public Element84 Earth Search API, independent of Copernicus auth. */
export const SENTINEL2_EARTH_SEARCH="https://earth-search.aws.element84.com/v1/";
/** Known public AWS COG domains; no user-supplied arbitrary hosts. */
export const SENTINEL2_PUBLIC_COG_HOSTS=[
 "sentinel-cogs.s3.us-west-2.amazonaws.com",
 "sentinel-cogs.s3.amazonaws.com",
 "e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com",
 "e84-earth-search-sentinel-data.s3.amazonaws.com",
] as const;

export interface Sentinel2RgbTileOptions{
 area:AreaOfInterest;
 startDate:string;
 endDate:string;
 /** Scene-level cloud percentage (not local pixel-cloud proof). Default 35. */
 maxCloudPercent?:number;
 /** Maximum STAC scenes to inspect, default 50. */
 searchLimit?:number;
 /** Testing, controlled provider transport. */
 client?:Pick<StacClient,"search">;
 /** Testing, controlled single-band COG window loader. */
 readWindow?:typeof readCogWindowUrl;
}
export interface Sentinel2RgbTile{
 kind:"satellite-optical-rgb";
 provider:"Element84 Earth Search / Copernicus Sentinel-2 L2A";
 collection:"sentinel-2-l2a";
 sceneId:string;
 acquiredAt:string;
 sceneCloudPercent:number|null;
 /** All three channels are independently sampled from the SAME source scene. */
 bands:{red:RasterGrid;green:RasterGrid;blue:RasterGrid};
 /** Metadata only; URLs are never executed as commands. */
 bandUrls:{red:string;green:string;blue:string};
 grid:Pick<RasterGrid,"width"|"height"|"crs"|"transform">;
 nativeResolutionM:number|null;
 area:AreaOfInterest;
 /** Explicit separation: this result contains no measured stereo height. */
 verticalModel:null;
 elevationSource:"none";
 stats:{red:ReturnType<typeof rasterStatistics>;green:ReturnType<typeof rasterStatistics>;blue:ReturnType<typeof rasterStatistics>};
 warnings:string[];
}
function yyyyMmDd(s:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+"T00:00:00.000Z");
 return Number.isFinite(d.getTime())&&d.toISOString().startsWith(s);
}
function assetHref(scene:StacItem,name:"red"|"green"|"blue"):string|null{
 const asset=scene.assets?.[name];
 if(!asset||typeof asset.href!=="string")return null;
 try{
  const url=new URL(asset.href);
  if(url.protocol!=="https:"||url.username||url.password||url.port||
    !SENTINEL2_PUBLIC_COG_HOSTS.some(host=>host===url.hostname)||
    !url.pathname.toLowerCase().endsWith(".tif"))return null;
  return url.href;
 }catch{return null;}
}
export function chooseSentinel2RgbScenes(items:readonly StacItem[],maxCloudPercent=35):StacItem[]{
 if(!Number.isFinite(maxCloudPercent)||maxCloudPercent<0||maxCloudPercent>100)
   throw new RangeError("maxCloudPercent must be 0..100");
 return [...items].filter(item=>
   item.type==="Feature"&&item.collection==="sentinel-2-l2a"&&
   typeof item.id==="string"&&typeof item.properties?.datetime==="string"&&
   Number.isFinite(new Date(item.properties.datetime).getTime())&&
   Object.keys({red:1,green:1,blue:1}).every(key=>assetHref(item,key as "red"|"green"|"blue")!==null)&&
   (typeof item.properties["eo:cloud_cover"]!=="number"||
    (Number.isFinite(item.properties["eo:cloud_cover"])&&item.properties["eo:cloud_cover"]<=maxCloudPercent))
 ).sort((a,b)=>{
   const cloud=item=>typeof item.properties["eo:cloud_cover"]==="number"?
     item.properties["eo:cloud_cover"] as number:101;
   return cloud(a)-cloud(b)||String(b.properties.datetime).localeCompare(String(a.properties.datetime));
 });
}
/**
 * Real Sentinel-2 L2A 10 m RGB imagery over a small AOI. Uses SDK STAC search
 * and its native COG byte-range reader, NOT a screenshot or synthetic mosaic.
 * Not a stereo pair; cannot recover building heights.
 */
export async function fetchSentinel2RgbTile(o:Sentinel2RgbTileOptions):Promise<Sentinel2RgbTile>{
 const {area,startDate,endDate}=o;
 if(!area||area.bbox.length!==4||!area.bbox.every(Number.isFinite)||
   area.bbox[0]===area.bbox[2]||area.bbox[1]===area.bbox[3]||
   !(areaKm2Approx(area)>0)||areaKm2Approx(area)>9)
   throw new RangeError("Sentinel-2 RGB AOI must be positive and <=9 km²");
 if(!yyyyMmDd(startDate)||!yyyyMmDd(endDate)||startDate>endDate)
   throw new RangeError("Sentinel-2 dates must be YYYY-MM-DD and ascending");
 const limit=o.searchLimit??50;
 if(!Number.isInteger(limit)||limit<1||limit>100)
   throw new RangeError("Sentinel-2 searchLimit must be 1..100");
 const client=o.client??new CatalogClient({
   baseUrl:SENTINEL2_EARTH_SEARCH,timeoutMs:35_000,retries:2
 });
 const found=await client.search({
   collections:["sentinel-2-l2a"],bbox:area.bbox,
   datetime:startDate+"T00:00:00Z/"+endDate+"T23:59:59Z",limit
 });
 const selected=chooseSentinel2RgbScenes(found.features??[],o.maxCloudPercent??35);
 if(!selected.length)throw new Error("No compatible public Sentinel-2 RGB COG in the selected date/cloud range; widen dates or cloud threshold");
 const read=o.readWindow??readCogWindowUrl;
 const failures:string[]=[];
 for(const scene of selected.slice(0,5)){
  const red=assetHref(scene,"red"),green=assetHref(scene,"green"),blue=assetHref(scene,"blue");
  if(!red||!green||!blue)continue;
  try{
   const options={allowedHosts:[...SENTINEL2_PUBLIC_COG_HOSTS],timeoutMs:90_000,
    maxPixels:200_000,maxBlocks:96,maxBlockBytes:16*1024*1024};
   // Each single-band COG is read over the SAME geographic AOI.
   const [r,g,b]:CogReadResult[]=await Promise.all([
     read(red,area,options),read(green,area,options),read(blue,area,options)
   ]);
   validateRaster(r.raster);validateRaster(g.raster);validateRaster(b.raster);
   const rr=r.raster,gg=reprojectRasterTo(g.raster,rr,"nearest"),bb=reprojectRasterTo(b.raster,rr,"nearest");
   const valid=[rr,gg,bb].reduce((n,grid)=>n+Array.from(grid.values).filter(Number.isFinite).length,0);
   if(valid===0)throw new Error("Selected scene has no usable RGB samples in AOI");
   const nativeResolutionM=rr.crs.startsWith("EPSG:326")||rr.crs.startsWith("EPSG:327")?
     Math.hypot(rr.transform[1],rr.transform[4]):null;
   return {
     kind:"satellite-optical-rgb",provider:"Element84 Earth Search / Copernicus Sentinel-2 L2A",
     collection:"sentinel-2-l2a",sceneId:scene.id,
     acquiredAt:scene.properties.datetime as string,
     sceneCloudPercent:typeof scene.properties["eo:cloud_cover"]==="number"?
       scene.properties["eo:cloud_cover"]:null,
     bands:{red:rr,green:gg,blue:bb},bandUrls:{red,green,blue},
     grid:{width:rr.width,height:rr.height,crs:rr.crs,transform:rr.transform},nativeResolutionM,
     area,verticalModel:null,elevationSource:"none",
     stats:{red:rasterStatistics(rr),green:rasterStatistics(gg),blue:rasterStatistics(bb)},
     warnings:[
       "Sentinel-2 RGB is real L2A satellite imagery, not a stereo pair or an elevation model.",
       "10 m native resolution cannot resolve small Prague buildings or individual facade geometry.",
       "Scene-wide cloud cover is not a per-pixel cloud mask; visualization uses a contrast stretch of native DN values.",
       "No DEM, height interpolation, or synthetic building 3D was used."
     ]
   };
  }catch(e){failures.push(scene.id+": "+String(e));}
 }
 throw new Error("Public Sentinel-2 COGs found but none could be read: "+failures.slice(0,3).join(" | "));
}
