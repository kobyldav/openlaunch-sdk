import type { AreaOfInterest } from "../geo/types.js";
import type { StacAsset, StacClient, StacItem } from "../providers/stac.js";
import type { PlanetaryComputerClient } from "../providers/planetary-computer.js";
import {
  analyzeRemoteAoiPixelQuality, type AoiQualityMask, type RemoteAoiPixelQuality,
} from "../eo/aoi-quality.js";

export type LinkedQaProvider = "copernicus" | "planetary-computer";
export interface LinkedQaRequest {
  provider: LinkedQaProvider;
  collection: "sentinel-2-l2a" | "landsat-c2-l2";
  /** Exact STAC ID from exploreObservations(); no caller-supplied asset URL. */
  itemId: string;
  area: AreaOfInterest;
}
export interface LinkedQaOptions {
  /** Explicit backend allowlist. Empty means no QA download. */
  allowedHosts: readonly string[];
  fetch?: typeof fetch;
  maxPixels?: number;
  timeoutMs?: number;
  /** Official Planetary Computer asset signing, if access tokens are necessary. */
  signPlanetary?: boolean;
}
export interface LinkedQaClients {
  copernicus: Pick<StacClient, "item">;
  planetaryComputer: Pick<StacClient, "item">;
  signer?: Pick<PlanetaryComputerClient, "signAsset">;
}
export interface LinkedQaResult {
  provider: LinkedQaProvider;
  collection: LinkedQaRequest["collection"];
  itemId: string;
  qaAssetKey: string;
  maskType: AoiQualityMask;
  catalogAcquiredAt: string | null;
  linkedFromStacItem: true;
  /** STAC item references the mask, but has not independently authenticated pixels. */
  independentlyVerifiedSceneAssociation: false;
  quality: RemoteAoiPixelQuality["quality"];
  downloadedBytes: number;
  requestedBlocks: number;
  transferStrategy: "http-byte-ranges";
  /** Only the QA band bytes are fetched, not an optical preview. */
  verifiedPixelMask: true;
  /** Secrets, source URLs and signed SAS query strings are deliberately omitted. */
  warnings: readonly string[];
}
function cleanId(request:LinkedQaRequest):void {
  if((request.provider==="copernicus"&&request.collection!=="sentinel-2-l2a")||
     (request.provider==="planetary-computer"&&request.collection!=="landsat-c2-l2")||
     !["copernicus","planetary-computer"].includes(request.provider))
    throw new RangeError("No supported STAC QA product for this provider/collection");
  if(typeof request.itemId!=="string"||request.itemId.length<1||
    request.itemId.length>300||/[\x00-\x1f\x7f]/.test(request.itemId))
    throw new RangeError("Invalid STAC item ID");
}
function trustedHosts(allowed:readonly string[]):string[] {
  if(!Array.isArray(allowed)||allowed.length===0||allowed.length>24)
    throw new TypeError("qaAllowedHosts must contain reviewed backend storage hosts");
  return allowed.map(h=>{
    if(typeof h!=="string"||h.length>253||
      !/^(?!-)[a-z0-9-]+(?:\.(?!-)[a-z0-9-]+)*$/i.test(h)||
      h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||
      /^[\d.]+$/.test(h))
      throw new TypeError("Invalid QA storage hostname");
    return h.toLowerCase();
  });
}
function verifyUrl(href:string,allowed:readonly string[]):void{
  let u:URL;
  try{u=new URL(href);}catch{throw new TypeError("Unsupported QA asset URL");}
  if(u.protocol!=="https:"||u.username||u.password||u.port||
    !allowed.includes(u.hostname.toLowerCase()))
    throw new TypeError("QA asset hostname is not trusted");
}
function selectedAsset(item:StacItem,request:LinkedQaRequest):{key:string;asset:StacAsset;source:AoiQualityMask}{
  const source:AoiQualityMask=request.collection==="sentinel-2-l2a"
    ?"sentinel-2-l2a-scl":"landsat-c2-l2-qa-pixel-l89";
  const wanted=request.collection==="sentinel-2-l2a"?new Set(["scl","scl_20m","scl-20m"]):
    new Set(["qa_pixel","qa-pixel"]);
  // Strict key matches, never infer a quality mask from a preview or arbitrary band.
  const candidates=Object.entries(item.assets??{}).filter(([key])=>wanted.has(key.toLowerCase()));
  if(candidates.length!==1)
    throw new Error(candidates.length?"Ambiguous scene QA assets":"STAC scene has no supported QA raster asset");
  const [key,asset]=candidates[0]!;
  const type=typeof asset.type==="string"?asset.type.split(";")[0]!.trim().toLowerCase():"";
  if(type&& !["image/tiff","image/geotiff","application/geotiff","application/octet-stream"].includes(type))
    throw new Error("QA asset is not a supported GeoTIFF/COG");
  let u:URL;
  try{u=new URL(asset.href);}catch{throw new Error("Malformed scene QA link");}
  if(!/\.tiff?$/i.test(u.pathname))
    throw new Error("QA asset is not a TIFF raster; JP2/UTM provider products may need another reader");
  return {key,asset,source};
}
/**
 * Fetch scene from its fixed official provider STAC endpoint, use ONLY the exact
 * QA asset belonging to that STAC item, then securely load limited COG ranges.
 * This is not a general URL proxy and never returns signed asset URLs.
 */
export async function analyzeLinkedObservationQa(
  clients:LinkedQaClients,request:LinkedQaRequest,options:LinkedQaOptions,
):Promise<LinkedQaResult>{
  cleanId(request);
  const allowed=trustedHosts(options.allowedHosts);
  const catalog=request.provider==="copernicus"?clients.copernicus:clients.planetaryComputer;
  let item:StacItem;
  try{item=await catalog.item(request.collection,request.itemId);}
  catch{throw new Error("Official STAC QA scene lookup failed");}
  if(item?.type!=="Feature"||item.id!==request.itemId||item.collection!==request.collection)
    throw new Error("Official STAC scene identity does not match requested observation");
  const chosen=selectedAsset(item,request);
  // Validate BEFORE signing so metadata URLs cannot cause arbitrary signer calls.
  verifyUrl(chosen.asset.href,allowed);
  let href=chosen.asset.href;
  if(options.signPlanetary&&request.provider==="planetary-computer"){
    if(!clients.signer)throw new Error("QA signing is not configured");
    try{const signed=await clients.signer.signAsset(chosen.asset);href=signed.href;}
    catch{throw new Error("Official QA signing failed");}
    verifyUrl(href,allowed);
  }
  let output:RemoteAoiPixelQuality;
  try{
    output=await analyzeRemoteAoiPixelQuality({
      href,area:request.area,source:chosen.source,allowedHosts:allowed,
      ...(options.fetch?{fetch:options.fetch}:{}),
      ...(options.maxPixels!==undefined?{maxPixels:options.maxPixels}:{}),
      ...(options.timeoutMs!==undefined?{timeoutMs:options.timeoutMs}:{}),
    });
  }catch{throw new Error("Linked QA GeoTIFF unavailable or cannot be decoded safely");}
  const date=item.properties?.datetime??item.properties?.start_datetime;
  const parsed=typeof date==="string"?new Date(date):new Date(NaN);
  return {
    provider:request.provider,collection:request.collection,itemId:item.id,
    qaAssetKey:chosen.key,maskType:chosen.source,
    catalogAcquiredAt:Number.isFinite(parsed.getTime())?parsed.toISOString():null,
    linkedFromStacItem:true,independentlyVerifiedSceneAssociation:false,
    quality:output.quality,downloadedBytes:output.downloadedBytes,
    requestedBlocks:output.remoteBlocks,transferStrategy:output.transferStrategy,
    verifiedPixelMask:true,
    warnings:[
      "QA asset is declared by the matching STAC item; scene-to-file identity is not independently authenticated.",
      "Observed pixel classes do not verify sensor acquisition or native scene color quality.",
      "Only preapproved single-band GeoTIFF in EPSG:4326/3857 and supported compression can be decoded.",
    ],
  };
}
