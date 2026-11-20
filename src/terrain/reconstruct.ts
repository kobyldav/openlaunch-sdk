import { gridCrsToLonLat,pixelToWorld,validateRaster,lonLatToGridCrs,worldToPixel,type RasterGrid } from "../eo/raster.js";
import { geodeticToEcef } from "../geo/ellipsoid.js";
import type { TerrainCamera,TerrainPixel } from "./camera.js";

export interface TerrainImage {width:number;height:number;values:ArrayLike<number>;source:string;camera:TerrainCamera;}
export interface TerrainGrid {width:number;height:number;crs:RasterGrid["crs"];transform:RasterGrid["transform"];}
export interface TerrainReconstructionOptions {
  images:readonly TerrainImage[]; grid:TerrainGrid;
  minHeightM:number;maxHeightM:number;heightStepM:number;
  patchRadius?:number;minCorrelation?:number;minPeakGap?:number;
  minParallaxPx?:number;maxWork?:number;signal?:AbortSignal;
  /** Sparse pilot sampling; full grid geometry and patch spacing are preserved. */
  sampleStride?:number;
  /** Ignore competing hypotheses inside this height distance when scoring uniqueness. */
  peakExclusionM?:number;
  /** Retry missing cells using image matches and a local search band from first-pass heights. */
  recoverMissing?:boolean;
  /** Refine a winning height against the actual images (rather than a parabola through sweep samples). */
  peakRefinement?:"parabolic"|"image-evidence";
}
export interface TerrainReconstruction {
  elevationMap:RasterGrid; confidenceMap:RasterGrid; texture:RasterGrid;
  pointCloud:{positionsEcefM:Float64Array;confidence:Float32Array};
  mesh:{originEcefM:readonly [number,number,number];positions:Float32Array;triangles:Uint32Array};
  validPixels:number;totalPixels:number;sources:string[];
  /** 0=unmatched, 1=initial stereo, 2=local stereo recovery. No interpolated samples. */
  matchPass:Uint8Array; recoveredPixels:number;
  verticalDatum:"WGS84 ellipsoid";model:"stereo-height-sweep";
}
function sample(im:TerrainImage,p:TerrainPixel):number {
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>=im.width-1||p.y>=im.height-1)return NaN;
  const x=Math.floor(p.x),y=Math.floor(p.y),f=p.x-x,g=p.y-y,i=y*im.width+x;
  const a=im.values[i]!,b=im.values[i+1]!,c=im.values[i+im.width]!,d=im.values[i+im.width+1]!;
  return (1-g)*((1-f)*a+f*b)+g*((1-f)*c+f*d);
}
function checkImage(im:TerrainImage):void {
  if(!Number.isSafeInteger(im.width)||!Number.isSafeInteger(im.height)||im.width<2||im.height<2||im.width*im.height>33_554_432||im.values.length!==im.width*im.height||!im.source||typeof im.camera?.project!=="function")throw new RangeError("Invalid stereo image");
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
  if(o.peakRefinement!==undefined&&o.peakRefinement!=="parabolic"&&o.peakRefinement!=="image-evidence")throw new RangeError("Unknown peak refinement method");
  if(!Number.isInteger(r)||r<1||r>5||!Number.isFinite(minCorr)||minCorr<0||minCorr>1||!Number.isFinite(minGap)||minGap<0||minGap>1||!Number.isFinite(minParallax)||minParallax<=0)throw new RangeError("Invalid matching parameters");
  if(![o.minHeightM,o.maxHeightM,o.heightStepM].every(Number.isFinite)||o.minHeightM>=o.maxHeightM||o.heightStepM<=0)throw new RangeError("Invalid height search");
  const steps=Math.ceil((o.maxHeightM-o.minHeightM)/o.heightStepM)+1,n=grid.width*grid.height;
  if(!Number.isSafeInteger(grid.width)||!Number.isSafeInteger(grid.height)||grid.width<1||grid.height<1||n>500_000||!Number.isSafeInteger(steps)||steps<3||steps>1024)throw new RangeError("Invalid terrain grid or height count");
  const stride=o.sampleStride??1,exclusion=o.peakExclusionM??0;
  if(!Number.isInteger(stride)||stride<1||stride>100||!Number.isFinite(exclusion)||exclusion<0)throw new RangeError("Invalid pilot options");
  const budget=o.maxWork??20_000_000,work=Math.ceil(grid.width/stride)*Math.ceil(grid.height/stride)*steps*((2*r+1)**2+(o.recoverMissing?25+81:0))*images.length;
  if(!Number.isSafeInteger(budget)||budget<1||budget>500_000_000||work>budget)throw new RangeError("Terrain search exceeds work budget; tile the AOI or reduce hypotheses");
  const values=new Float64Array(n).fill(NaN),conf=new Float64Array(n).fill(NaN),tex=new Float64Array(n).fill(NaN);
  const elevationMap:RasterGrid={...grid,values,source:"OpenLaunch stereo reconstruction",unit:"m ellipsoid"};
  validateRaster(elevationMap);
  const scores=new Float64Array(steps);
  const makePatch=(radius:number)=>Array.from({length:(2*radius+1)**2},(_,i)=>[i%(2*radius+1)-radius,Math.floor(i/(2*radius+1))-radius] as const);
  const matchPass=new Uint8Array(n);
  const hs=Array.from({length:steps},(_,i)=>o.minHeightM+(o.maxHeightM-o.minHeightM)*i/(steps-1));
  const cloud:number[]=[],quality:number[]=[],ecef=new Float64Array(n*3).fill(NaN);
  let origin:readonly [number,number,number]=[0,0,0];
  const pass=(radius:number,recovery:boolean,seed?:Float64Array)=>{
  const patch=makePatch(radius);
  for(let row=0;row<grid.height;row+=stride)for(let col=0;col<grid.width;col+=stride){
    if(o.signal?.aborted)throw new Error("Terrain reconstruction aborted");
    const i=row*grid.width+col;
    let lower=o.minHeightM,upper=o.maxHeightM,guide=NaN,tolerance=Infinity;
    if(recovery){
      if(Number.isFinite(values[i]))continue;
      const neighbors:number[]=[];
      for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
        const x=col+dx,y=row+dy;if(x<0||x>=grid.width||y<0||y>=grid.height||(!dx&&!dy))continue;
        const v=seed![y*grid.width+x]!;if(Number.isFinite(v))neighbors.push(v);
      }
      if(neighbors.length<5)continue;
      neighbors.sort((a,b)=>a-b);
      guide=neighbors[Math.floor(neighbors.length/2)]!;
      const spread=neighbors[Math.floor(neighbors.length*.85)]!-neighbors[Math.floor(neighbors.length*.15)]!;
      tolerance=Math.min(160,Math.max(45,spread+20));
      lower=Math.max(lower,guide-tolerance-30);upper=Math.min(upper,guide+tolerance+30);
    }
    const ground=patch.map(([dx,dy])=>{const [x,y]=pixelToWorld(grid.transform,col+0.5+dx,row+0.5+dy);const [longitudeDeg,latitudeDeg]=gridCrsToLonLat(x,y,grid.crs);return {longitudeDeg,latitudeDeg};});
    const center=ground[Math.floor(ground.length/2)]!;
    const endpoints=images.map(im=>[im.camera.project({...center,heightM:hs[0]!}),im.camera.project({...center,heightM:hs[steps-1]!})] as const);
    const [a,b]=endpoints[0]!;
    if(!a||!b||!endpoints.slice(1).some(([c,d])=>c&&d&&Math.hypot((d.x-c.x)-(b.x-a.x),(d.y-c.y)-(b.y-a.y))>=minParallax))continue;
    const scoreAt=(h:number):number=>{
      const samples=images.map(im=>ground.map(g=>{
        const p=im.camera.project({...g,heightM:h});
        return p?sample(im,p):NaN;
      }));
      const pairScores=samples.slice(1).map(v=>ncc(samples[0]!,v));
      return pairScores.every(Number.isFinite)?pairScores.reduce((sum,v)=>sum+v,0)/pairScores.length:NaN;
    };
    scores.fill(NaN);
    for(let k=0;k<steps;k++){
      const h=hs[k]!;if(h>=lower&&h<=upper)scores[k]=scoreAt(h);
    }
    let best=-1;
    for(let k=0;k<steps;k++)if(Number.isFinite(scores[k])&&(best<0||scores[k]!>scores[best]!))best=k;
    if(best<=0||best>=steps-1||scores[best]!<(recovery?Math.max(.65,minCorr-.05):minCorr))continue; // boundary peaks are not bounded
    let other=-Infinity;
    for(let k=0;k<steps;k++)if(Math.abs(k-best)>1&&Math.abs(hs[k]!-hs[best]!)>=exclusion&&Number.isFinite(scores[k]))other=Math.max(other,scores[k]!);
    if(!Number.isFinite(other)||scores[best]!-other<(recovery?Math.max(.015,minGap*.7):minGap))continue;
    const l=scores[best-1]!,m=scores[best]!,u=scores[best+1]!,den=l-2*m+u;
    const delta=Number.isFinite(den)&&den< -1e-12?Math.max(-0.5,Math.min(0.5,0.5*(l-u)/den)):0;
    let h=hs[best]!+delta*(hs[1]!-hs[0]!);
    if(o.peakRefinement==="image-evidence"){
      // The winning discrete hypothesis is already checked for texture and uniqueness.
      // Fine optimization reprojects real pixels at continuous heights; no DEM or spatial
      // smoothing is involved. Search ONLY the adjacent valid hypotheses.
      let low=Math.max(lower,hs[best-1]!),high=Math.min(upper,hs[best+1]!);
      const ratio=(Math.sqrt(5)-1)/2;
      let x=high-ratio*(high-low),y=low+ratio*(high-low);
      let sx=scoreAt(x),sy=scoreAt(y);
      if(Number.isFinite(sx)&&Number.isFinite(sy)){
        for(let iter=0;iter<9;iter++){
          if(sx>sy){high=y;y=x;sy=sx;x=high-ratio*(high-low);sx=scoreAt(x);}
          else{low=x;x=y;sx=sy;y=low+ratio*(high-low);sy=scoreAt(y);}
          if(!Number.isFinite(sx)||!Number.isFinite(sy))break;
        }
        // Avoid moving to a weaker correspondence merely to obtain a finer number.
        const bestEvidence=[{h:hs[best]!,score:m},{h:x,score:sx},{h:y,score:sy}]
          .filter(v=>Number.isFinite(v.score)).sort((a,b)=>b.score-a.score)[0];
        if(bestEvidence)h=bestEvidence.h;
      }
    }
    if(recovery&&(!Number.isFinite(l)||!Number.isFinite(u)||Math.abs(h-guide)>tolerance))continue;
    const q=Math.min(1,Math.max(0,m)*Math.min(1,(m-other)/0.2));
    values[i]=h;conf[i]=q;matchPass[i]=recovery?2:1;
    const p=images[0]!.camera.project({...center,heightM:h});if(p)tex[i]=sample(images[0]!,p);
    const v=geodeticToEcef({...center,altitudeM:h});
    if(!cloud.length)origin=v;
    cloud.push(...v);quality.push(q);ecef.set(v,i*3);
  }
  };
  pass(r,false);
  if(o.recoverMissing&&stride===1){const seed=values.slice();pass(2,true,seed);pass(4,true,seed);}
  const recoveredPixels=matchPass.reduce((sum,v)=>sum+(v===2?1:0),0);
  const positions=new Float32Array(n*3).fill(NaN),triangles:number[]=[];
  for(let i=0;i<n;i++)if(Number.isFinite(values[i]))for(let k=0;k<3;k++)positions[3*i+k]=ecef[3*i+k]!-origin[k]!;
  for(let y=0;y<grid.height-1;y++)for(let x=0;x<grid.width-1;x++){
    const a=y*grid.width+x,b=a+1,c=a+grid.width,d=c+1;
    if([a,b,c].every(i=>Number.isFinite(values[i])))triangles.push(a,c,b);
    if([b,c,d].every(i=>Number.isFinite(values[i])))triangles.push(b,c,d);
  }
  return {elevationMap,confidenceMap:{...grid,values:conf,source:"matching heuristic",unit:"1"},texture:{...grid,values:tex,source:images[0]!.source,unit:"input intensity"},pointCloud:{positionsEcefM:new Float64Array(cloud),confidence:new Float32Array(quality)},mesh:{originEcefM:origin,positions,triangles:new Uint32Array(triangles)},validPixels:quality.length,totalPixels:n,matchPass,recoveredPixels,sources:images.map(i=>i.source),verticalDatum:"WGS84 ellipsoid",model:"stereo-height-sweep"};
}
/** Compare against independent ellipsoidal checkpoints; nearest grid pixel, no interpolation. */
export function validateTerrainHeights(dem:RasterGrid,points:readonly {col:number;row:number;heightM:number}[]):{count:number;ignored:number;biasM:number|null;rmseM:number|null;maeM:number|null}{
  validateRaster(dem);let count=0,sum=0,sq=0,abs=0;
  for(const p of points){const x=Math.round(p.col),y=Math.round(p.row);if(!Number.isFinite(p.heightM)||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=dem.width||y>=dem.height)continue;const e=dem.values[y*dem.width+x]!-p.heightM;if(!Number.isFinite(e))continue;count++;sum+=e;sq+=e*e;abs+=Math.abs(e);}
  return {count,ignored:points.length-count,biasM:count?sum/count:null,rmseM:count?Math.sqrt(sq/count):null,maeM:count?abs/count:null};
}

/** Independent geodetic checkpoints, e.g. ICESat-2 samples converted to WGS84 ellipsoidal heights. */
export function validateTerrainGeodetic(dem:RasterGrid,points:readonly {longitudeDeg:number;latitudeDeg:number;heightM:number}[]){
  const pixels=points.map(p=>{
    try{const [x,y]=lonLatToGridCrs(p.longitudeDeg,p.latitudeDeg,dem.crs);
      const [col,row]=worldToPixel(dem.transform,x,y);return {col:col-0.5,row:row-0.5,heightM:p.heightM};}
    catch{return {col:NaN,row:NaN,heightM:p.heightM};}
  });
  return validateTerrainHeights(dem,pixels);
}
/** ASCII PLY point cloud with double-precision ECEF coordinates (metres). */
export function terrainPointCloudPly(result:TerrainReconstruction):string {
  const {positionsEcefM,confidence}=result.pointCloud;
  if(positionsEcefM.length!==3*confidence.length||confidence.length>500_000)throw new RangeError("Invalid point cloud");
  const lines=["ply","format ascii 1.0","comment WGS84 ECEF metres","element vertex "+confidence.length,"property double x","property double y","property double z","property float confidence","end_header"];
  for(let i=0;i<confidence.length;i++)lines.push([positionsEcefM[3*i],positionsEcefM[3*i+1],positionsEcefM[3*i+2],confidence[i]].join(" "));
  return lines.join("\n")+"\n";
}
