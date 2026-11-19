import {createTerrainRpcCamera,type TerrainRpc} from "./camera.js";
import {decodeTerrainTiff,TiffDirectory} from "../eo/geotiff.js";
import type {TerrainImage} from "./reconstruct.js";

/** RPC00B GeoTIFF tag 50844, ordered per GeoTIFF RPC specification. */
export function readTerrainRpcTag(bytes:Uint8Array):TerrainRpc {
  const a=new TiffDirectory(bytes).numbers(50844);
  if(!a||a.length!==92||a.some(v=>!Number.isFinite(v)))throw new RangeError("Missing or invalid RPC00B TIFF tag");
  const r:TerrainRpc={lineOffset:a[2]!,sampleOffset:a[3]!,latitudeOffset:a[4]!,longitudeOffset:a[5]!,heightOffset:a[6]!,lineScale:a[7]!,sampleScale:a[8]!,latitudeScale:a[9]!,longitudeScale:a[10]!,heightScale:a[11]!,lineNumerator:a.slice(12,32),lineDenominator:a.slice(32,52),sampleNumerator:a.slice(52,72),sampleDenominator:a.slice(72,92)};
  createTerrainRpcCamera(r);return r;
}
/** Read numeric DigitalGlobe/ASP RPB XML or standard RPC00B XML tags.
 * No external entity expansion. Pixel origin explicitly configurable. */
export function parseTerrainRpcXml(xml:string,options:{pixelOrigin?:0|1}={}):TerrainRpc {
  if(xml.length>32_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new RangeError("Unsafe or oversized camera XML");
  const rpb=xml.match(/<RPB(?:\s[^>]*)?>([\s\S]*?)<\/RPB>/i)?.[1]??xml;
  const tag=(name:string)=>rpb.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([^<]*)<\\/"+name+">","i"))?.[1]?.trim();
  const nums=(v:string)=>v.trim().split(/[\s,]+/).map(Number);
  const number=(...names:string[])=>{for(const name of names){const s=tag(name);if(s&&Number.isFinite(Number(s)))return Number(s);}throw new RangeError("Missing RPC "+names[0]);};
  const vector=(standard:string,asp:string)=>{for(const name of [standard,asp]){const v=tag(name);if(v){const a=nums(v);if(a.length===20&&a.every(Number.isFinite))return a;}}const a=Array.from({length:20},(_,i)=>number(standard+"_"+(i+1)));return a;};
  const offset=options.pixelOrigin??0;if(offset!==0&&offset!==1)throw new RangeError("Invalid pixel origin");
  const r:TerrainRpc={lineOffset:number("LINE_OFF","LINEOFFSET")-offset,sampleOffset:number("SAMP_OFF","SAMPOFFSET")-offset,latitudeOffset:number("LAT_OFF","LATOFFSET"),longitudeOffset:number("LONG_OFF","LONGOFFSET"),heightOffset:number("HEIGHT_OFF","HEIGHTOFFSET"),lineScale:number("LINE_SCALE","LINESCALE"),sampleScale:number("SAMP_SCALE","SAMPSCALE"),latitudeScale:number("LAT_SCALE","LATSCALE"),longitudeScale:number("LONG_SCALE","LONGSCALE"),heightScale:number("HEIGHT_SCALE","HEIGHTSCALE"),lineNumerator:vector("LINE_NUM_COEFF","LINENUMCOEF"),lineDenominator:vector("LINE_DEN_COEFF","LINEDENCOEF"),sampleNumerator:vector("SAMP_NUM_COEFF","SAMPNUMCOEF"),sampleDenominator:vector("SAMP_DEN_COEFF","SAMPDENCOEF")};
  createTerrainRpcCamera(r);return r;
}
export async function loadTerrainRpcImage(bytes:Uint8Array,source:string,options:{rpc?:TerrainRpc;xml?:string;pixelOrigin?:0|1;zeroIsNoData?:boolean;maxPixels?:number}={}):Promise<{image:TerrainImage;rpc:TerrainRpc}>{
  if(options.rpc&&options.xml)throw new RangeError("Supply only one camera calibration");
  const rpc=options.rpc??(options.xml!==undefined?parseTerrainRpcXml(options.xml,{pixelOrigin:options.pixelOrigin??0}):readTerrainRpcTag(bytes));
  const raw=await decodeTerrainTiff(bytes,{maxPixels:options.maxPixels??33_554_432,maxInputBytes:256*1024*1024});
  if(options.zeroIsNoData)for(let i=0;i<raw.values.length;i++)if(raw.values[i]===0)raw.values[i]=NaN;
  return {image:{...raw,source,camera:createTerrainRpcCamera(rpc)},rpc};
}
