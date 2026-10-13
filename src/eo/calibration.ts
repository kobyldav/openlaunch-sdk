import type { StacAsset } from "../providers/stac.js";
import { sentinel2SclClass } from "./pixels.js";
import type { RasterGrid } from "./raster.js";
import { validateRaster } from "./raster.js";

export interface RasterCalibration {
  /** Physical unit per raw DN, e.g. Landsat C2 L2 surface reflectance 0.0000275. */
  scale: number;
  /** Physical zero offset, e.g. Landsat C2 L2 surface reflectance -0.2. */
  offset: number;
  /** Nodata sentinel expressed in raw DN units, before calibration. */
  noData?: number;
  /** Optional finite raw-value bounds to reject invalid instrument samples. */
  minRaw?: number;
  maxRaw?: number;
  unit?: string;
}
export interface CalibratedRaster {
  grid: RasterGrid;
  invalidPixels: number;
  scale: number;
  offset: number;
  applied: true;
}
/** Applies provider-supplied radiometric scale/offset and preserves missing values. */
export function calibrateRaster(grid:RasterGrid,calibration:RasterCalibration):CalibratedRaster {
  validateRaster(grid);
  const {scale,offset,noData,minRaw,maxRaw}=calibration;
  if(!Number.isFinite(scale)||scale===0||!Number.isFinite(offset))throw new RangeError("Raster scale and offset must be finite; scale nonzero");
  if(minRaw!==undefined&&!Number.isFinite(minRaw))throw new RangeError("Invalid minRaw");
  if(maxRaw!==undefined&&!Number.isFinite(maxRaw))throw new RangeError("Invalid maxRaw");
  if(minRaw!==undefined&&maxRaw!==undefined&&minRaw>maxRaw)throw new RangeError("minRaw > maxRaw");
  const output=new Float64Array(grid.values.length);
  let invalidPixels=0;
  for(let i=0;i<output.length;i++){
    const v=grid.values[i]!;
    const missing=!Number.isFinite(v)||(noData!==undefined&&v===noData)||
      (minRaw!==undefined&&v<minRaw)||(maxRaw!==undefined&&v>maxRaw);
    output[i]=missing?NaN:v*scale+offset;
    if(missing)invalidPixels++;
  }
  return {
    grid:{...grid,values:output,...(calibration.unit?{unit:calibration.unit}:{})},
    invalidPixels,scale,offset,applied:true,
  };
}
/** Reads explicit STAC raster:bands[0] calibration. Fails rather than assumes scale. */
export function calibrateRasterFromStac(grid:RasterGrid,asset:StacAsset):CalibratedRaster {
  const bands=asset["raster:bands"];
  if(!Array.isArray(bands)||bands.length!==1||typeof bands[0]!=="object"||bands[0]===null)
    throw new RangeError("STAC raster:bands must expose one band with explicit scale and offset");
  const band=bands[0] as Record<string,unknown>;
  if(typeof band.scale!=="number"||typeof band.offset!=="number")
    throw new RangeError("STAC raster:bands scale and offset must both be specified");
  return calibrateRaster(grid,{
    scale:band.scale,offset:band.offset,
    ...(typeof band.nodata==="number"?{noData:band.nodata}:{}),
    ...(typeof band.unit==="string"?{unit:band.unit}:{}),
  });
}

/** Only values classified clear (SCL classes 4,5,6) remain in output by default. */
export function maskRasterBySentinel2Scl(
  grid:RasterGrid,
  scl:RasterGrid,
  options:{includeShadow?:boolean;includeSnow?:boolean;includeUnclassified?:boolean}={},
):{grid:RasterGrid;retained:number;masked:number}{
  validateRaster(grid);validateRaster(scl);
  if(grid.crs!==scl.crs||grid.width!==scl.width||grid.height!==scl.height||
     grid.transform.some((v,i)=>Math.abs(v-scl.transform[i]!)>1e-10*Math.max(1,Math.abs(v))))
    throw new RangeError("Sentinel SCL and spectral band rasters must share the exact same grid");
  const out=new Float64Array(grid.values.length);
  let retained=0;
  for(let i=0;i<out.length;i++){
    const value=grid.values[i]!,kind=sentinel2SclClass(scl.values[i]!);
    const safe=kind==="clear" || (kind==="shadow"&&options.includeShadow===true) ||
      (kind==="snow"&&options.includeSnow===true) ||
      (kind==="unclassified"&&options.includeUnclassified===true);
    if(safe&&Number.isFinite(value)){out[i]=value;retained++;}
    else out[i]=NaN;
  }
  return {grid:{...grid,values:out},retained,masked:out.length-retained};
}

export interface RgbaImage {
  width:number;
  height:number;
  rgba:Uint8ClampedArray;
  pixelFormat:"rgba8";
  /** Raw bytes for a Canvas/ImageData or PNG encoder, not a PNG file. */
  encodedImage:false;
}
/** Render three aligned, calibrated bands into RGBA bytes for UI/PNG encoder. */
export function renderRasterRgb(
  red:RasterGrid,
  green:RasterGrid,
  blue:RasterGrid,
  options:{ranges?:readonly [number,number][];gamma?:number}={},
):RgbaImage {
  validateRaster(red);validateRaster(green);validateRaster(blue);
  for(const other of [green,blue]){
    if(red.width!==other.width||red.height!==other.height||red.crs!==other.crs||
       red.transform.some((v,i)=>Math.abs(v-other.transform[i]!)>1e-10*Math.max(1,Math.abs(v))))
      throw new RangeError("RGB rasters must have the same georeferenced grid");
  }
  const gamma=options.gamma??1;
  if(!(Number.isFinite(gamma)&&gamma>0))throw new RangeError("RGB gamma must be positive");
  const ranges=options.ranges??[[0,1],[0,1],[0,1]];
  if(ranges.length!==3||ranges.some(r=>r.length!==2||!Number.isFinite(r[0])||!Number.isFinite(r[1])||r[1]<=r[0]))
    throw new RangeError("RGB ranges must be three valid [low,high] pairs");
  const rgba=new Uint8ClampedArray(red.values.length*4);
  const bands=[red.values,green.values,blue.values];
  for(let pixel=0;pixel<red.values.length;pixel++){
    if(bands.some(b=>!Number.isFinite(b[pixel]!)))continue;
    for(let channel=0;channel<3;channel++){
      const [lo,hi]=ranges[channel]!,v=bands[channel]![pixel]!;
      rgba[pixel*4+channel]=Math.round(Math.pow(Math.max(0,Math.min(1,(v-lo)/(hi-lo))),1/gamma)*255);
    }
    rgba[pixel*4+3]=255;
  }
  return {width:red.width,height:red.height,rgba,pixelFormat:"rgba8",encodedImage:false};
}
