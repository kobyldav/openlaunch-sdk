import { geodeticToEcef } from "../geo/ellipsoid.js";
type Vec3 = readonly [number,number,number];

export type TerrainGroundPoint = {longitudeDeg:number; latitudeDeg:number; heightM:number};
export type TerrainPixel = {x:number;y:number};
/** Pixel centres are zero-based; heights are WGS84 ellipsoidal metres. */
export interface TerrainCamera { project(point:TerrainGroundPoint):TerrainPixel|null; }
export interface TerrainRpc {
  longitudeOffset:number; latitudeOffset:number; heightOffset:number;
  longitudeScale:number; latitudeScale:number; heightScale:number;
  sampleOffset:number; lineOffset:number; sampleScale:number; lineScale:number;
  sampleNumerator:readonly number[]; sampleDenominator:readonly number[];
  lineNumerator:readonly number[]; lineDenominator:readonly number[];
}
/** RPC00B coefficient ordering (longitude L, latitude P, height H). */
export function createTerrainRpcCamera(r:TerrainRpc):TerrainCamera {
  const polys=[r.sampleNumerator,r.sampleDenominator,r.lineNumerator,r.lineDenominator];
  if(polys.some(p=>p.length!==20||p.some(v=>!Number.isFinite(v))))throw new RangeError("RPC needs four finite 20-term polynomials");
  const scales=[r.longitudeScale,r.latitudeScale,r.heightScale,r.sampleScale,r.lineScale];
  if(scales.some(v=>!Number.isFinite(v)||v<=0)||[r.longitudeOffset,r.latitudeOffset,r.heightOffset,r.sampleOffset,r.lineOffset].some(v=>!Number.isFinite(v)))throw new RangeError("Invalid RPC normalization");
  const p=polys.map(v=>[...v]);
  const dot=(a:readonly number[],b:readonly number[])=>a.reduce((sum,v,i)=>sum+v*b[i]!,0);
  return {project(g){
    const L=(g.longitudeDeg-r.longitudeOffset)/r.longitudeScale,P=(g.latitudeDeg-r.latitudeOffset)/r.latitudeScale,H=(g.heightM-r.heightOffset)/r.heightScale;
    if([L,P,H].some(v=>!Number.isFinite(v)||Math.abs(v)>1.2))return null;
    const t=[1,L,P,H,L*P,L*H,P*H,L*L,P*P,H*H,P*L*H,L**3,L*P*P,L*H*H,L*L*P,P**3,P*H*H,L*L*H,P*P*H,H**3];
    const ds=dot(p[1]!,t),dl=dot(p[3]!,t);
    if(Math.abs(ds)<1e-12||Math.abs(dl)<1e-12)return null;
    const x=r.sampleOffset+r.sampleScale*dot(p[0]!,t)/ds,y=r.lineOffset+r.lineScale*dot(p[2]!,t)/dl;
    return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
  }};
}
export interface TerrainPinhole {
  positionEcefM:Vec3; right:Vec3; down:Vec3; forward:Vec3;
  focalXpx:number; focalYpx:number; centerXpx:number; centerYpx:number;
}
const dot3=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
/** Calibrated frame camera; axes are orthonormal ECEF direction vectors. */
export function createTerrainPinholeCamera(c:TerrainPinhole):TerrainCamera {
  const axes=[c.right,c.down,c.forward];
  if(axes.some(a=>!a.every(Number.isFinite)||Math.abs(Math.hypot(...a)-1)>1e-6)||Math.abs(dot3(c.right,c.down))>1e-6||Math.abs(dot3(c.right,c.forward))>1e-6||Math.abs(dot3(c.down,c.forward))>1e-6||!c.positionEcefM.every(Number.isFinite)||![c.focalXpx,c.focalYpx].every(v=>Number.isFinite(v)&&v>0)||![c.centerXpx,c.centerYpx].every(Number.isFinite))throw new RangeError("Invalid calibrated camera");
  return {project(g){
    const e=geodeticToEcef({longitudeDeg:g.longitudeDeg,latitudeDeg:g.latitudeDeg,altitudeM:g.heightM});
    const d:Vec3=[e[0]-c.positionEcefM[0],e[1]-c.positionEcefM[1],e[2]-c.positionEcefM[2]], z=dot3(d,c.forward);
    if(!(z>0))return null;
    return {x:c.centerXpx+c.focalXpx*dot3(d,c.right)/z,y:c.centerYpx+c.focalYpx*dot3(d,c.down)/z};
  }};
}
/** Calibrated line scanner: each line has a frame pose whose principal row is the scan line.
 * Requires monotonic along-track image geometry and per-line poses, not TLEs. */
export function createTerrainPushbroomCamera(lines:readonly TerrainPinhole[]):TerrainCamera {
  if(lines.length<2||lines.length>100_000)throw new RangeError("Invalid pushbroom line count");
  const cameras=lines.map(l=>createTerrainPinholeCamera(l));
  const at=(i:number,g:TerrainGroundPoint)=>{const v=cameras[i]!.project(g);return v?{x:v.x,residual:v.y-lines[i]!.centerYpx}:null;};
  return {project(g){
    let lo=0,hi=lines.length-1,a=at(lo,g),b=at(hi,g);
    if(!a||!b)return null;
    if(a.residual===0)return {x:a.x,y:lo};
    if(b.residual===0)return {x:b.x,y:hi};
    if(Math.sign(a.residual)===Math.sign(b.residual))return null;
    while(hi-lo>1){const mid=(lo+hi)>>1,m=at(mid,g);if(!m)return null;
      if(Math.sign(m.residual)===Math.sign(a.residual)){lo=mid;a=m;}else{hi=mid;b=m;}
    }
    const f=a.residual/(a.residual-b.residual);
    return {x:a.x+f*(b.x-a.x),y:lo+f};
  }};
}
