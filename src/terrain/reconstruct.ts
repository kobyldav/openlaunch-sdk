import { gridCrsToLonLat,pixelToWorld,validateRaster,type RasterGrid } from "../eo/raster.js";
import { geodeticToEcef } from "../science/geodesy.js";
import type { TerrainCamera,TerrainPixel } from "./camera.js";

export interface TerrainImage {width:number;height:number;values:ArrayLike<number>;source:string;camera:TerrainCamera;}
export interface TerrainGrid {width:number;height:number;crs:RasterGrid["crs"];transform:RasterGrid["transform"];}
export interface TerrainReconstructionOptions {
  images:readonly TerrainImage[]; grid:TerrainGrid;
  minHeightM:number;maxHeightM:number;heightStepM:number;
  patchRadius?:number;minCorrelation?:number;minPeakGap?:number;
  minParallaxPx?:number;maxWork?:number;signal?:AbortSignal;
}
export interface TerrainReconstruction {
  elevationMap:RasterGrid; confidenceMap:RasterGrid; texture:RasterGrid;
  pointCloud:{positionsEcefM:Float64Array;confidence:Float32Array};
  mesh:{originEcefM:readonly [number,number,number];positions:Float32Array;triangles:Uint32Array};
  validPixels:number;totalPixels:number;sources:string[];
  verticalDatum:"WGS84 ellipsoid";model:"stereo-height-sweep";
}
function sample(im:TerrainImage,p:TerrainPixel):number {
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>=im.width-1||p.y>=im.height-1)return NaN;
  const x=Math.floor(p.x),y=Math.floor(p.y),f=p.x-x,g=p.y-y,i=y*im.width+x;
  const a=im.values[i]!,b=im.values[i+1]!,c=im.values[i+im.width]!,d=im.values[i+im.width+1]!;
  return (1-g)*((1-f)*a+f*b)+g*((1-f)*c+f*d);
}
function checkImage(im:TerrainImage):void {
  if(!Number.isSafeInteger(im.width)||!Number.isSafeInteger(im.height)||im.width<2||im.height<2||im.width*im.height>16_777_216||im.values.length!==im.width*im.height||!im.source||typeof im.camera?.project!=="function")throw new RangeError("Invalid stereo image");
}
/** Zero-mean normalized cross-correlation: no external matcher or DEM. */
function ncc(a:readonly number[],b:readonly number[]):number {
  let sa=0,sb=0,aa=0,bb=0,ab=0;
  for(let i=0;i<a.length;i++){const x=a[i]!,y=b[i]!;if(!Number.isFinite(x)||!Number.isFinite(y))return NaN;sa+=x;sb+=y;aa+=x*x;bb+=y*y;ab+=x*y;}
  const va=aa-sa*sa/a.length,vb=bb-sb*sb/a.length;
  return va>1e-9&&vb>1e-9?Math.max(-1,Math.min(1,(ab-sa*sb/a.length)/Math.sqrt(va*vb))):NaN;
}
/** Project local ground patches at candidate ellipsoid heights into each image.
 * Only independent image measurements and calibrated camera projections are inputs. */
export function reconstructTerrain(o:TerrainReconstructionOptions):TerrainReconstruction {
  const {grid,images}=o;
  if(images.length<2||images.length>8)throw new RangeError("Require 2–8 calibrated images");
  images.forEach(checkImage);
  if(new Set(images.map(i=>i.source)).size!==images.length)throw new RangeError("Image source IDs must be distinct");
  const r=o.patchRadius??2,minCorr=o.minCorrelation??0.75,minGap=o.minPeakGap??0.03,minParallax=o.minParallaxPx??0.5;
  if(!Number.isInteger(r)||r<1||r>5||!Number.isFinite(minCorr)||minCorr<0||minCorr>1||!Number.isFinite(minGap)||minGap<0||minGap>1||!Number.isFinite(minParallax)||minParallax<=0)throw new RangeError("Invalid matching parameters");
  if(![o.minHeightM,o.maxHeightM,o.heightStepM].every(Number.isFinite)||o.minHeightM>=o.maxHeightM||o.heightStepM<=0)throw new RangeError("Invalid height search");
  const steps=Math.ceil((o.maxHeightM-o.minHeightM)/o.heightStepM)+1,n=grid.width*grid.height;
  if(!Number.isSafeInteger(grid.width)||!Number.isSafeInteger(grid.height)||grid.width<1||grid.height<1||n>500_000||!Number.isSafeInteger(steps)||steps<3||steps>1024)throw new RangeError("Invalid terrain grid or height count");
  const budget=o.maxWork??20_000_000,work=n*steps*(2*r+1)**2*images.length;
  if(!Number.isSafeInteger(budget)||budget<1||budget>500_000_000||work>budget)throw new RangeError("Terrain search exceeds work budget; tile the AOI or reduce hypotheses");
  const values=new Float64Array(n).fill(NaN),conf=new Float64Array(n).fill(NaN),tex=new Float64Array(n).fill(NaN);
  const elevationMap:RasterGrid={...grid,values,source:"OpenLaunch stereo reconstruction",unit:"m ellipsoid"};
  validateRaster(elevationMap);
  const scores=new Float64Array(steps);
  const patch=Array.from({length:(2*r+1)**2},(_,i)=>[i%(2*r+1)-r,Math.floor(i/(2*r+1))-r] as const);
  const hs=Array.from({length:steps},(_,i)=>o.minHeightM+(o.maxHeightM-o.minHeightM)*i/(steps-1));
  const cloud:number[]=[],quality:number[]=[],ecef=new Float64Array(n*3).fill(NaN);
  let origin:readonly [number,number,number]=[0,0,0];
  for(let row=0;row<grid.height;row++)for(let col=0;col<grid.width;col++){
    if(o.signal?.aborted)throw new Error("Terrain reconstruction aborted");
    const i=row*grid.width+col;
    const ground=patch.map(([dx,dy])=>{const [x,y]=pixelToWorld(grid.transform,col+0.5+dx,row+0.5+dy);const [longitudeDeg,latitudeDeg]=gridCrsToLonLat(x,y,grid.crs);return {longitudeDeg,latitudeDeg};});
    const center=ground[Math.floor(ground.length/2)]!;
    const endpoints=images.map(im=>[im.camera.project({...center,heightM:hs[0]!}),im.camera.project({...center,heightM:hs[steps-1]!})] as const);
    const [a,b]=endpoints[0]!;
    if(!a||!b||!endpoints.slice(1).some(([c,d])=>c&&d&&Math.hypot((d.x-c.x)-(b.x-a.x),(d.y-c.y)-(b.y-a.y))>=minParallax))continue;
    scores.fill(NaN);
    for(let k=0;k<steps;k++){
      const h=hs[k]!;
      const samples=images.map(im=>ground.map(g=>{const p=im.camera.project({...g,heightM:h});return p?sample(im,p):NaN;}));
      const s=samples.slice(1).map(v=>ncc(samples[0]!,v));
      if(s.every(Number.isFinite))scores[k]=s.reduce((sum,v)=>sum+v,0)/s.length;
    }
    let best=-1;
    for(let k=0;k<steps;k++)if(Number.isFinite(scores[k])&&(best<0||scores[k]!>scores[best]!))best=k;
    if(best<=0||best>=steps-1||scores[best]!<minCorr)continue; // boundary peaks are not bounded
    let other=-Infinity;
    for(let k=0;k<steps;k++)if(Math.abs(k-best)>1&&Number.isFinite(scores[k]))other=Math.max(other,scores[k]!);
    if(!Number.isFinite(other)||scores[best]!-other<minGap)continue;
    const l=scores[best-1]!,m=scores[best]!,u=scores[best+1]!,den=l-2*m+u;
    const delta=Number.isFinite(den)&&den< -1e-12?Math.max(-0.5,Math.min(0.5,0.5*(l-u)/den)):0;
    const h=hs[best]!+delta*(hs[1]!-hs[0]!);
    const q=Math.min(1,Math.max(0,m)*Math.min(1,(m-other)/0.2));
    values[i]=h;conf[i]=q;
    const p=images[0]!.camera.project({...center,heightM:h});if(p)tex[i]=sample(images[0]!,p);
    const v=geodeticToEcef({...center,altitudeM:h});
    if(!cloud.length)origin=v;
    cloud.push(...v);quality.push(q);ecef.set(v,i*3);
  }
  const positions=new Float32Array(n*3).fill(NaN),triangles:number[]=[];
  for(let i=0;i<n;i++)if(Number.isFinite(values[i]))for(let k=0;k<3;k++)positions[3*i+k]=ecef[3*i+k]!-origin[k]!;
  for(let y=0;y<grid.height-1;y++)for(let x=0;x<grid.width-1;x++){
    const a=y*grid.width+x,b=a+1,c=a+grid.width,d=c+1;
    if([a,b,c].every(i=>Number.isFinite(values[i])))triangles.push(a,c,b);
    if([b,c,d].every(i=>Number.isFinite(values[i])))triangles.push(b,c,d);
  }
  return {elevationMap,confidenceMap:{...grid,values:conf,source:"matching heuristic",unit:"1"},texture:{...grid,values:tex,source:images[0]!.source,unit:"input intensity"},pointCloud:{positionsEcefM:new Float64Array(cloud),confidence:new Float32Array(quality)},mesh:{originEcefM:origin,positions,triangles:new Uint32Array(triangles)},validPixels:quality.length,totalPixels:n,sources:images.map(i=>i.source),verticalDatum:"WGS84 ellipsoid",model:"stereo-height-sweep"};
}
/** Compare against independent ellipsoidal checkpoints; nearest grid pixel, no interpolation. */
export function validateTerrainHeights(dem:RasterGrid,points:readonly {col:number;row:number;heightM:number}[]):{count:number;ignored:number;biasM:number|null;rmseM:number|null;maeM:number|null}{
  validateRaster(dem);let count=0,sum=0,sq=0,abs=0;
  for(const p of points){const x=Math.round(p.col),y=Math.round(p.row);if(!Number.isFinite(p.heightM)||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=dem.width||y>=dem.height)continue;const e=dem.values[y*dem.width+x]!-p.heightM;if(!Number.isFinite(e))continue;count++;sum+=e;sq+=e*e;abs+=Math.abs(e);}
  return {count,ignored:points.length-count,biasM:count?sum/count:null,rmseM:count?Math.sqrt(sq/count):null,maeM:count?abs/count:null};
}
