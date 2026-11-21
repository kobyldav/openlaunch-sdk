import {lonLatToGridCrs,worldToPixel,validateRaster,type RasterGrid} from "../eo/raster.js";
import type {RealTerrainMap} from "./real-map.js";

/** Height interpolated on the actual DEM triangle used by the 3D viewer.
 * It is NOT a fresh survey observation or higher-resolution DEM.
 */
export interface RealTerrainSample {
  longitudeDeg:number;
  latitudeDeg:number;
  elevationM:number;
  verticalDatum:"EGM2008 geoid"|"Bpv (Baltic 1957)";
  interpolation:"DEM triangle";
}
export interface RealTerrainProfileSample {
  fraction:number;
  horizontalDistanceM:number;
  longitudeDeg:number;
  latitudeDeg:number;
  elevationM:number|null;
}
export interface RealTerrainProfile {
  kind:"DEM triangular surface profile";
  verticalDatum:"EGM2008 geoid"|"Bpv (Baltic 1957)";
  horizontalDistanceM:number;
  /** Sum of finite consecutive 3D segments; null if any section is missing data. */
  surfaceDistanceM:number|null;
  ascentM:number|null;
  descentM:number|null;
  minElevationM:number|null;
  maxElevationM:number|null;
  validSamples:number;
  samples:RealTerrainProfileSample[];
}

const R=6371008.8;
const TO_RAD=Math.PI/180;
const EPS=1e-9;
/** Spherical ground distance, appropriate for this bounded (<9 km2) demo AOI. */
export function terrainGroundDistanceM(lonA:number,latA:number,lonB:number,latB:number):number{
  for(const n of [lonA,latA,lonB,latB])if(!Number.isFinite(n))throw new RangeError("Coordinates must be finite");
  if(Math.abs(latA)>90||Math.abs(latB)>90||Math.abs(lonA)>180||Math.abs(lonB)>180)
    throw new RangeError("Invalid WGS84 coordinate");
  const a=(latB-latA)*TO_RAD/2,b=(lonB-lonA)*TO_RAD/2;
  const h=Math.sin(a)**2+Math.cos(latA*TO_RAD)*Math.cos(latB*TO_RAD)*Math.sin(b)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.max(0,h))));
}
function sampleGrid(grid:RasterGrid,lon:number,lat:number):number|null{
  const [x,y]=lonLatToGridCrs(lon,lat,grid.crs);
  const [colCorner,rowCorner]=worldToPixel(grid.transform,x,y);
  const c=colCorner-.5,r=rowCorner-.5;
  if(c< -EPS||r< -EPS||c>grid.width-1+EPS||r>grid.height-1+EPS||
    grid.width<2||grid.height<2)return null;
  const cc=Math.max(0,Math.min(grid.width-1,c)),rr=Math.max(0,Math.min(grid.height-1,r));
  const c0=Math.max(0,Math.min(grid.width-2,Math.floor(cc)));
  const r0=Math.max(0,Math.min(grid.height-2,Math.floor(rr)));
  const u=cc-c0,v=rr-r0;
  const a=r0*grid.width+c0,b=a+1,d=a+grid.width+1,lower=a+grid.width;
  const terms:[number,number][]=(u+v<=1)?
    [[a,1-u-v],[b,u],[lower,v]]:
    [[b,1-v],[d,u+v-1],[lower,1-u]];
  let elevation=0;
  for(const [idx,weight] of terms){
    if(weight<=EPS)continue;
    const height=grid.values[idx]!;
    if(!Number.isFinite(height))return null;
    elevation+=height*weight;
  }
  return elevation;
}
/** Null outside actual DEM coverage or on any hole. No invented elevations. */
export function sampleRealTerrain(map:Pick<RealTerrainMap,"elevation"> & {
  metadata?:{verticalDatum:"EGM2008 geoid"|"Bpv (Baltic 1957)"}
},longitudeDeg:number,latitudeDeg:number):RealTerrainSample|null{
  validateRaster(map.elevation);
  const elevationM=sampleGrid(map.elevation,longitudeDeg,latitudeDeg);
  return elevationM===null?null:{
    longitudeDeg,latitudeDeg,elevationM,verticalDatum:map.metadata?.verticalDatum??"EGM2008 geoid",
    interpolation:"DEM triangle"
  };
}
/** Sample a straight WGS84 lon/lat segment through the source 2.5D surface.
 * Horizontal lengths use spherical great-circle distances; 3D lengths are
 * diagnostic approximations only and remain null if any DEM data is missing.
 */
export function profileRealTerrain(
  map:Pick<RealTerrainMap,"elevation"|"metadata">,
  start:readonly [number,number],end:readonly [number,number],
  options:{samples?:number}={}
):RealTerrainProfile{
  validateRaster(map.elevation);
  const horizontalDistanceM=terrainGroundDistanceM(start[0],start[1],end[0],end[1]);
  const spacing=map.metadata.groundResolutionM;
  const count=options.samples??Math.max(2,Math.min(512,Math.ceil(horizontalDistanceM/Math.max(1,spacing)/2)+1));
  if(!Number.isInteger(count)||count<2||count>2048)throw new RangeError("Profile samples must be 2..2048");
  const samples:RealTerrainProfileSample[]=[];
  let min=Infinity,max=-Infinity,validSamples=0,ascent=0,descent=0,surface=0;
  let complete=true;
  for(let i=0;i<count;i++){
    const fraction=i/(count-1);
    const lon=start[0]+(end[0]-start[0])*fraction;
    const lat=start[1]+(end[1]-start[1])*fraction;
    const height=sampleGrid(map.elevation,lon,lat);
    const horizontalDistanceMAtFraction=horizontalDistanceM*fraction;
    samples.push({fraction,horizontalDistanceM:horizontalDistanceMAtFraction,
      longitudeDeg:lon,latitudeDeg:lat,elevationM:height});
    if(height===null){complete=false;continue;}
    validSamples++;min=Math.min(min,height);max=Math.max(max,height);
    if(i>0){
      const prev=samples[i-1]!;
      if(prev.elevationM===null){complete=false;continue;}
      const dh=height-prev.elevationM,dx=horizontalDistanceM/(count-1);
      surface+=Math.hypot(dx,dh);
      if(dh>0)ascent+=dh;
      else descent-=dh;
    }
  }
  return {
    kind:"DEM triangular surface profile",
    verticalDatum:map.metadata.verticalDatum,horizontalDistanceM,
    surfaceDistanceM:complete?surface:null,
    ascentM:complete?ascent:null,descentM:complete?descent:null,
    minElevationM:validSamples?min:null,maxElevationM:validSamples?max:null,
    validSamples,samples
  };
}
