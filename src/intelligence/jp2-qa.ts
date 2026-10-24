import type {AreaOfInterest} from "../geo/types.js";
import type {StacClient,StacAsset,StacItem} from "../providers/stac.js";
import { inspectEoProduct } from "../eo/products.js";
import { downloadEoAsset } from "../eo/download.js";
import { decodeJp2Raster, reducedJp2Dimensions, type Jp2DecoderBackend, type Jp2RasterReference } from "../eo/jp2.js";
import { analyzeAoiPixelQuality, type AoiPixelQuality } from "../eo/aoi-quality.js";
import { utmZone } from "../eo/utm.js";

export interface Jp2SceneQaRequest {itemId:string;area:AreaOfInterest;}
export interface Jp2SceneQaOptions {
 allowedHosts:readonly string[];
 decoder?:Jp2DecoderBackend;
 fetch?:typeof fetch;
 maxBytes?:number;
 maxPixels?:number;
 /** Bound on original JP2 pixels; max 16,777,216. */
 maxSourcePixels?:number;
 /** Decode at 2^level coarser SCL pixels (0..4); requires codec support. */
 decompositionLevel?:number;
 timeoutMs?:number;
}
export interface Jp2SceneQaResult {
 provider:"copernicus";
 collection:"sentinel-2-l2a";
 itemId:string;
 qaAssetKey:string;
 downloadedBytes:number;
 imageFormat:"JP2";
 decodedSamples:number;
 decompositionLevel:number;
 effectivePixelScale:number;
 decodedWidth:number;
 decodedHeight:number;
 catalogAcquiredAt:string|null;
 quality:AoiPixelQuality;
 linkedFromStacItem:true;
 independentlyVerifiedSceneAssociation:false;
 sourceSceneVerified:false;
 warnings:readonly string[];
}
function requireTrustedHosts(hosts:readonly string[]):string[] {
 if(!Array.isArray(hosts)||hosts.length<1||hosts.length>24)
   throw new TypeError("jp2AllowedHosts must be a nonempty server-configured allowlist");
 return hosts.map(h=>{
  if(typeof h!=="string"||h.length>253||!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(h)||
    /^[\d.]+$/.test(h)||h.endsWith(".local"))
    throw new TypeError("Untrusted JP2 hostname");
  return h.toLowerCase();
 });
}
function projection(asset:StacAsset):Jp2RasterReference {
 // For native SCL 20 m this metadata MUST be on the asset. Scene-level
 // 10 m geometry cannot be silently reused for a different resolution band.
 const epsg=asset["proj:epsg"],shape=asset["proj:shape"],transform=asset["proj:transform"];
 if(typeof epsg!=="number"||!Number.isInteger(epsg)||(epsg!==4326&&epsg!==3857&&!utmZone(`EPSG:${epsg}`)))
   throw new RangeError("JP2 QA asset lacks supported explicit proj:epsg");
 if(!Array.isArray(shape)||shape.length!==2||!shape.every(x=>Number.isSafeInteger(x)&&x>0))
   throw new RangeError("JP2 QA asset requires exact proj:shape");
 if(!Array.isArray(transform)||transform.length!==6||!transform.every(x=>typeof x==="number"&&Number.isFinite(x)))
   throw new RangeError("JP2 QA asset requires exact proj:transform");
 const sh=shape as number[],tr=transform as number[];
 return {crs:`EPSG:${epsg}`,shape:[sh[0]!,sh[1]!],
   transform:[tr[0]!,tr[1]!,tr[2]!,tr[3]!,tr[4]!,tr[5]!]};
}
export async function analyzeStacJp2Qa(
 stac:Pick<StacClient,"item">,request:Jp2SceneQaRequest,options:Jp2SceneQaOptions
):Promise<Jp2SceneQaResult> {
 if(typeof request.itemId!=="string"||!request.itemId.trim()||
    request.itemId.length>300||/[\x00-\x1f\x7f]/.test(request.itemId))
   throw new RangeError("Invalid STAC scene ID");
 const allowed=requireTrustedHosts(options.allowedHosts);
 if(!options.decoder)throw new TypeError("JP2 codec adapter must be configured on backend");
 let item:StacItem;
 try{item=await stac.item("sentinel-2-l2a",request.itemId);}
 catch{throw new Error("Official STAC JP2 scene lookup failed");}
 if(item?.type!=="Feature"||item.id!==request.itemId||item.collection!=="sentinel-2-l2a")
   throw new Error("STAC JP2 scene identity mismatch");
 const entries=Object.entries(item.assets??{}).filter(([key])=>
   ["scl","scl_20m","scl-20m"].includes(key.toLowerCase()));
 if(entries.length!==1)throw new Error("STAC scene has missing or ambiguous SCL asset");
 const [key,asset]=entries[0]!;
 let url:URL;
 try{url=new URL(asset.href);}catch{throw new TypeError("Malformed JP2 asset URL");}
 const mime=asset.type?.split(";")[0]?.trim().toLowerCase();
 if(url.protocol!=="https:"||url.port||url.username||url.password||
    !allowed.includes(url.hostname.toLowerCase())||!/\.jp2$/i.test(url.pathname)||
    (mime!==undefined&&!["image/jp2","image/jpeg2000","application/octet-stream"].includes(mime)))
   throw new TypeError("STAC SCL asset is not a trusted JP2 source");
 const ref=projection(asset);
 const product=inspectEoProduct(item);
 const info=product.assets.find(v=>v.key===key);
 if(!info)throw new Error("STAC JP2 QA asset absent from product");
 const maxBytes=options.maxBytes??2*1024*1024;
 const maxPixels=options.maxPixels??1_048_576;
 const maxSourcePixels=options.maxSourcePixels??16_777_216;
 const level=options.decompositionLevel??0;
 // Check level and original source footprint before fetching remote bytes.
 const scaled=reducedJp2Dimensions(ref.shape[1],ref.shape[0],level);
 // Validate budgets before any remote bytes are requested.
 if(!Number.isSafeInteger(maxBytes)||maxBytes<48||maxBytes>8*1024*1024||
    !Number.isSafeInteger(maxPixels)||maxPixels<1||maxPixels>4_194_304||
    !Number.isSafeInteger(maxSourcePixels)||maxSourcePixels<1||maxSourcePixels>16_777_216)
   throw new RangeError("Invalid JP2 resource budgets");
 if(ref.shape[0]*ref.shape[1]>maxSourcePixels)
   throw new RangeError("STAC JP2 source exceeds maxSourcePixels budget");
 if(scaled.width*scaled.height>maxPixels)
   throw new RangeError("STAC JP2 reduced resolution exceeds output pixel budget");
 let bytes:Uint8Array;
 try {
  const output=await downloadEoAsset(info,{allowedHosts:allowed,maxBytes,
   ...(options.timeoutMs!==undefined?{timeoutMs:options.timeoutMs}:{}),
   ...(options.fetch?{fetch:options.fetch}:{})});
  bytes=output.bytes;
 }catch{throw new Error("JP2 QA download failed or exceeded resource budget");}
 const raster=await decodeJp2Raster(bytes,ref,options.decoder,{maxBytes,maxPixels,maxSourcePixels,decompositionLevel:level});
 const quality=analyzeAoiPixelQuality({mask:raster,area:request.area,source:"sentinel-2-l2a-scl",
   maxPixels});
 const timestamp=item.properties?.datetime;
 const parsed=typeof timestamp==="string"?new Date(timestamp):new Date(NaN);
 return {
  provider:"copernicus",collection:"sentinel-2-l2a",itemId:item.id,qaAssetKey:key,
  downloadedBytes:bytes.length,imageFormat:"JP2",decodedSamples:raster.values.length,
  decompositionLevel:level,effectivePixelScale:scaled.scale,
  decodedWidth:raster.width,decodedHeight:raster.height,
  catalogAcquiredAt:Number.isFinite(parsed.getTime())?parsed.toISOString():null,
  quality,linkedFromStacItem:true,independentlyVerifiedSceneAssociation:false,
  sourceSceneVerified:false,
  warnings:[
    "JP2 SCL pixels were decoded; georeferencing is STAC asset metadata, not independently verified.",
    "STAC link does not cryptographically prove that the image belongs to the satellite scene.",
    "Wavelet resolution reduction changes measured pixel scale; classifications are not native-resolution coverage.",
    "Full JP2 download is still bounded, not an HTTP Range window; oversized Sentinel-2 assets are rejected.",
  ],
 };
}
