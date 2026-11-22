import {decodeTerrainTiff,TiffDirectory} from "../eo/geotiff.js";
import {validateRaster,type RasterGrid} from "../eo/raster.js";
import type {AreaOfInterest} from "../geo/types.js";

/** ČÚZK DMP OK, 2026 photogrammetric surface model, 0.5 m native raster.
 * The ArcGIS image service returns real F32 elevations, NOT a rendered hillshade.
 * Heights are Bpv / Baltic 1957, incompatible with Copernicus EGM2008 without conversion.
 */
export const CUZK_DMPOK_SERVICE="https://ags.cuzk.gov.cz/arcgis2/rest/services/dmp/ImageServer";
export const CUZK_DMPOK_DATUM="Bpv (Baltic 1957)";
export const CUZK_DMPOK_NATIVE_RESOLUTION_M=0.5;
const MAX_BYTES=12*1024*1024;

export interface CuzkDmpOkOptions{
  fetch?:typeof fetch;
  timeoutMs?:number;
}
/** A single bounded ArcGIS exportImage request; never accepts a user-supplied hostname. */
export function cuzkDmpOkExportUrl(grid:Pick<RasterGrid,"width"|"height"|"crs"|"transform">):string{
  if(grid.crs!=="EPSG:3857"||grid.width<2||grid.height<2||
    grid.width*grid.height>50_000||grid.width>1024||grid.height>1024)
    throw new RangeError("ČÚZK DMP OK requires bounded EPSG:3857 grid (up to 50k samples)");
  const t=grid.transform;
  if(t[2]!==0||t[4]!==0||!(t[1]>0)||!(t[5]<0))throw new RangeError("ČÚZK export expects north-up grid");
  const xmin=t[0],xmax=xmin+t[1]*grid.width;
  const ymax=t[3],ymin=ymax+t[5]*grid.height;
  if(![xmin,xmax,ymin,ymax].every(Number.isFinite))throw new RangeError("Non-finite ČÚZK bounds");
  const url=new URL(CUZK_DMPOK_SERVICE+"/exportImage");
  url.search=new URLSearchParams({
    f:"image",format:"tiff",bbox:[xmin,ymin,xmax,ymax].join(","),
    bboxSR:"3857",imageSR:"3857",size:grid.width+","+grid.height,
    pixelType:"F32",interpolation:"RSP_NearestNeighbor",
    returnSquarePixels:"false",adjustAspectRatio:"false",
    compression:"None",
  }).toString();
  return url.href;
}
async function limitedResponse(response:Response):Promise<Uint8Array>{
  const declared=Number(response.headers.get("content-length")??0);
  if(Number.isFinite(declared)&&declared>MAX_BYTES)throw new RangeError("ČÚZK response exceeds safe 12 MiB limit");
  if(!response.body)throw new Error("Empty ČÚZK image response");
  const reader=response.body.getReader();
  let total=0;const chunks:Uint8Array[]=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.length;
      if(total>MAX_BYTES){await reader.cancel();throw new RangeError("ČÚZK TIFF exceeds safe byte budget");}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const all=new Uint8Array(total);
  let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  return all;
}
/** Geographic AOI validation must run before remote access: only Czechia. */
export async function fetchCuzkDmpOkRaster(
  area:AreaOfInterest,grid:RasterGrid,options:CuzkDmpOkOptions={}
):Promise<RasterGrid>{
  const [west,south,east,north]=area.bbox;
  if(west<12||east>19||south<48.4||north>51.2||!(west<east&&south<north))
    throw new RangeError("ČÚZK DMP OK currently supports AOIs within the Czech Republic");
  const target=cuzkDmpOkExportUrl(grid);
  const timeoutMs=options.timeoutMs??90_000;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120_000)
    throw new RangeError("ČÚZK timeoutMs must be 1000..120000");
  const fetchImpl=options.fetch??fetch;
  const response=await fetchImpl(target,{signal:AbortSignal.timeout(timeoutMs),headers:{Accept:"image/tiff"}});
  if(!response.ok)throw new Error("ČÚZK DMP OK HTTP "+response.status);
  const bytes=await limitedResponse(response);
  if(bytes.length<16||String.fromCharCode(bytes[0]!,bytes[1]!)!=="II"&&
     String.fromCharCode(bytes[0]!,bytes[1]!)!=="MM"){
    const prefix=new TextDecoder().decode(bytes.subarray(0,512));
    if(prefix.includes("error")||prefix.includes("<html"))throw new Error("ČÚZK exportImage returned an error, not an elevation TIFF");
    throw new Error("ČÚZK did not return TIFF elevation bytes");
  }
  const dir=new TiffDirectory(bytes);
  if(dir.scalar(277,1)!==1||dir.scalar(339,1)!==3||dir.scalar(258)!==32)
    throw new Error("ČÚZK export must return single-band floating-point 32-bit elevations, not a visualization");
  const decoded=await decodeTerrainTiff(bytes,{maxPixels:50_000,maxInputBytes:MAX_BYTES});
  if(decoded.width!==grid.width||decoded.height!==grid.height)
    throw new Error("ČÚZK export image dimensions do not match requested georeference");
  const values=decoded.values;
  let valid=0;
  for(let i=0;i<values.length;i++){
    const z=values[i]!;
    if(!Number.isFinite(z)||z<=-9990||z>2500||z< -100){
      values[i]=NaN;
    } else valid++;
  }
  if(valid<4)throw new Error("ČÚZK DMP OK image contains no measured surface elevations");
  const raster:RasterGrid={...grid,values,source:CUZK_DMPOK_SERVICE,unit:"m Bpv"};
  validateRaster(raster);
  return raster;
}
