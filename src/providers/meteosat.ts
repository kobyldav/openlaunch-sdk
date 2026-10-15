import type { BBox } from "../geo/types.js";
import { boundedImageDimensions, boundedProviderGet, assertUtcDate, type BoundedHttpOptions } from "./eo-bounded.js";

/** EUMETView WMS; available layer names should be read from live GetCapabilities. */
export const EUMETVIEW_WMS = "https://view.eumetsat.int/geoserver/wms";
export const METEOSAT_EUROPE_STREAM = Object.freeze({
  provider:"eumetsat",
  officialPage:"https://www.eumetsat.int/new-satellites-eye-views-europe-and-africa-streaming-online",
  watchUrl:"https://www.youtube.com/live/nigtvuOspmM",
  embedUrl:"https://www.youtube-nocookie.com/embed/nigtvuOspmM",
  playback:"third-party-embed" as const,
  streamAvailability:"unverified" as const,
  source:"Meteosat-12" as const,
  nominalUpdateMinutes:10,
  documentedDelayMinutes:30,
  isGeoreferenced:false,
  note:"Official EUMETSAT Europe stream. Frames nominally every 10 minutes with ~30-minute delay. No API uptime guarantee.",
});
export interface MeteosatWmsLayer { id:string; title:string; timeDimension?:string; }
export interface MeteosatMapOptions{
  layer:string;
  bounds3857:BBox;
  width:number;
  height:number;
  /** If omitted, server chooses its own default time. Never infer timestamp. */
  time?:Date|string;
  format?:"image/png"|"image/jpeg";
}
export interface MeteosatMapDescriptor{
  url:string;
  service:"EUMETView WMS";
  layer:string;
  requestedTime:string|null;
  observedAt:null;
  verifiedAvailable:false;
  crs:"EPSG:3857";
  coordinateBounds3857:BBox;
  width:number;height:number;
}
/** Uses WMS 1.1.1 for unambiguous EPSG:3857 x/y axis order. */
export function meteosatWmsMapUrl(options:MeteosatMapOptions):MeteosatMapDescriptor{
  const {width,height,bounds3857,layer}=options;
  boundedImageDimensions(width,height,2048*2048);
  if(!/^[a-zA-Z0-9_:\-\.]+$/.test(layer)||layer.length>180)throw new RangeError("Invalid WMS layer name");
  if(bounds3857.length!==4||bounds3857.some(x=>!Number.isFinite(x))||
    bounds3857[0]!>=bounds3857[2]!||bounds3857[1]!>=bounds3857[3]!)
    throw new RangeError("Invalid projected bounding box");
  const time=options.time===undefined?null:assertUtcDate(options.time);
  const params=new URLSearchParams({
    SERVICE:"WMS",VERSION:"1.1.1",REQUEST:"GetMap",LAYERS:layer,
    STYLES:"",SRS:"EPSG:3857",
    BBOX:bounds3857.join(","),WIDTH:String(width),HEIGHT:String(height),
    FORMAT:options.format??"image/png",TRANSPARENT:"TRUE",
  });
  if(time)params.set("TIME",time);
  return {url:EUMETVIEW_WMS+"?"+params.toString(),service:"EUMETView WMS",
    layer,requestedTime:time,observedAt:null,verifiedAvailable:false,
    crs:"EPSG:3857",coordinateBounds3857:bounds3857,width,height};
}
export class MeteosatClient{
  constructor(private readonly options:BoundedHttpOptions={}){}
  /** Read actual provider capabilities; never hardcode guesses about deployed layers. */
  async capabilities():Promise<{layers:MeteosatWmsLayer[];fetchedAt:string;endpoint:string}>{
    const url=EUMETVIEW_WMS+"?"+new URLSearchParams({SERVICE:"WMS",REQUEST:"GetCapabilities",VERSION:"1.1.1"});
    const {bytes}=await boundedProviderGet(url,{...this.options,maxBytes:this.options.maxBytes??4*1024*1024});
    const xml=new TextDecoder().decode(bytes);
    if(!/<(?:WMT_MS_Capabilities|WMS_Capabilities)\b/i.test(xml))throw new Error("Provider did not return WMS capabilities XML");
    // Name/Title pairs are advisory. WMS nested Layer structures are not fully
    // parsed without an XML parser, so consumers must validate chosen IDs.
    const layers:MeteosatWmsLayer[]=[];
    const names=[...xml.matchAll(/<Name>\s*([^<]{1,180})\s*<\/Name>/gi)];
    for(const n of names){
      const id=n[1]!.trim();
      if(!id||layers.some(l=>l.id===id)||layers.length>=1500)continue;
      layers.push({id,title:id});
    }
    return {layers,fetchedAt:new Date().toISOString(),endpoint:EUMETVIEW_WMS};
  }
  mapUrl(options:MeteosatMapOptions):MeteosatMapDescriptor{return meteosatWmsMapUrl(options);}
  async fetchMap(options:MeteosatMapOptions):Promise<{image:Uint8Array;contentType:string;descriptor:MeteosatMapDescriptor}>{
    const descriptor=this.mapUrl(options);
    const response=await boundedProviderGet(descriptor.url,{...this.options,maxBytes:this.options.maxBytes??8*1024*1024});
    if(!/image\/(png|jpeg|jpg)/i.test(response.contentType))
      throw new Error("EUMETView returned a non-image WMS response (layer/time/CRS may be unsupported)");
    return {image:response.bytes,contentType:response.contentType,descriptor};
  }
}
