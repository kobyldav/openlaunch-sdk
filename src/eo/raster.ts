import { utmZone, lonLatToUtm, utmToLonLat } from "./utm.js";
import type { AreaOfInterest, Position } from "../geo/types.js";

/** Pixel-corner transform: x=a+b*col+c*row, y=d+e*col+f*row. */
export type RasterTransform = readonly [a:number,b:number,c:number,d:number,e:number,f:number];
export type RasterCrs = "EPSG:4326" | "EPSG:3857" | `EPSG:${number}`;
export interface RasterGrid {
  width: number;
  height: number;
  crs: RasterCrs;
  transform: RasterTransform;
  /** Row-major native pixel values; any invalid pixel is NaN. */
  values: Float64Array;
  /** Data source and calibrated physical quantity must be tracked by the caller. */
  source?: string;
  unit?: string;
}
export interface RasterStats {
  count: number;
  valid: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  sum: number;
}
export interface RasterDifference {
  grid: RasterGrid;
  stats: RasterStats;
  comparedPixels: number;
  baselineValid: number;
  followupValid: number;
}

const MERCATOR_R = 6_378_137;
export function validateRaster(grid: RasterGrid): void {
  if (!(Number.isSafeInteger(grid.width) && grid.width > 0 && Number.isSafeInteger(grid.height) && grid.height > 0)) {
    throw new RangeError("Raster dimensions must be positive safe integers");
  }
  if (grid.width*grid.height > 16_777_216) throw new RangeError("Raster exceeds 16,777,216 pixel safety limit");
  if (grid.values.length !== grid.width*grid.height) throw new RangeError("Raster samples must equal width*height");
  if (grid.crs !== "EPSG:4326" && grid.crs !== "EPSG:3857" && !utmZone(grid.crs))
    throw new RangeError("Only EPSG:4326/3857 and WGS84 UTM 326xx/327xx supported");
  if (grid.transform.length !== 6 || grid.transform.some(n=>!Number.isFinite(n))) throw new RangeError("Invalid affine geotransform");
  if (Math.abs(grid.transform[1]*grid.transform[5]-grid.transform[2]*grid.transform[4]) < 1e-15) {
    throw new RangeError("Non-invertible geotransform");
  }
}
export function pixelToWorld(transform: RasterTransform, col: number, row: number): [number,number] {
  return [
    transform[0]+transform[1]*col+transform[2]*row,
    transform[3]+transform[4]*col+transform[5]*row,
  ];
}
export function worldToPixel(transform: RasterTransform,x:number,y:number): [number,number] {
  const determinant=transform[1]*transform[5]-transform[2]*transform[4];
  if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-15) throw new RangeError("Non-invertible geotransform");
  const dx=x-transform[0],dy=y-transform[3];
  return [(dx*transform[5]-dy*transform[2])/determinant,(dy*transform[1]-dx*transform[4])/determinant];
}
export function lonLatToGridCrs(lon:number,lat:number,crs:RasterCrs): [number,number] {
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon < -180||lon > 180||lat < -90||lat > 90) throw new RangeError("Invalid lon/lat");
  if(crs==="EPSG:4326")return [lon,lat];
  if(crs!=="EPSG:3857")return lonLatToUtm(lon,lat,crs);
  // Web Mercator is undefined at poles; clamp to its standard latitude extent.
  const bound=Math.max(-85.0511287798,Math.min(85.0511287798,lat));
  return [MERCATOR_R*lon*Math.PI/180,MERCATOR_R*Math.log(Math.tan(Math.PI/4+bound*Math.PI/360))];
}
export function gridCrsToLonLat(x:number,y:number,crs:RasterCrs): [number,number] {
  if(crs==="EPSG:4326")return [x,y];
  if(crs!=="EPSG:3857")return utmToLonLat(x,y,crs);
  return [x*180/(MERCATOR_R*Math.PI),(2*Math.atan(Math.exp(y/MERCATOR_R))-Math.PI/2)*180/Math.PI];
}
export function rasterStatistics(grid:RasterGrid): RasterStats {
  validateRaster(grid);
  let min=Infinity,max=-Infinity,sum=0,valid=0;
  for(const value of grid.values){
    if(!Number.isFinite(value))continue;
    valid++;sum+=value;min=Math.min(min,value);max=Math.max(max,value);
  }
  return {
    count:grid.values.length,valid,min:valid?min:null,max:valid?max:null,
    mean:valid?sum/valid:null,sum,
  };
}
export function pixelAt(grid:RasterGrid,col:number,row:number):number {
  if(col<0||row<0||col>=grid.width||row>=grid.height)return NaN;
  return grid.values[row*grid.width+col]!;
}

/** Nearest-neighbour or bilinear interpolation. Bilinear rejects any nodata neighbour. */
export function sampleRaster(grid:RasterGrid,x:number,y:number,method:"nearest"|"bilinear"="nearest"):number {
  const [pixelX,pixelY]=worldToPixel(grid.transform,x,y);
  const c=pixelX-0.5,r=pixelY-0.5;
  if(method==="nearest")return pixelAt(grid,Math.round(c),Math.round(r));
  const c0=Math.floor(c),r0=Math.floor(r),u=c-c0,v=r-r0;
  // At a pixel centre on the last edge, do not request a missing neighbour.
  if(Math.abs(u)<1e-12&&Math.abs(v)<1e-12)return pixelAt(grid,c0,r0);
  const a=pixelAt(grid,c0,r0),b=pixelAt(grid,c0+1,r0),
    d=pixelAt(grid,c0,r0+1),e=pixelAt(grid,c0+1,r0+1);
  if(![a,b,d,e].every(Number.isFinite))return NaN;
  return a*(1-u)*(1-v)+b*u*(1-v)+d*(1-u)*v+e*u*v;
}
export function alignRasterTo(source:RasterGrid,reference:RasterGrid,method:"nearest"|"bilinear"="nearest"):RasterGrid {
  validateRaster(source);validateRaster(reference);
  if(source.crs!==reference.crs)throw new RangeError("Raster CRS mismatch: reproject before alignment");
  const output=new Float64Array(reference.width*reference.height);
  for(let row=0;row<reference.height;row++)for(let col=0;col<reference.width;col++){
    const [x,y]=pixelToWorld(reference.transform,col+0.5,row+0.5);
    output[row*reference.width+col]=sampleRaster(source,x,y,method);
  }
  return {...reference,values:output,...(source.source?{source:source.source}:{})};
}

/** AOI clipping: exact bbox crop, with additional centre-point polygon masking. */
export function clipRasterToAoi(grid:RasterGrid,area:AreaOfInterest):RasterGrid {
  validateRaster(grid);
  const [west,south,east,north]=area.bbox;
  if(west>east)throw new RangeError("Antimeridian-crossing AOIs need explicit tiling");
  // UTM's projected AOI boundary may curve relative to geographic edges.
  // A 5x5 sampled envelope is conservative for bounded local AOIs and avoids
  // missing tiles if an extremum occurs away from the four corners.
  const projected: [number,number][]=[];
  for(let i=0;i<=4;i++)for(let j=0;j<=4;j++)
    projected.push(lonLatToGridCrs(west+(east-west)*i/4,south+(north-south)*j/4,grid.crs));
  let minC=Infinity,maxC=-Infinity,minR=Infinity,maxR=-Infinity;
  for(const [x,y] of projected){
    const [c,r]=worldToPixel(grid.transform,x,y);
    minC=Math.min(minC,c);maxC=Math.max(maxC,c);minR=Math.min(minR,r);maxR=Math.max(maxR,r);
  }
  // Numeric lon/lat to affine inversion can yield 0.9999999999998 when
  // a bbox edge lies exactly on a pixel border. Snap machine-precision
  // artefacts before floor/ceil to avoid acquiring entire extra rows.
  const snap=(value:number):number=>Math.abs(value-Math.round(value))<1e-9?Math.round(value):value;
  const c0=Math.max(0,Math.floor(snap(minC))),r0=Math.max(0,Math.floor(snap(minR))),
    c1=Math.min(grid.width,Math.ceil(snap(maxC))),r1=Math.min(grid.height,Math.ceil(snap(maxR)));
  if(c1<=c0||r1<=r0)throw new RangeError("AOI does not intersect raster grid");
  const width=c1-c0,height=r1-r0;
  const data=new Float64Array(width*height);
  data.fill(NaN);
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const [x,y]=pixelToWorld(grid.transform,c0+col+0.5,r0+row+0.5);
    const [lon,lat]=gridCrsToLonLat(x,y,grid.crs);
    if(containsAoi(area.geometry,[lon,lat]))data[row*width+col]=grid.values[(r0+row)*grid.width+c0+col]!;
  }
  const [originX,originY]=pixelToWorld(grid.transform,c0,r0);
  return {
    ...grid,width,height,values:data,
    transform:[originX,grid.transform[1],grid.transform[2],originY,grid.transform[4],grid.transform[5]],
  };
}

type Geometry=AreaOfInterest["geometry"];
function containsAoi(geometry:Geometry,pos:Position):boolean {
  if(geometry.type==="Point")return true; // point AOI is processed as the intersecting raster cell.
  if(geometry.type==="Polygon")return polygonContains(geometry.coordinates,pos);
  return geometry.coordinates.some(poly=>polygonContains(poly,pos));
}
function polygonContains(rings:readonly (readonly Position[])[],[x,y]:Position):boolean {
  if(!rings[0]||!insideRing(rings[0],x,y))return false;
  return !rings.slice(1).some(r=>insideRing(r,x,y));
}
function insideRing(ring:readonly Position[],x:number,y:number):boolean {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i]!, [xj,yj]=ring[j]!;
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
/** Convert aligned red and near-IR DNs/reflectances to NDVI while preserving NaN masks. */
export function ndviRaster(red:RasterGrid,nir:RasterGrid,options:{minDenominator?:number}={}):RasterGrid {
  validateRaster(red);validateRaster(nir);assertAligned(red,nir);
  const threshold=options.minDenominator??1e-12;
  if(!(Number.isFinite(threshold)&&threshold>0))throw new RangeError("minDenominator must be positive");
  const output=new Float64Array(red.values.length);
  for(let i=0;i<output.length;i++){
    const a=nir.values[i]!,b=red.values[i]!,sum=a+b;
    output[i]=Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(sum)>=threshold ? (a-b)/sum:NaN;
  }
  return {...red,values:output,source:"NDVI",unit:"unitless"};
}
/** Georeferenced Normalized Difference Water Index (green - NIR)/(green + NIR). */
export function ndwiRaster(green:RasterGrid,nir:RasterGrid):RasterGrid{
  return {...ndviRaster(nir,green),source:"NDWI"};
}
/** Georeferenced vegetation moisture index (NIR - SWIR1)/(NIR + SWIR1). */
export function ndmiRaster(nir:RasterGrid,swir1:RasterGrid):RasterGrid{
  return {...ndviRaster(swir1,nir),source:"NDMI"};
}
/** Georeferenced Normalized Burn Ratio (NIR - SWIR2)/(NIR + SWIR2). */
export function nbrRaster(nir:RasterGrid,swir2:RasterGrid):RasterGrid{
  return {...ndviRaster(swir2,nir),source:"NBR"};
}
/** Follow-up minus baseline at corresponding, georeferenced pixels. */
export function rasterDifference(baseline:RasterGrid,followup:RasterGrid):RasterDifference {
  validateRaster(baseline);validateRaster(followup);assertAligned(baseline,followup);
  const out=new Float64Array(baseline.values.length);
  let baselineValid=0,followupValid=0,comparedPixels=0;
  for(let i=0;i<out.length;i++){
    const a=baseline.values[i]!,b=followup.values[i]!;
    if(Number.isFinite(a))baselineValid++;
    if(Number.isFinite(b))followupValid++;
    out[i]=Number.isFinite(a)&&Number.isFinite(b)? b-a : NaN;
    if(Number.isFinite(out[i]))comparedPixels++;
  }
  const grid:RasterGrid={...baseline,values:out,source:"followup-minus-baseline"};
  return {grid,stats:rasterStatistics(grid),comparedPixels,baselineValid,followupValid};
}
function assertAligned(a:RasterGrid,b:RasterGrid):void {
  if(a.width!==b.width||a.height!==b.height||a.crs!==b.crs ||
     a.transform.some((v,i)=>Math.abs(v-b.transform[i]!)>1e-10*Math.max(1,Math.abs(v),Math.abs(b.transform[i]!))))
     throw new RangeError("Raster grids must share dimensions, CRS and affine transform; call alignRasterTo first");
}

/**
 * Create a bounded local triangle mesh for an already-decoded elevation raster.
 * Coordinates are LOCAL grid metres, NOT geodetic/ECEF positions.
 */
export interface TerrainMesh {
  positions:Float32Array; // x,y,height triplets in grid metres.
  triangles:Uint32Array;
  validVertices:number;
  model:"local-grid-mesh";
}
export function elevationToLocalMesh(dem:RasterGrid,options:{verticalExaggeration?:number,maxVertices?:number}={}):TerrainMesh {
  validateRaster(dem);
  if(dem.crs!=="EPSG:3857")throw new RangeError("Terrain mesh requires metre-based EPSG:3857 raster");
  const maxVertices=options.maxVertices??500_000,verticalExaggeration=options.verticalExaggeration??1;
  if(!Number.isInteger(maxVertices)||maxVertices<1||maxVertices>2_000_000)throw new RangeError("Invalid maxVertices");
  if(!(Number.isFinite(verticalExaggeration)&&verticalExaggeration>0))throw new RangeError("Invalid verticalExaggeration");
  if(dem.width*dem.height>maxVertices)throw new RangeError("DEM too large for local mesh");
  const positions=new Float32Array(dem.width*dem.height*3);
  const good=new Uint8Array(dem.width*dem.height);
  const origin=pixelToWorld(dem.transform,0.5,0.5);
  let validVertices=0;
  for(let row=0;row<dem.height;row++)for(let col=0;col<dem.width;col++){
    const idx=row*dem.width+col, h=dem.values[idx]!;
    const [x,y]=pixelToWorld(dem.transform,col+0.5,row+0.5);
    positions[idx*3]=x-origin[0];positions[idx*3+1]=y-origin[1];
    positions[idx*3+2]=Number.isFinite(h)?h*verticalExaggeration:NaN;
    if(Number.isFinite(h)){good[idx]=1;validVertices++;}
  }
  const faces:number[]=[];
  for(let row=0;row<dem.height-1;row++)for(let col=0;col<dem.width-1;col++){
    const a=row*dem.width+col,b=a+1,c=a+dem.width,d=c+1;
    if(good[a]&&good[b]&&good[c])faces.push(a,b,c);
    if(good[b]&&good[d]&&good[c])faces.push(b,d,c);
  }
  return {positions,triangles:new Uint32Array(faces),validVertices,model:"local-grid-mesh"};
}
