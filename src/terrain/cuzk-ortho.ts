import type {AreaOfInterest} from "../geo/types.js";
import type {RasterGrid} from "../eo/raster.js";
import {inflateDeflate} from "../eo/geotiff.js";

/** Official public 3857 map display service; native ČÚZK Ortofoto pixels are 0.125 m. */
export const CUZK_ORTHO_SERVICE="https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer";
export const CUZK_ORTHO_NATIVE_RESOLUTION_M=0.125;
export const CUZK_ORTHO_ATTRIBUTION="© ČÚZK — Ortofoto ČR, CC BY 4.0";
const MAX_BYTES=16*1024*1024;
const MAX_PIXELS=1_048_576;
export interface CuzkOrthoTexture{
  width:number;height:number;rgba:Uint8Array;validPixels:number;
  groundResolutionM:number;sourceNativeResolutionM:number;
  source:string;attribution:string;licenceUrl:string;
}
export interface CuzkOrthoOptions{fetch?:typeof fetch;timeoutMs?:number;}
export function cuzkOrthoExportUrl(grid:Pick<RasterGrid,"width"|"height"|"crs"|"transform">):string{
  if(grid.crs!=="EPSG:3857"||!Number.isInteger(grid.width)||!Number.isInteger(grid.height)||
    grid.width<2||grid.height<2||grid.width>1024||grid.height>1024||
    grid.width*grid.height>MAX_PIXELS)throw new RangeError("Ortho export requires <=1024px EPSG:3857 bounded grid");
  const t=grid.transform;
  if(!(t[1]>0)||!(t[5]<0)||t[2]!==0||t[4]!==0)throw new RangeError("Ortho export requires north-up grid");
  const xmin=t[0],xmax=xmin+t[1]*grid.width,ymax=t[3],ymin=ymax+t[5]*grid.height;
  if(![xmin,xmax,ymin,ymax].every(Number.isFinite))throw new RangeError("Nonfinite ortho bbox");
  const url=new URL(CUZK_ORTHO_SERVICE+"/export");
  url.search=new URLSearchParams({
    f:"image",bbox:[xmin,ymin,xmax,ymax].join(","),
    bboxSR:"3857",imageSR:"3857",size:grid.width+","+grid.height,
    format:"png32",transparent:"true",dpi:"96"
  }).toString();
  return url.toString();
}
async function boundedBytes(response:Response):Promise<Uint8Array>{
  const contentLength=Number(response.headers.get("content-length")??0);
  if(Number.isFinite(contentLength)&&contentLength>MAX_BYTES)throw new RangeError("Ortho download exceeds 16 MiB");
  if(!response.body)throw new Error("Empty ortho image response");
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_BYTES){await reader.cancel();throw new RangeError("Ortho PNG too large");}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let off=0;
  for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.length;}
  return bytes;
}
const CRC_TABLE=Uint32Array.from({length:256},(_,i)=>{
  let crc=i;for(let j=0;j<8;j++)crc=crc&1?(0xedb88320^(crc>>>1)):(crc>>>1);
  return crc>>>0;
});
function crc32(data:Uint8Array):number{
  let crc=0xffffffff;
  for(const x of data)crc=CRC_TABLE[(crc^x)&255]!^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
/** Strict 8-bit RGB/RGBA PNG decoder; supports PNG row filter 0..4 and zlib.
 * No Canvas, HTML browser API, third-party image dependency or JPEG needed.
 */
export async function decodeCuzkOrthoPng(bytes:Uint8Array):Promise<{width:number;height:number;rgba:Uint8Array;validPixels:number}>{
  if(bytes.length<45||bytes.length>MAX_BYTES||
    bytes.subarray(0,8).some((b,i)=>b!==[137,80,78,71,13,10,26,10][i]))
    throw new Error("Ortho response is not a bounded PNG");
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let width=0,height=0,channels=0,seenIHDR=false,seenIEND=false;
  const compressed:Uint8Array[]=[];let bytesTotal=0;
  for(let pos=8;pos<bytes.length;){
    if(pos+12>bytes.length)throw new Error("Truncated PNG chunk");
    const len=view.getUint32(pos,false),end=pos+12+len;
    if(!Number.isSafeInteger(end)||end>bytes.length)throw new Error("PNG chunk out of bounds");
    const type=String.fromCharCode(...bytes.subarray(pos+4,pos+8));
    if(crc32(bytes.subarray(pos+4,end-4))!==view.getUint32(end-4,false))
      throw new Error("PNG CRC failure in "+type);
    if(type==="IHDR"){
      if(seenIHDR||len!==13||pos!==8)throw new Error("Invalid PNG IHDR");
      seenIHDR=true;
      width=view.getUint32(pos+8,false);height=view.getUint32(pos+12,false);
      const depth=bytes[pos+16]!,colour=bytes[pos+17]!;
      if(depth!==8||![2,6].includes(colour)||bytes[pos+18]!==0||
         bytes[pos+19]!==0||bytes[pos+20]!==0)
        throw new Error("Unsupported PNG: expected non-interlaced 8bit RGB/RGBA");
      channels=colour===6?4:3;
      if(width<1||height<1||width>1024||height>1024||
         width*height>MAX_PIXELS)throw new RangeError("PNG exceeds texture pixel budget");
    }else if(type==="IDAT"){
      if(!seenIHDR)throw new Error("PNG missing IHDR");
      bytesTotal+=len;
      if(bytesTotal>MAX_BYTES)throw new RangeError("PNG IDAT too large");
      compressed.push(bytes.subarray(pos+8,end-4));
    }else if(type==="IEND"){
      if(!seenIHDR||len!==0)throw new Error("Invalid PNG IEND");
      seenIEND=true;
      if(end!==bytes.length)throw new Error("Trailing PNG data");
      break;
    }else if((type.charCodeAt(0)&32)===0){
      throw new Error("Unsupported critical PNG chunk "+type);
    }
    pos=end;
  }
  if(!seenIHDR||!seenIEND||!compressed.length)throw new Error("Incomplete PNG");
  const stride=width*channels,decodedLength=height*(stride+1);
  const idat=new Uint8Array(bytesTotal);let ptr=0;
  for(const data of compressed){idat.set(data,ptr);ptr+=data.length;}
  const inflated=await inflateDeflate(idat,decodedLength);
  if(inflated.byteLength!==decodedLength)throw new Error("Incomplete PNG rows");
  const rgba=new Uint8Array(width*height*4);
  let prev=new Uint8Array(stride),validPixels=0;
  for(let row=0;row<height;row++){
    const inOffset=row*(stride+1),filter=inflated[inOffset];
    if(filter===undefined||filter>4)throw new Error("Unsupported PNG row filter");
    const current=new Uint8Array(stride);
    for(let i=0;i<stride;i++){
      const raw=inflated[inOffset+1+i]!,a=i>=channels?current[i-channels]!:0,
        b=prev[i]!,c=i>=channels?prev[i-channels]!:0;
      let predictor=0;
      if(filter===1)predictor=a;
      if(filter===2)predictor=b;
      if(filter===3)predictor=Math.floor((a+b)/2);
      if(filter===4){
        const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);
        predictor=da<=db&&da<=dc?a:db<=dc?b:c;
      }
      current[i]=(raw+predictor)&255;
    }
    for(let col=0;col<width;col++){
      const i=col*channels,j=(row*width+col)*4;
      rgba[j]=current[i]!;rgba[j+1]=current[i+1]!;rgba[j+2]=current[i+2]!;
      const alpha=channels===4?current[i+3]!:255;
      rgba[j+3]=alpha;
      if(alpha>0)validPixels++;
    }
    prev=current;
  }
  return {width,height,rgba,validPixels};
}
/** Retrieve native ČÚZK ortho display pixels aligned to the specified target grid.
 * Export resolution is configurable and may be coarser than the native 0.125m.
 * A non-PNG response or too-small observed coverage is a hard failure.
 */
export async function fetchCuzkOrthophoto(
  area:AreaOfInterest,grid:RasterGrid,options:CuzkOrthoOptions={}
):Promise<CuzkOrthoTexture>{
  const [west,south,east,north]=area.bbox;
  if(west<12||east>19||south<48.4||north>51.2||!(west<east&&south<north))
    throw new RangeError("ČÚZK Ortofoto currently supports Czech geographic bounds only");
  const timeoutMs=options.timeoutMs??90_000;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)
    throw new RangeError("Invalid orthophoto request timeout");
  const url=cuzkOrthoExportUrl(grid);
  const response=await (options.fetch??fetch)(url,{redirect:"error",signal:AbortSignal.timeout(timeoutMs),
    headers:{Accept:"image/png"}});
  if(!response.ok)throw new Error("ČÚZK Ortofoto HTTP "+response.status);
  const result=await decodeCuzkOrthoPng(await boundedBytes(response));
  if(result.width!==grid.width||result.height!==grid.height)
    throw new Error("Ortho PNG dimensions do not match requested EPSG:3857 grid");
  if(result.validPixels<Math.ceil(grid.width*grid.height*.5))
    throw new Error("ČÚZK orthophoto has insufficient actual image coverage");
  const groundResolutionM=Math.abs(grid.transform[1])*Math.cos(((south+north)/2)*Math.PI/180);
  return {...result,groundResolutionM,
    sourceNativeResolutionM:CUZK_ORTHO_NATIVE_RESOLUTION_M,
    source:CUZK_ORTHO_SERVICE,attribution:CUZK_ORTHO_ATTRIBUTION,
    licenceUrl:"https://creativecommons.org/licenses/by/4.0/"};
}
