import type { StacItem, StacClient } from "../providers/stac.js";
import type { PlanetaryComputerClient } from "../providers/planetary-computer.js";
import { inspectEoProduct, selectEoAssets } from "../eo/products.js";
import { sceneDatetime } from "../eo/scenes.js";
import { downloadEoAsset } from "../eo/download.js";
import { isVerifiedImageBytes } from "../providers/image-validation.js";

export type PreviewProvider = "copernicus" | "planetary-computer";
export interface ObservationPreviewRequest {
  provider: PreviewProvider;
  collection: "sentinel-2-l2a" | "sentinel-1-grd" | "landsat-c2-l2" | "cop-dem-glo-30";
  itemId: string;
}
export interface ObservationPreviewOptions {
  /** Exact trusted HTTPS hostnames, configured SERVER-SIDE. Empty means fail closed. */
  allowedHosts: readonly string[];
  fetch?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  /** Optional Planetary Computer signing of its declared asset URL. */
  signPlanetary?: boolean;
}
export interface ObservationPreviewClients {
  copernicus: Pick<StacClient,"item">;
  planetaryComputer: Pick<StacClient,"item">;
  signer?: Pick<PlanetaryComputerClient,"signAsset">;
}
export interface VerifiedObservationPreview {
  provider: PreviewProvider;
  collection: string;
  itemId: string;
  assetKey: string;
  image: Uint8Array;
  byteLength: number;
  contentType: "image/jpeg" | "image/png";
  checkedAt: string;
  /** Provider STAC scene timestamp; not independent sensor validation. */
  catalogAcquiredAt: string | null;
  verifiedAcquisition: false;
  /** Only MIME and binary file signature are checked. No pixel decode or AOI validation. */
  imageDelivered: true;
  decodedPixels: false;
  previewVerified: true;
  source: "stac-asset";
}
function validateRequest(request:ObservationPreviewRequest):void {
  const allowed:Readonly<Record<PreviewProvider,readonly string[]>>={
    copernicus:["sentinel-2-l2a","sentinel-1-grd"],
    "planetary-computer":["landsat-c2-l2","cop-dem-glo-30"],
  };
  if(!Object.hasOwn(allowed,request.provider) ||
     !allowed[request.provider]?.includes(request.collection))
    throw new RangeError("Unsupported preview provider/collection pairing");
  if(typeof request.itemId!=="string"||!request.itemId.trim()||request.itemId.length>300 ||
    /[\x00-\x1f\x7f]/.test(request.itemId))
    throw new RangeError("Invalid STAC item ID");
}
function approvedHosts(hosts:readonly string[]):string[]{
  if(!Array.isArray(hosts)||hosts.length<1||hosts.length>24)
    throw new TypeError("previewAllowedHosts must be a nonempty list of trusted hostnames");
  return hosts.map(h=>{
    if(typeof h!=="string"||!/^([a-z0-9-]+\.)*[a-z0-9-]+$/i.test(h)||h.length>253 ||
      h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local"))
      throw new TypeError("Invalid trusted preview hostname");
    return h.toLowerCase();
  });
}
function ensureLink(href:string,hosts:readonly string[]):void {
  let url:URL;
  try{url=new URL(href);}catch{throw new TypeError("STAC preview asset URL is invalid");}
  if(url.protocol!=="https:"||url.port||url.username||url.password||
    !hosts.includes(url.hostname.toLowerCase()))
    throw new TypeError("Preview asset origin is not explicitly allowed");
}
/** 
 * Fetch one specific STAC item from a known provider, select declared preview,
 * verify actual bounded image bytes, and keep signed asset links out of output.
 * No STAC URL provided by a public caller is ever used as the catalog endpoint.
 */
export async function fetchVerifiedObservationPreview(
  clients:ObservationPreviewClients,
  request:ObservationPreviewRequest,
  options:ObservationPreviewOptions,
  now:()=>Date=()=>new Date(),
):Promise<VerifiedObservationPreview>{
  validateRequest(request);
  const hosts=approvedHosts(options.allowedHosts);
  const maxBytes=options.maxBytes??3*1024*1024;
  const timeoutMs=options.timeoutMs??12_000;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>8*1024*1024)
    throw new RangeError("Preview maxBytes must be 1..8388608");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30_000)
    throw new RangeError("Preview timeoutMs must be 1..30000");
  const catalog=request.provider==="copernicus"?clients.copernicus:clients.planetaryComputer;
  // Avoid forwarding raw provider errors, which may include URLs or tokens.
  let item:StacItem;
  try{item=await catalog.item(request.collection,request.itemId);}
  catch{throw new Error("STAC item lookup failed");}
  if(item?.type!=="Feature"||item.id!==request.itemId||
     (item.collection!==undefined&&item.collection!==request.collection))
    throw new Error("STAC item identity does not match the requested observation");
  const product=inspectEoProduct(item);
  const previews=selectEoAssets(product,"preview").filter(asset=>
    asset.kind==="preview"||asset.kind==="rgb");
  // TIFF / COG is a science raster and must go through raster-specific APIs.
  const candidate=previews.find(asset=>!asset.mediaType ||
    /^image\/(png|jpeg|jpg)(?:\s*;|\s*$)/i.test(asset.mediaType));
  if(!candidate)throw new Error("Selected observation declares no supported JPEG/PNG preview");
  let asset={...candidate};
  if(request.provider==="planetary-computer"&&options.signPlanetary){
    if(!clients.signer)throw new Error("Planetary Computer signer is not configured");
    // The signer is OpenLaunch's official provider adapter, never a generic URL proxy.
    try{
      const signed=await clients.signer.signAsset({
        href:asset.href,
        ...(asset.mediaType?{type:asset.mediaType}:{}),
        roles:[...asset.roles],
      });
      asset={...asset,href:signed.href};
    }catch{throw new Error("Provider preview signing failed");}
  }
  ensureLink(asset.href,hosts);
  let response:Awaited<ReturnType<typeof downloadEoAsset>>;
  try{
    response=await downloadEoAsset(asset,{
      allowedHosts:hosts,maxBytes,timeoutMs,
      ...(options.fetch?{fetch:options.fetch}:{}),
    });
  }catch(error){
    if(error instanceof RangeError)throw error;
    throw new Error("Preview download failed or remote asset unavailable");
  }
  const mime=response.contentType.split(";")[0]?.trim().toLowerCase();
  if(mime!=="image/png"&&mime!=="image/jpeg"&&mime!=="image/jpg")
    throw new Error("STAC preview is not a supported PNG/JPEG response");
  if(!isVerifiedImageBytes(response.bytes,mime))
    throw new Error("STAC preview image signature does not match Content-Type");
  const date=sceneDatetime(item);
  return {
    provider:request.provider,collection:request.collection,itemId:item.id,
    assetKey:asset.key,image:response.bytes,byteLength:response.byteLength,
    contentType:mime==="image/png"?"image/png":"image/jpeg",
    checkedAt:now().toISOString(),
    catalogAcquiredAt:date?.toISOString()??null,verifiedAcquisition:false,
    imageDelivered:true,decodedPixels:false,previewVerified:true,source:"stac-asset",
  };
}
