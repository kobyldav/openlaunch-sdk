import type { AreaOfInterest, Geometry, Position } from "../geo/types.js";
import {
  gridCrsToLonLat, pixelToWorld, validateRaster,
  type RasterGrid,
} from "./raster.js";
import { readCogWindowUrl, type CogReadOptions } from "./cog.js";

export type AoiQualityMask = "sentinel-2-l2a-scl" | "landsat-c2-l2-qa-pixel-l89";
export type AoiPixelClass = "clear" | "cloud" | "shadow" | "snow" | "unknown" | "no-data";
export interface AoiPixelQualityInput {
  /** Actual, decoded QA/SCL raster with CRS and pixel-to-world transform. */
  mask: RasterGrid;
  /** The geographic area to measure; raster pixel CENTERS determine membership. */
  area: AreaOfInterest;
  source: AoiQualityMask;
  /** Optional aligned science band; non-finite cells count as no-data. */
  data?: RasterGrid;
  /** Constrain CPU/memory use. Default 1,048,576 mask pixels, hard limit 4,194,304. */
  maxPixels?: number;
}
export interface AoiPixelQuality {
  source: AoiQualityMask;
  evidence: "decoded-raster-qa-pixels";
  aoiPixelCount: number;
  analyzedPixelCount: number;
  outsideAoiPixelCount: number;
  clearPixels: number;
  cloudPixels: number;
  shadowPixels: number;
  snowPixels: number;
  unknownPixels: number;
  noDataPixels: number;
  /** Clear classified pixels / all AOI pixel centers. */
  usablePercentOfAoi: number | null;
  /** Classified pixels (clear/cloud/shadow/snow) / all AOI pixel centers. */
  classifiedPercentOfAoi: number | null;
  /** Cloud / classified pixels. Unknown and no-data excluded, not considered clear. */
  cloudPercentOfClassified: number | null;
  /** Null if AOI contains zero centers or no classified pixels. */
  quality: "usable" | "cloud-obscured" | "no-usable-pixels" | "no-aoi-pixels" | "insufficient-classification";
  pixelEvidence: true;
  /** Whether mask pixels truly correspond to the correct scene is caller responsibility. */
  sourceSceneVerified: false;
  /** True cloud coverage outside selected mask classes is NOT claimed. */
  sensorAcquisitionVerified: false;
  warnings: readonly string[];
}
export interface RemoteAoiPixelQualityRequest {
  /** Official QA/SCL COG URL, from backend-resolved provider metadata, never a browser-supplied arbitrary URL. */
  href: string;
  area: AreaOfInterest;
  source: AoiQualityMask;
  /** Exact trusted hosts; securely configured on backend only. */
  allowedHosts: readonly string[];
  fetch?: typeof fetch;
  maxPixels?: number;
  timeoutMs?: number;
}
export interface RemoteAoiPixelQuality {
  quality: AoiPixelQuality;
  remoteBlocks: number;
  downloadedBytes: number;
  transferStrategy: "http-byte-ranges";
  /** Raster is read from a QA product, not a true-color preview. */
  dataKind: "qa-mask-cog";
}

function pointInRing(ring:readonly Position[],x:number,y:number):boolean {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i]!,b=ring[j]!;
    if(a[1]===b[1])continue;
    if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])
      inside=!inside;
  }
  return inside;
}
function inPolygon(rings:readonly (readonly Position[])[],x:number,y:number):boolean {
  return !!rings[0] && pointInRing(rings[0],x,y) &&
    !rings.slice(1).some(hole=>pointInRing(hole,x,y));
}
function inside(geom:Geometry,x:number,y:number):boolean {
  if(geom.type==="Polygon")return inPolygon(geom.coordinates,x,y);
  if(geom.type==="MultiPolygon")return geom.coordinates.some(rings=>inPolygon(rings,x,y));
  throw new RangeError("AOI quality requires Polygon or MultiPolygon; Point is not a measurable area");
}
function classify(raw:number,source:AoiQualityMask):AoiPixelClass {
  if(!Number.isFinite(raw))return "no-data";
  if(!Number.isInteger(raw))return "unknown";
  if(source==="sentinel-2-l2a-scl") {
    if(raw===0||raw===1)return "no-data";
    if(raw===3)return "shadow";
    if(raw===8||raw===9||raw===10)return "cloud";
    if(raw===11)return "snow";
    if(raw===4||raw===5||raw===6)return "clear";
    return "unknown";
  }
  if(raw<0||raw>65535)return "unknown";
  if((raw&1)!==0)return "no-data"; // bit 0: fill
  if((raw&((1<<1)|(1<<2)|(1<<3)))!==0)return "cloud"; // dilated, cirrus, cloud
  if((raw&(1<<4))!==0)return "shadow";
  if((raw&(1<<5))!==0)return "snow";
  // Landsat 8/9 QA_PIXEL bit 6 (clear) is expected on clear pixels.
  return (raw&(1<<6))!==0?"clear":"unknown";
}
function validateMasks(mask:RasterGrid,data:RasterGrid|undefined,maxPixels:number):void {
  validateRaster(mask);
  if(mask.width*mask.height>maxPixels)throw new RangeError("AOI quality exceeds maxPixels budget");
  if(!data)return;
  validateRaster(data);
  if(data.width!==mask.width||data.height!==mask.height||data.crs!==mask.crs ||
    data.transform.some((v,i)=>Math.abs(v-mask.transform[i]!)>1e-8))
    throw new RangeError("Data and QA masks must have exactly aligned grids; reproject explicitly");
}
/** Pixel center sampling, not subpixel weighting or a geodesic area estimate. */
export function analyzeAoiPixelQuality(input:AoiPixelQualityInput):AoiPixelQuality {
  const {mask,data,area,source}=input;
  if(source!=="sentinel-2-l2a-scl"&&source!=="landsat-c2-l2-qa-pixel-l89")
    throw new RangeError("Unsupported sensor QA mask classification");
  const maxPixels=input.maxPixels??1_048_576;
  if(!Number.isSafeInteger(maxPixels)||maxPixels<1||maxPixels>4_194_304)
    throw new RangeError("maxPixels must be an integer in 1..4194304");
  if(area.bbox[0]>area.bbox[2]||area.bbox[2]-area.bbox[0]>180)
    throw new RangeError("Antimeridian-crossing areas must be tiled explicitly");
  if(area.geometry.type==="Point")
    throw new RangeError("AOI quality requires Polygon or MultiPolygon");
  validateMasks(mask,data,maxPixels);
  let clear=0,cloud=0,shadow=0,snow=0,unknown=0,noData=0,aoi=0;
  const [west,south,east,north]=area.bbox;
  for(let row=0;row<mask.height;row++)for(let col=0;col<mask.width;col++) {
    const offset=row*mask.width+col;
    const [x,y]=pixelToWorld(mask.transform,col+0.5,row+0.5);
    const [lon,lat]=gridCrsToLonLat(x,y,mask.crs);
    if(lon<west||lon>east||lat<south||lat>north||!inside(area.geometry,lon,lat))continue;
    aoi++;
    const cls=data&&!Number.isFinite(data.values[offset]!)?"no-data":
      classify(mask.values[offset]!,source);
    if(cls==="clear")clear++;
    else if(cls==="cloud")cloud++;
    else if(cls==="shadow")shadow++;
    else if(cls==="snow")snow++;
    else if(cls==="unknown")unknown++;
    else noData++;
  }
  const classified=clear+cloud+shadow+snow;
  const ratio=(num:number,den:number)=>den?Math.round((10000*num/den))/100:null;
  const quality=aoi===0?"no-aoi-pixels":
    classified===0?"insufficient-classification":
    clear===0?"no-usable-pixels":
    clear/aoi>=0.5?"usable":"cloud-obscured";
  return {
    source,evidence:"decoded-raster-qa-pixels",aoiPixelCount:aoi,
    analyzedPixelCount:mask.width*mask.height,outsideAoiPixelCount:mask.width*mask.height-aoi,
    clearPixels:clear,cloudPixels:cloud,shadowPixels:shadow,snowPixels:snow,
    unknownPixels:unknown,noDataPixels:noData,
    usablePercentOfAoi:ratio(clear,aoi),classifiedPercentOfAoi:ratio(classified,aoi),
    cloudPercentOfClassified:ratio(cloud,classified),quality,
    pixelEvidence:true,sourceSceneVerified:false,sensorAcquisitionVerified:false,
    warnings:[
      "Percentages use intersecting pixel CENTERS (equal pixel weight), not exact geodesic AOI area.",
      "A correct cloud/QA band must correspond to the scene and align with the supplied data.",
      "Cloud classification is sensor/product-specific; unknown, shadow, snow and no-data never count as clear.",
      "Decoding mask pixels verifies classification of supplied data, not independently sensor capture time or that unmasked pixels are scientifically calibrated.",
    ],
  };
}
/**
 * Strict, ranged single-band GeoTIFF/COG read of a dedicated classification/QA
 * asset from an allowlisted HTTPS provider; analyze the actual decoded window.
 */
export async function analyzeRemoteAoiPixelQuality(
  request:RemoteAoiPixelQualityRequest,
):Promise<RemoteAoiPixelQuality> {
  const opts:CogReadOptions={
    allowedHosts:request.allowedHosts,
    ...(request.fetch?{fetch:request.fetch}:{}),
    ...(request.maxPixels!==undefined?{maxPixels:request.maxPixels}:{}),
    ...(request.timeoutMs!==undefined?{timeoutMs:request.timeoutMs}:{}),
  };
  const result=await readCogWindowUrl(request.href,request.area,opts);
  return {
    quality:analyzeAoiPixelQuality({mask:result.raster,area:request.area,
      source:request.source,...(request.maxPixels!==undefined?{maxPixels:request.maxPixels}:{})}),
    remoteBlocks:result.requestedTiles,downloadedBytes:result.metadataBytesRead+result.tileBytesRead,
    transferStrategy:result.transferStrategy,dataKind:"qa-mask-cog",
  };
}
