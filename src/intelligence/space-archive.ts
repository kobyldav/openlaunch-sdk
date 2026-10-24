import { nasaGibsTileTemplate, type GibsLayerId, type NasaGibsClient } from "../providers/gibs.js";
import type { MeteosatFrameTimeline, MeteosatMapOptions } from "../providers/meteosat.js";
import type { BBox } from "../geo/types.js";
import { probeSpaceImage, type SpaceImageAvailability } from "./layer-health.js";

export type ArchiveProvider = "nasa-gibs" | "meteosat";
export type ArchiveDelivery = "unchecked" | "sample-available" | "image-available" | "unavailable" | "error";
export interface ArchiveTileSample { z:number; x:number; y:number; }
export interface NasaArchiveRequest {
  source: "nasa-gibs";
  layer: GibsLayerId;
  from: Date | string;
  to: Date | string;
  /** Bounded inclusive UTC calendar days; 1-31. Default 7. */
  maxFrames?: number;
  /** Verify at most 8 most recent dates by downloading one specified tile. */
  verifyLast?: number;
  sampleTile?: ArchiveTileSample;
}
export interface MeteosatArchiveRequest {
  source: "meteosat";
  layer: string;
  bounds3857: BBox;
  width: number;
  height: number;
  format?: "image/png" | "image/jpeg";
  /** Provider-advertised timestamps, 1-48. Default 12. */
  maxFrames?: number;
  /** Download up to 8 full WMS images sequentially. Default 0. */
  verifyLast?: number;
}
export type SpaceArchiveRequest = NasaArchiveRequest | MeteosatArchiveRequest;
export interface SpaceArchiveFrame {
  id: string;
  source: ArchiveProvider;
  /** Daily NASA date or provider-advertised EUMETView TIME; not acquisition. */
  time: string;
  timeBasis: "requested-day" | "advertised-time";
  observedAt: null;
  verifiedAcquisition: false;
  /** WMTS template for map tiles or a full georeferenced WMS image URL. */
  mapUrl: string;
  mapKind: "wmts-xyz" | "wms-image";
  attribution: string;
  delivery: ArchiveDelivery;
  /** An image response does not prove the actual satellite acquisition instant. */
  checkedAt: string | null;
  /** Scope of HTTP check: entire WMS image, one NASA tile, or no download. */
  verifiedScope: "none" | "sample-tile" | "full-wms-image";
  /** True only after a valid full WMS image was received (not for one NASA tile). */
  fullImageReady: boolean;
}
export interface SpaceArchivePlayback {
  source: ArchiveProvider;
  layer: string;
  generatedAt: string;
  timelineStatus: "generated" | MeteosatFrameTimeline["status"];
  frames: SpaceArchiveFrame[];
  verifiedFrames: number;
  checkedFrames: number;
  verifiedAcquisition: false;
  caveats: readonly string[];
}
export interface SpaceArchiveClients {
  gibs: Pick<NasaGibsClient,"fetchTile">;
  meteosat: {
    timeline(options: { layer:string; bounds3857:BBox; width:number; height:number;
      maxFrames?:number; format?:"image/png"|"image/jpeg" }):Promise<MeteosatFrameTimeline>;
    fetchMap(options:MeteosatMapOptions):Promise<{image:Uint8Array;contentType:string}>;
  };
}
function count(value:number|undefined, fallback:number, max:number, label:string):number {
  const result=value??fallback;
  if(!Number.isSafeInteger(result)||result<1||result>max)
    throw new RangeError(label+" must be between 1 and "+max);
  return result;
}
function checks(value:number|undefined):number {
  const result=value??0;
  if(!Number.isSafeInteger(result)||result<0||result>8)
    throw new RangeError("verifyLast must be between 0 and 8");
  return result;
}
function day(value:Date|string):number {
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))throw new RangeError("Invalid archive UTC date");
  return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
}
function checked(frame:SpaceArchiveFrame, result:SpaceImageAvailability):void {
  frame.checkedAt=result.checkedAt;
  frame.delivery=result.status==="available"
    ? (frame.source==="meteosat"?"image-available":"sample-available")
    : result.status;
  frame.verifiedScope=frame.source==="meteosat"?"full-wms-image":"sample-tile";
  frame.fullImageReady=frame.delivery==="image-available";
}
const nasaCaveats=[
  "WMTS dates are requested calendar days, not verified satellite acquisition timestamps.",
  "One sampled NASA tile can succeed even when other tiles are absent or cloud-covered.",
  "Archive frames are SDK descriptors; use the WMTS template in a map engine.",
];
const meteosatCaveats=[
  "WMS TIME dimensions are provider-advertised, not independently confirmed capture times.",
  "A successful WMS image only verifies the requested image response, not physical acquisition.",
  "WMS image URLs may require backend proxying and usage limits; respect EUMETSAT attribution.",
];

/** Provider-neutral map playback descriptors for two independently supported Earth data sources. */
export async function buildSpaceArchive(
  clients:SpaceArchiveClients,request:SpaceArchiveRequest,
  now:()=>Date=()=>new Date(),
):Promise<SpaceArchivePlayback>{
  const maxFrames=count(request.maxFrames,request.source==="nasa-gibs"?7:12,
    request.source==="nasa-gibs"?31:48,"maxFrames");
  const verifyLast=checks(request.verifyLast);
  const generatedAt=now().toISOString();
  if(request.source==="nasa-gibs"){
    if(verifyLast>0&&!request.sampleTile)
      throw new RangeError("NASA image checks require a sampleTile {z,x,y}");
    const from=day(request.from),to=day(request.to);
    const length=Math.round((to-from)/86_400_000)+1;
    if(length<1||length>maxFrames)
      throw new RangeError("NASA archive date window reversed or exceeds maxFrames");
    const frames:SpaceArchiveFrame[]=Array.from({length},(_,i)=>{
      const date=new Date(from+i*86_400_000);
      const descriptor=nasaGibsTileTemplate(request.layer,date);
      return {
        id:"nasa-gibs:"+request.layer+":"+descriptor.requestedDate,
        source:"nasa-gibs",time:descriptor.requestedDate,timeBasis:"requested-day",
        observedAt:null,verifiedAcquisition:false,
        mapUrl:descriptor.urlTemplate,mapKind:"wmts-xyz",attribution:descriptor.attribution,
        delivery:"unchecked",checkedAt:null,verifiedScope:"none",fullImageReady:false,
      };
    });
    for(const frame of frames.slice(-verifyLast)){
      const tile=request.sampleTile!;
      checked(frame,await probeSpaceImage(clients,{
        source:"nasa-gibs",layer:request.layer,date:frame.time,z:tile.z,x:tile.x,y:tile.y,
      },now));
    }
    return {
      source:request.source,layer:request.layer,generatedAt,timelineStatus:"generated",
      frames,checkedFrames:verifyLast,
      verifiedFrames:frames.filter(f=>f.delivery==="sample-available").length,
      verifiedAcquisition:false,caveats:nasaCaveats,
    };
  }
  const options={
    layer:request.layer,bounds3857:request.bounds3857,width:request.width,
    height:request.height,maxFrames,...(request.format?{format:request.format}:{}),
  };
  const timeline=await clients.meteosat.timeline(options);
  const frames:SpaceArchiveFrame[]=timeline.frames.map(frame=>({
    id:"meteosat:"+request.layer+":"+frame.advertisedTime,
    source:"meteosat",time:frame.advertisedTime,timeBasis:"advertised-time",
    observedAt:null,verifiedAcquisition:false,
    mapUrl:frame.request.url,mapKind:"wms-image",attribution:"EUMETSAT EUMETView",
    delivery:"unchecked",checkedAt:null,verifiedScope:"none",fullImageReady:false,
  }));
  for(const frame of frames.slice(-verifyLast)){
    checked(frame,await probeSpaceImage(clients,{
      source:"meteosat",map:{layer:request.layer,bounds3857:request.bounds3857,
        width:request.width,height:request.height,time:frame.time,
        ...(request.format?{format:request.format}:{})},
    },now));
  }
  return {
    source:request.source,layer:request.layer,generatedAt,
    timelineStatus:timeline.status,frames,checkedFrames:Math.min(verifyLast,frames.length),
    verifiedFrames:frames.filter(f=>f.delivery==="image-available").length,
    verifiedAcquisition:false,caveats:meteosatCaveats,
  };
}
