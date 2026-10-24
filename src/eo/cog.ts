import type { AreaOfInterest } from "../geo/types.js";
import type { RasterCrs, RasterGrid, RasterTransform } from "./raster.js";
import {
  clipRasterToAoi, lonLatToGridCrs, pixelToWorld,
  validateRaster, worldToPixel,
} from "./raster.js";
import {
  inflateDeflate, readCrs, readSample, readTransform, TiffDirectory,
  undoHorizontalPredictor,
} from "./geotiff.js";

export interface CogReadOptions {
  /** A nonempty list of trusted asset hostnames is required for remote network access. */
  allowedHosts: readonly string[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxMetadataBytes?: number;
  /** Limit the returned cropped raster allocation; default 1,048,576 pixels. */
  maxPixels?: number;
  /** Limit total compressed blocks fetched, default 128. */
  maxBlocks?: number;
  /** Bound each compressed or expanded tile; default 16 MiB. */
  maxBlockBytes?: number;
}
export interface CogReadResult {
  raster: RasterGrid;
  requestedTiles: number;
  metadataBytesRead: number;
  tileBytesRead: number;
  totalSourceBytes: number;
  transferStrategy: "http-byte-ranges";
  warnings: string[];
}

/**
 * Read only the intersecting TIFF strips/tiles from a remotely hosted COG.
 * HTTPS 206 Content-Range is mandatory: a server ignoring Range is rejected.
 *
 * WGS84 UTM 326xx/327xx conversion is supported; no arbitrary projection.
 * Supports single-band classic/BigTIFF,
 * uncompressed/Deflate TIFF strips or tiles, EPSG:4326 / EPSG:3857 only.
 * No multi-band JPEG, LZW, JP2, cloud-native GeoTIFF overviews, or full
 * arbitrary CRS pipeline. Requests a bounded TIFF IFD header then blocks.
 */
export async function readCogWindowUrl(href:string,area:AreaOfInterest,options:CogReadOptions):Promise<CogReadResult>{
  const parsed=new URL(href);
  if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new TypeError("COG source must be a credential-free HTTPS URL");
  if(!Array.isArray(options.allowedHosts)||options.allowedHosts.length===0||
    !options.allowedHosts.includes(parsed.hostname) || isUnsafeHost(parsed.hostname)) {
    throw new TypeError("COG URL hostname must be explicitly trusted via allowedHosts");
  }
  const timeoutMs=options.timeoutMs??20_000;
  const maxMetadataBytes=options.maxMetadataBytes??2*1024*1024;
  const maxPixels=options.maxPixels??1_048_576;
  const maxBlocks=options.maxBlocks??128;
  const maxBlockBytes=options.maxBlockBytes??16*1024*1024;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120_000)throw new RangeError("Invalid timeoutMs");
  if(!Number.isSafeInteger(maxMetadataBytes)||maxMetadataBytes<1024||maxMetadataBytes>8*1024*1024)throw new RangeError("Invalid maxMetadataBytes");
  if(!Number.isSafeInteger(maxPixels)||maxPixels<1||maxPixels>16_777_216)throw new RangeError("Invalid maxPixels");
  if(!Number.isSafeInteger(maxBlocks)||maxBlocks<1||maxBlocks>4096)throw new RangeError("Invalid maxBlocks");
  if(!Number.isSafeInteger(maxBlockBytes)||maxBlockBytes<1024||maxBlockBytes>64*1024*1024)throw new RangeError("Invalid maxBlockBytes");
  const fetchImpl=options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
  if(!fetchImpl)throw new Error("A fetch implementation is required");

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let metadataBytesRead=0,tileBytesRead=0,totalSourceBytes=0;
  try {
    const fetchRange=async(start:number,length:number):Promise<Uint8Array>=>{
      if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(length)||length<1||length>maxBlockBytes)
        throw new RangeError("Invalid or oversized HTTP TIFF byte range");
      const end=start+length-1;
      const response=await fetchImpl(parsed.toString(),{
        method:"GET",redirect:"error",signal:controller.signal,
        headers:{Range:`bytes=${start}-${end}`,Accept:"application/octet-stream,image/tiff;q=0.9"},
      });
      if(response.status!==206)throw new RangeError("Remote COG requires HTTP 206 Partial Content; server ignored Range request");
      const header=response.headers.get("content-range");
      const match=/^bytes (\d+)-(\d+)\/(\d+)$/i.exec(header??"");
      if(!match)throw new RangeError("Missing or malformed Content-Range response");
      const first=Number(match[1]),last=Number(match[2]),total=Number(match[3]);
      if(!Number.isSafeInteger(total)||!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||
        first!==start||last<first||last>end||last>=total)
        throw new RangeError("Invalid Content-Range response for requested TIFF bytes");
      if(totalSourceBytes&&total!==totalSourceBytes)throw new RangeError("COG source size changed between range requests");
      totalSourceBytes=total;
      const declared=response.headers.get("content-length");
      if(declared!==null && Number(declared)>length)throw new RangeError("COG range exceeds requested length");
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length!==last-first+1||bytes.length>length)throw new RangeError("Incorrect HTTP COG ranged response length");
      return bytes;
    };

    let headerSize=Math.min(maxMetadataBytes,64*1024);
    let metadata:Uint8Array|undefined, tiff:TiffDirectory|undefined;
    while(true){
      metadata=await fetchRange(0,Math.min(headerSize,maxBlockBytes));
      metadataBytesRead+=metadata.length;
      try {
        tiff=new TiffDirectory(metadata);
        // Resolve all required IFD-linked arrays while metadata remains available.
        tiff.numbers(33550);tiff.numbers(33922);tiff.numbers(34264);tiff.numbers(34735);
        tiff.numbers(324);tiff.numbers(325);tiff.numbers(273);tiff.numbers(279);
        break;
      }catch(error){
        if(error instanceof RangeError &&
          /outside supplied bytes|Invalid TIFF IFD|Truncated TIFF offset|Truncated BigTIFF offset/i.test(error.message) &&
          metadata.length<totalSourceBytes&&headerSize<maxMetadataBytes){
          headerSize=Math.min(maxMetadataBytes,headerSize*2);
          continue;
        }
        throw error;
      }
    }
    if(!tiff)throw new RangeError("Missing TIFF header");
    const width=tiff.scalar(256),height=tiff.scalar(257);
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw new RangeError("Invalid COG dimensions");
    const bps=tiff.scalar(258,8),samples=tiff.scalar(277,1),format=tiff.scalar(339,1),
      compression=tiff.scalar(259,1),predictor=tiff.scalar(317,1);
    if(samples!==1||tiff.scalar(284,1)!==1)throw new RangeError("Remote COG reader supports single-band strips or tiles only");
    if(![8,16,32,64].includes(bps)||
      !([1,2].includes(format)&&[8,16,32].includes(bps)||format===3&&[32,64].includes(bps)))
      throw new RangeError("Unsupported COG sample format");
    if(![1,8,32946].includes(compression)||![1,2].includes(predictor)||
      (format===3&&predictor===2))throw new RangeError("Unsupported COG compression/predictor");
    const crs=readCrs(tiff),transform=readTransform(tiff);
    const blockWidth=tiff.scalar(322,width),blockHeight=tiff.scalar(323,tiff.scalar(278,height));
    const tiled=tiff.numbers(322)!==undefined;
    if(!(Number.isSafeInteger(blockWidth)&&Number.isSafeInteger(blockHeight)&&blockWidth>0&&blockHeight>0))
      throw new RangeError("Invalid COG tile dimensions");
    const across=Math.ceil(width/blockWidth),down=Math.ceil(height/blockHeight);
    const totalBlocks=across*down;
    if(totalBlocks>1_000_000)throw new RangeError("Too many COG blocks");
    const offsets=tiff.numbers(tiled?324:273),lengths=tiff.numbers(tiled?325:279);
    if(!offsets||!lengths||offsets.length!==totalBlocks||lengths.length!==totalBlocks)
      throw new RangeError("Incorrect TIFF block offset table");
    const bounds=pixelBounds(area,crs,transform,width,height);
    const {c0,c1,r0,r1}=bounds,outWidth=c1-c0,outHeight=r1-r0;
    if(outWidth*outHeight>maxPixels)throw new RangeError("Selected COG window exceeds maxPixels");
    const result=new Float64Array(outWidth*outHeight);
    result.fill(NaN);
    const selected:{i:number;bx:number;by:number}[]=[];
    const firstX=Math.floor(c0/blockWidth),lastX=Math.floor((c1-1)/blockWidth);
    const firstY=Math.floor(r0/blockHeight),lastY=Math.floor((r1-1)/blockHeight);
    for(let by=firstY;by<=lastY;by++)for(let bx=firstX;bx<=lastX;bx++)
      selected.push({i:by*across+bx,bx,by});
    if(selected.length>maxBlocks)throw new RangeError("Selected COG region exceeds maxBlocks; reduce requested area");
    const nodataText=tiff.ascii(42113);
    const nodata=nodataText===undefined?NaN:Number(nodataText.trim());
    let cursor=0;
    // Concurrency 4: avoid thousands of parallel requests while retaining throughput.
    const workers=Array.from({length:Math.min(4,selected.length)},async()=>{
      while(true){
        const current=selected[cursor++];
        if(!current)return;
        const {i,bx,by}=current;
        const offset=offsets[i]!,length=lengths[i]!;
        const decodedHeight=tiled?blockHeight:Math.min(blockHeight,height-by*blockHeight);
        const expected=blockWidth*decodedHeight*bps/8;
        if(!Number.isSafeInteger(expected)||expected>maxBlockBytes)
          throw new RangeError("Expanded COG block exceeds maxBlockBytes");
        if(!Number.isSafeInteger(length)||length<1||length>maxBlockBytes||!Number.isSafeInteger(offset)||offset<0||offset+length>totalSourceBytes)
          throw new RangeError("Invalid COG block byte range");
        const part=await fetchRange(offset,length);
        tileBytesRead+=part.length;
        const inflated=compression===1?part:await inflateDeflate(part,expected);
        if(inflated.length!==expected)throw new RangeError("COG tile decompressed size mismatch");
        const raw=new Uint8Array(inflated);
        if(predictor===2)undoHorizontalPredictor(raw,blockWidth,decodedHeight,bps,tiff!.littleEndian);
        const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
        const cx0=Math.max(c0,bx*blockWidth),cx1=Math.min(c1,(bx+1)*blockWidth,width);
        const ry0=Math.max(r0,by*blockHeight),ry1=Math.min(r1,(by+1)*blockHeight,height);
        for(let row=ry0;row<ry1;row++)for(let col=cx0;col<cx1;col++){
          const local=(row-by*blockHeight)*blockWidth+col-bx*blockWidth;
          const v=readSample(view,local*bps/8,bps,format as 1|2|3,tiff!.littleEndian);
          result[(row-r0)*outWidth+col-c0]=Number.isFinite(nodata)&&v===nodata?NaN:v;
        }
      }
    });
    await Promise.all(workers);
    const [originX,originY]=pixelToWorld(transform,c0,r0);
    const raster:RasterGrid={
      width:outWidth,height:outHeight,crs,
      transform:[originX,transform[1],transform[2],originY,transform[4],transform[5]],
      values:result,source:parsed.origin+parsed.pathname+"#window",unit:"native-sample",
    };
    validateRaster(raster);
    // clipRasterToAoi applies exact polygon-hole mask and may further reduce
    // window to pixel-aligned bounds. For point AOIs return sampled cell.
    const clipped=area.geometry.type==="Point"?raster:clipRasterToAoi(raster,area);
    return {
      raster:clipped,requestedTiles:selected.length,metadataBytesRead,tileBytesRead,totalSourceBytes,
      transferStrategy:"http-byte-ranges",
      warnings:[
        "Returned raster is a bounded window from a provider TIFF, not a resampled cloud-free product.",
        "Native sample values need scale/offset calibration and quality masks before spectral/temperature analysis.",
        "Range reader only supports one band and explicitly supported TIFF encoding/CRS; no JP2/LZW/JPEG.",
      ],
    };
  }finally{clearTimeout(timer);}
}
function pixelBounds(
  area:AreaOfInterest,crs:RasterCrs,transform:RasterTransform,width:number,height:number,
):{c0:number;c1:number;r0:number;r1:number}{
  const [w,s,e,n]=area.bbox;
  if(w>e)throw new RangeError("Antimeridian-crossing AOI requires tiling");
  // Sample the geographic boundary's projected envelope; UTM map edges
  // curve relative to lon/lat and may have extrema away from the 4 corners.
  const positions:[number,number][]=[];
  const steps=area.geometry.type==="Point"?0:8;
  for(let i=0;i<=steps;i++)for(let j=0;j<=steps;j++) {
    const u=steps?i/steps:0,v=steps?j/steps:0;
    positions.push(lonLatToGridCrs(w+(e-w)*u,s+(n-s)*v,crs));
  }
  let cmin=Infinity,cmax=-Infinity,rmin=Infinity,rmax=-Infinity;
  for(const [x,y] of positions){
    const [col,row]=worldToPixel(transform,x,y);
    cmin=Math.min(cmin,col);cmax=Math.max(cmax,col);
    rmin=Math.min(rmin,row);rmax=Math.max(rmax,row);
  }
  if(area.geometry.type==="Point"){
    const col=Math.floor(cmin),row=Math.floor(rmin);
    if(col<0||row<0||col>=width||row>=height)throw new RangeError("AOI is outside the TIFF grid");
    return {c0:col,c1:col+1,r0:row,r1:row+1};
  }
  const snap=(v:number)=>Math.abs(Math.round(v)-v)<1e-9?Math.round(v):v;
  const c0=Math.max(0,Math.floor(snap(cmin))),c1=Math.min(width,Math.ceil(snap(cmax)));
  const r0=Math.max(0,Math.floor(snap(rmin))),r1=Math.min(height,Math.ceil(snap(rmax)));
  if(c0>=c1||r0>=r1)throw new RangeError("AOI does not intersect TIFF raster");
  return {c0,c1,r0,r1};
}
function isUnsafeHost(h:string):boolean {
  const host=h.toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local"))return true;
  if(host.includes(":"))return true; // deny all literal IPv6 addresses for server-side range reads
  const octets=host.split(".");
  if(octets.length!==4||octets.some(v=>!/^\d+$/.test(v)))return false;
  const parts=octets.map(Number);
  const a=parts[0]!,b=parts[1]!;
  return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||
    a===192&&b===168||a===100&&b>=64&&b<=127||a>=224;
}
