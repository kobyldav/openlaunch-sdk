import { isVerifiedImageBytes } from "../providers/image-validation.js";
import { buildWebMapDaily, type WebMapClients, type WebMapDailyLayer } from "./web-map.js";

/** One NASA GIBS XYZ tile, not a satellite acquisition or complete daily scene. */
export interface WebMapDailyTileRequest {
  layer:WebMapDailyLayer;
  date:Date|string;
  z:number;
  x:number;
  y:number;
}
export interface WebMapDailyTileOptions {
  fetch?:typeof fetch;
  /** Strict streamed response limit. Default 512 KiB, max 2 MiB. */
  maxBytes?:number;
  /** Overall network and body-read timeout. Default 8 seconds, max 30 seconds. */
  timeoutMs?:number;
}
export type WebMapDailyTileStatus="available"|"missing"|"unavailable"|"invalid";
export type WebMapDailyTileReason="ok"|"not-found"|"upstream-error"|
  "network-error"|"timeout"|"too-large"|"invalid-image";
export interface WebMapDailyTileResult {
  layer:WebMapDailyLayer;
  provider:"nasa-gibs";
  requestedDate:string;
  z:number;
  x:number;
  y:number;
  status:WebMapDailyTileStatus;
  reason:WebMapDailyTileReason;
  checkedAt:string;
  /** Only MIME+signature and binary delivery are verified, not Earth observation timing. */
  imageVerified:boolean;
  verifiedAcquisition:false;
  observedAt:null;
  contentType:"image/jpeg"|"image/png"|null;
  byteLength:number;
  image:Uint8Array|null;
  attribution:"NASA EOSDIS GIBS";
}

/**
 * Download and validate exactly one official daily NASA GIBS tile.
 * The caller only controls whitelisted layer, date and bounded XYZ integers.
 * No arbitrary URLs, redirects, raw upstream errors or credentials escape.
 * A real JPEG can be a no-data tile; this does not prove physical acquisition.
 */
export async function fetchWebMapDailyTile(
 clients:Pick<WebMapClients,"nasaDailyTiles">,
 request:WebMapDailyTileRequest,
 options:WebMapDailyTileOptions={},
):Promise<WebMapDailyTileResult> {
 const descriptor=buildWebMapDaily(clients,request);
 const {z,x,y}=request;
 if(!Number.isSafeInteger(z)||z<0||z>descriptor.maxZoom||
    !Number.isSafeInteger(x)||x<0||x>=2**z||
    !Number.isSafeInteger(y)||y<0||y>=2**z)
   throw new RangeError("NASA GIBS XYZ coordinates must fit the selected zoom");
 const maxBytes=options.maxBytes??512*1024;
 const timeoutMs=options.timeoutMs??8_000;
 if(!Number.isSafeInteger(maxBytes)||maxBytes<8||maxBytes>2*1024*1024)
   throw new RangeError("maxBytes must be between 8 and 2097152");
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30_000)
   throw new RangeError("timeoutMs must be between 1 and 30000");
 const stamp=()=>new Date().toISOString();
 const create=(status:WebMapDailyTileStatus,reason:WebMapDailyTileReason,
   bytes:Uint8Array|null=null,contentType:"image/jpeg"|"image/png"|null=null):WebMapDailyTileResult=>({
   layer:request.layer,provider:"nasa-gibs",requestedDate:descriptor.requestedDate,
   z,x,y,status,reason,checkedAt:stamp(),imageVerified:status==="available",
   verifiedAcquisition:false,observedAt:null,contentType,byteLength:bytes?.byteLength??0,
   image:bytes,attribution:"NASA EOSDIS GIBS",
 });
 const raw=descriptor.urlTemplate
   .replace("{z}",String(z)).replace("{y}",String(y)).replace("{x}",String(x));
 const url=new URL(raw);
 // Do not trust a provider-supplied URL or allow DNS names with suffix tricks.
 if(url.protocol!=="https:"||url.hostname!=="gibs.earthdata.nasa.gov"||
    url.port||url.username||url.password||url.search||url.hash||
    !url.pathname.startsWith("/wmts/epsg3857/best/")||
    !url.pathname.endsWith(`/${z}/${y}/${x}.jpg`))
   throw new TypeError("Unexpected NASA GIBS tile URL template");
 const fetcher=options.fetch??globalThis.fetch;
 if(typeof fetcher!=="function")return create("unavailable","network-error");
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
   const response=await fetcher(url.href,{
     method:"GET",redirect:"error",signal:controller.signal,
     headers:{Accept:"image/jpeg,image/png"},
   });
   if(response.status===404||response.status===410)return create("missing","not-found");
   if(!response.ok||response.redirected)return create("unavailable","upstream-error");
   const declared=response.headers.get("content-length");
   if(declared!==null){
     const length=Number(declared);
     if(!Number.isSafeInteger(length)||length<0)return create("invalid","invalid-image");
     if(length>maxBytes)return create("invalid","too-large");
   }
   const mime=response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
   if(mime!=="image/jpeg"&&mime!=="image/png")return create("invalid","invalid-image");
   if(!response.body)return create("invalid","invalid-image");
   const reader=response.body.getReader();
   const chunks:Uint8Array[]=[];
   let total=0;
   try{
     while(true){
       const next=await reader.read();
       if(next.done)break;
       if(!next.value)continue;
       total+=next.value.byteLength;
       if(total>maxBytes){
         await reader.cancel("GIBS maximum tile size exceeded").catch(()=>{});
         return create("invalid","too-large");
       }
       chunks.push(next.value);
     }
   } finally{reader.releaseLock();}
   const image=new Uint8Array(total);
   let offset=0;
   for(const chunk of chunks){image.set(chunk,offset);offset+=chunk.byteLength;}
   if(!isVerifiedImageBytes(image,mime))return create("invalid","invalid-image");
   return create("available","ok",image,mime);
 } catch {
   return controller.signal.aborted?create("unavailable","timeout"):create("unavailable","network-error");
 } finally{clearTimeout(timer);}
}
