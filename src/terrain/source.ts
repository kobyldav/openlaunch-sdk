import {lonLatToGridCrs,type RasterGrid} from "../eo/raster.js";
import {createTerrainRpcCamera,createTerrainPinholeCamera,createTerrainPushbroomCamera,type TerrainRpc,type TerrainPinhole,type TerrainCamera} from "./camera.js";
import {reconstructTerrain,type TerrainImage,type TerrainReconstructionOptions} from "./reconstruct.js";

export type TerrainSourceKind="satellite"|"aerial";
/** A calibrated 3x4 row-major world-to-image matrix. World x/y are projected
 * metres, z is WGS84 ellipsoid height in metres, all relative to worldOffset.
 * Images must already be undistorted, with zero-based pixel centres. */
export interface TerrainProjectedCamera {
  crs:RasterGrid["crs"];
  worldOffset:readonly [number,number,number];
  matrix:readonly number[];
}
export function createTerrainProjectedCamera(c:TerrainProjectedCamera):TerrainCamera {
 if(c.crs==="EPSG:4326"||c.crs==="EPSG:3857"||!/^EPSG:32[67](0[1-9]|[1-5][0-9]|60)$/.test(c.crs))throw new RangeError("Projected camera requires WGS84 UTM metres");
 if(c.matrix.length!==12||c.matrix.some(v=>!Number.isFinite(v))||c.worldOffset.length!==3||c.worldOffset.some(v=>!Number.isFinite(v)))throw new RangeError("Invalid projected camera");
 const p=[...c.matrix],off=[...c.worldOffset];
 if(Math.hypot(p[8]!,p[9]!,p[10]!)<1e-12)throw new RangeError("Perspective projection requires nonzero depth row");
 return {project(g){
   const [east,north]=lonLatToGridCrs(g.longitudeDeg,g.latitudeDeg,c.crs);
   const x=east-off[0]!,y=north-off[1]!,z=g.heightM-off[2]!;
   const d=p[8]!*x+p[9]!*y+p[10]!*z+p[11]!;
   if(!Number.isFinite(d)||d<=1e-12)return null;
   const u=(p[0]!*x+p[1]!*y+p[2]!*z+p[3]!)/d,v=(p[4]!*x+p[5]!*y+p[6]!*z+p[7]!)/d;
   return Number.isFinite(u)&&Number.isFinite(v)?{x:u,y:v}:null;
 }};
}
type RawImage=Omit<TerrainImage,"camera">;
export type SatelliteTerrainImage=RawImage&{calibration:{kind:"rpc";rpc:TerrainRpc}|{kind:"pushbroom";lines:readonly TerrainPinhole[]}};
export type AerialTerrainImage=RawImage&{calibration:{kind:"pinhole";pose:TerrainPinhole}|{kind:"projected";camera:TerrainProjectedCamera}};
export type TerrainSource={kind:"satellite";images:readonly SatelliteTerrainImage[]}|{kind:"aerial";images:readonly AerialTerrainImage[]};
export type TerrainSourceOptions=Omit<TerrainReconstructionOptions,"images">&{source:TerrainSource};
/** Explicit source selection, with one shared local stereo engine. Neither mode reads a DEM. */
export function terrainSourceImages(source:TerrainSource):TerrainImage[]{
 if(source.kind!=="satellite"&&source.kind!=="aerial")throw new RangeError("Unknown terrain source");
 return source.images.map(im=>{
   const c=im.calibration;let camera:TerrainCamera;
   if(source.kind==="satellite"&&c.kind==="rpc")camera=createTerrainRpcCamera(c.rpc);
   else if(source.kind==="satellite"&&c.kind==="pushbroom")camera=createTerrainPushbroomCamera(c.lines);
   else if(source.kind==="aerial"&&c.kind==="pinhole")camera=createTerrainPinholeCamera(c.pose);
   else if(source.kind==="aerial"&&c.kind==="projected")camera=createTerrainProjectedCamera(c.camera);
   else throw new RangeError("Calibration does not match terrain source");
   return {width:im.width,height:im.height,values:im.values,source:im.source,camera};
 });
}
export function reconstructTerrainFromSource(o:TerrainSourceOptions){
 const {source,...options}=o;
 return {...reconstructTerrain({...options,images:terrainSourceImages(source)}),sourceKind:source.kind};
}
