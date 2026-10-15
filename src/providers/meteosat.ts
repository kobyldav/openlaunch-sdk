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
export interface MeteosatTimelineOptions extends Omit<MeteosatMapOptions,"layer"|"time"> {
  layer: string;
  /** Number of advertised timestamps to return, oldest first, at most 48. */
  maxFrames?: number;
}
export interface MeteosatTimelineFrame {
  /** From WMS GetCapabilities Time dimension, NOT proof of image capture. */
  advertisedTime: string;
  acquiredAt: null;
  verifiedAvailable: false;
  request: MeteosatMapDescriptor;
}
export interface MeteosatFrameTimeline {
  provider: "EUMETView WMS";
  layer: string;
  checkedAt: string;
  status: "advertised" | "no-time-dimension" | "unparseable-times";
  frames: MeteosatTimelineFrame[];
  verifiedAcquisition: false;
  caveats: readonly string[];
}

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
    const layers=parseMeteosatCapabilities(xml);
    return {layers,fetchedAt:new Date().toISOString(),endpoint:EUMETVIEW_WMS};
  }
  /** Only timestamps declared by current provider capabilities; never synthesize live frames. */
  async timeline(options:MeteosatTimelineOptions):Promise<MeteosatFrameTimeline>{
    const maxFrames=options.maxFrames??12;
    if(!Number.isInteger(maxFrames)||maxFrames<1||maxFrames>48)
      throw new RangeError("Meteosat maxFrames must be 1..48");
    const result=await this.capabilities();
    const layer=result.layers.find(item=>item.id===options.layer);
    if(!layer)throw new RangeError("Requested Meteosat layer is not in current WMS capabilities");
    const checkedAt=result.fetchedAt;
    const advertisedTimes=layer.timeDimension
      ? meteosatAdvertisedTimes(layer.timeDimension,maxFrames,new Date(checkedAt)) : [];
    const frames=advertisedTimes.map(time=>({
      advertisedTime:time,acquiredAt:null as null,verifiedAvailable:false as false,
      request:this.mapUrl({
        layer:layer.id,bounds3857:options.bounds3857,width:options.width,height:options.height,
        ...(options.format?{format:options.format}:{}),
        time,
      }),
    }));
    return {
      provider:"EUMETView WMS",layer:layer.id,checkedAt,verifiedAcquisition:false,
      status:!layer.timeDimension?"no-time-dimension":frames.length?"advertised":"unparseable-times",
      frames,
      caveats:[
        "Time dimension lists service-advertised dates, not verified actual satellite acquisition times.",
        "Each GetMap frame may still fail or return delayed imagery; verify desired frames explicitly.",
        "CORS, WMS quotas and image licensing are controlled by EUMETSAT.",
      ],
    };
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

/** Bounded WMS 1.1.1 layer/time parser. Layer names and TIME are kept separate. */
export function parseMeteosatCapabilities(xml:string):MeteosatWmsLayer[]{
  if(xml.length>4*1024*1024)throw new RangeError("WMS capabilities XML exceeds 4 MiB");
  if(/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml))throw new Error("XML declarations with external entities are not supported");
  if(!/<(?:[A-Za-z_][\w.-]*:)?(?:WMT_MS_Capabilities|WMS_Capabilities)\b/.test(xml))
    throw new Error("Provider did not return WMS capabilities XML");
  const body=xml.replace(/<!--[\s\S]*?-->/g,"");
  interface LayerNode {id?:string;title?:string;time?:string;parent?:LayerNode;}
  interface TagNode {tag:string;attrs:Record<string,string>;text:string;layer?:LayerNode;}
  const layers:LayerNode[]=[];
  const stack:TagNode[]=[];
  const entities=(s:string):string=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,m=>{
    const known:Record<string,string>={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"};
    if(known[m.toLowerCase()])return known[m.toLowerCase()]!;
    const base=m.slice(2,3).toLowerCase()==="x"?16:10;
    const raw=base===16?m.slice(3,-1):m.slice(2,-1);
    const val=parseInt(raw,base);
    return val>0&&val<=0x10ffff?String.fromCodePoint(val):"";
  });
  let tokens=0;
  function finish(node:TagNode,parent:TagNode|undefined):void{
    if(!parent?.layer)return;
    const value=entities(node.text.trim());
    if(node.tag==="name"&&value.length<=180)parent.layer.id=value;
    if(node.tag==="title"&&value.length<=500)parent.layer.title=value;
    if((node.tag==="extent"||node.tag==="dimension")&&node.attrs.name?.toLowerCase()==="time"&&value.length<=65536)
      parent.layer.time=value;
  }
  for(const token of body.match(/<[^>]*>|[^<]+/g)??[]){
    if(++tokens>150000)throw new RangeError("WMS capabilities XML has too many elements");
    if(!token.startsWith("<")){
      const top=stack[stack.length-1];
      if(top&&["name","title","extent","dimension"].includes(top.tag)){
        top.text+=token;
        if(top.text.length>65536)throw new RangeError("WMS property exceeds safe length");
      }
      continue;
    }
    if(/^<\?/.test(token)||/^<!/.test(token))continue;
    const closing=token.startsWith("</");
    const match=/^<\/?([A-Za-z_][\w.:-]*)/.exec(token);
    if(!match)throw new Error("Malformed WMS XML tag");
    const tag=match[1]!.split(":").pop()!.toLowerCase();
    if(closing){
      const node=stack.pop();
      if(!node||node.tag!==tag)throw new Error("Mismatched WMS XML tags");
      finish(node,stack[stack.length-1]);
      continue;
    }
    const attrs:Record<string,string>={};
    for(const a of token.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(["'])(.*?)\2/g))
      attrs[a[1]!.toLowerCase()]=entities(a[3]!);
    const parentLayer=[...stack].reverse().find(n=>n.layer)?.layer;
    const node:TagNode={tag,attrs,text:""};
    if(tag==="layer"){
      const item:LayerNode={parent:parentLayer};
      node.layer=item;
      layers.push(item);
      if(layers.length>2000)throw new RangeError("Too many WMS layers");
    }
    if(/\/>\s*$/.test(token))finish(node,stack[stack.length-1]);
    else stack.push(node);
    if(stack.length>100)throw new RangeError("WMS XML nesting too deep");
  }
  if(stack.length)throw new Error("Incomplete WMS capabilities XML");
  const unique=new Map<string,MeteosatWmsLayer>();
  for(const l of layers){
    if(!l.id||!/^[A-Za-z0-9_:.-]{1,180}$/.test(l.id))continue;
    let inherited:LayerNode|undefined=l;
    while(inherited&&!inherited.time)inherited=inherited.parent;
    if(!unique.has(l.id)){
      const time=inherited?.time;
      unique.set(l.id,{id:l.id,title:l.title??l.id,...(time?{timeDimension:time}:{})});
    }
    if(unique.size>=1500)break;
  }
  return [...unique.values()];
}

/** Parse exact UTC dates and fixed ISO-8601 WMS intervals with bounded output. */
export function meteosatAdvertisedTimes(dimension:string,maxFrames=12,asOf:Date=new Date()):string[]{
  if(!Number.isInteger(maxFrames)||maxFrames<1||maxFrames>48)throw new RangeError("maxFrames must be 1..48");
  if(!Number.isFinite(asOf.getTime()))throw new RangeError("Invalid WMS time reference");
  if(dimension.length>65536)throw new RangeError("WMS time dimension too large");
  const iso=/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d))?$/;
  const parse=(value:string):number|null=>{
    if(!iso.test(value))return null;
    const time=new Date(value).getTime();
    return Number.isFinite(time)?time:null;
  };
  const interval=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
  const times=new Set<number>();
  for(const raw of dimension.split(",").slice(0,5000)){
    const part=raw.trim();
    const pieces=part.split("/");
    if(pieces.length===1){
      const t=parse(part);
      if(t!==null&&t<=asOf.getTime())times.add(t);
      continue;
    }
    if(pieces.length!==3)continue;
    const start=parse(pieces[0]!),end=parse(pieces[1]!);
    const stepMatch=interval.exec(pieces[2]!);
    if(start===null||end===null||end<start||!stepMatch)continue;
    const step=((Number(stepMatch[1]??0)*86400)+(Number(stepMatch[2]??0)*3600)+
      (Number(stepMatch[3]??0)*60)+Number(stepMatch[4]??0))*1000;
    if(!Number.isSafeInteger(step)||step<1000||step>31*86400*1000)continue;
    const final=Math.min(end,asOf.getTime());
    if(final<start)continue;
    const lastIndex=Math.floor((final-start)/step);
    for(let i=Math.max(0,lastIndex-maxFrames+1);i<=lastIndex;i++)times.add(start+i*step);
  }
  return [...times].sort((a,b)=>a-b).slice(-maxFrames).map(t=>new Date(t).toISOString());
}
