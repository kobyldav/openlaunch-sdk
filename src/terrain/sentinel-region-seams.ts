/** Stage 18: cross-tile seam diagnostics from ORIGINAL multi-year NDVI slopes.
 * Captures only native edge samples. No blending, resampling or invented pixels.
 * An observed difference at adjacent pixel CENTERS is not proof of an artifact.
 */
import type {SentinelRegionBounds} from "./sentinel-region.js";

export const SENTINEL_REGION_SEAM_VERSION=1;
export interface SentinelRegionSeamInput{
 key:string;bounds:SentinelRegionBounds;
 width:number;height:number;
 grid:{crs:"EPSG:3857";transform:readonly number[]};
 slopePerYear:Float32Array;
 years:readonly {year:number;scenes:readonly {sceneId:string;acquiredAt:string}[]}[];
}
export interface SentinelRegionSeamEdges{
 key:string;bounds:SentinelRegionBounds;width:number;height:number;
 transform:readonly number[];
 years:{year:number;scenes:{sceneId:string;acquiredAt:string}[]}[];
 north:Float32Array;south:Float32Array;west:Float32Array;east:Float32Array;
}
export interface SentinelRegionSeam{
 status:"real-sentinel-region-seam-check";
 version:number;tileA:string;tileB:string;
 orientation:"east-west"|"north-south";
 comparableSources:boolean;
 state:"comparable"|"different-acquisitions"|"unaligned-grid"|"insufficient-edge-data";
 pairedPixels:number;
 sourceEdgePixels:number;
 /** Descriptive difference of adjacent, nonidentical ORIGINAL pixel centers. */
 meanAbsDifferenceNdviPerYear:number|null;
 maxAbsDifferenceNdviPerYear:number|null;
 meanSignedBMinusANdviPerYear:number|null;
 warning:boolean;note:string;
}
const almost=(a:number,b:number,eps=1e-7)=>Math.abs(a-b)<=eps;
const finite=(v:number)=>Number.isFinite(v);
export function captureSentinelRegionSeamEdges(input:SentinelRegionSeamInput):
 SentinelRegionSeamEdges{
 const {width:w,height:h,grid,bounds,slopePerYear,years}=input;
 const t=grid?.transform;
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(input.key)||
   !Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||w*h>50000||
   !(slopePerYear instanceof Float32Array)||slopePerYear.length!==w*h||
   !bounds||![bounds.west,bounds.south,bounds.east,bounds.north].every(finite)||
   bounds.west>=bounds.east||bounds.south>=bounds.north||
   grid.crs!=="EPSG:3857"||!Array.isArray(t)||t.length!==6||
   !t.every(finite)||t[2]!==0||t[4]!==0||t[1]<=0||t[5]>=0||
   !Array.isArray(years)||years.length<3||years.length>5||
   !years.every((y,i)=>Number.isInteger(y.year)&&
     (i===0||y.year===years[i-1]!.year+1)&&
     Array.isArray(y.scenes)&&y.scenes.length===2&&
     y.scenes.every((s:{sceneId:string;acquiredAt:string})=>/^[A-Za-z0-9_-]{5,120}$/.test(s.sceneId)&&
       finite(Date.parse(s.acquiredAt)))))
   throw new RangeError("Seam requires a source-verified georeferenced NDVI edge raster");
 const R=6378137,merc=(lon:number,lat:number):[number,number]=>
   [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
 const [x0,y0]=merc(bounds.west,bounds.north);
 const [x1,y1]=merc(bounds.east,bounds.south);
 if(Math.abs(t[0]!-x0)>.25||Math.abs(t[3]!-y0)>.25||
   Math.abs(t[0]!+t[1]!*w-x1)>.25||
   Math.abs(t[3]!+t[5]!*h-y1)>.25)
   throw new RangeError("Seam input grid is not located at original tile bounds");
 for(const v of slopePerYear)
   if(!Number.isNaN(v)&&(!finite(v)||Math.abs(v)>2))
     throw new RangeError("Invalid observed NDVI/year slope");
 const north=new Float32Array(w),south=new Float32Array(w),
   west=new Float32Array(h),east=new Float32Array(h);
 for(let x=0;x<w;x++){north[x]=slopePerYear[x]!;south[x]=slopePerYear[(h-1)*w+x]!;}
 for(let y=0;y<h;y++){west[y]=slopePerYear[y*w]!;east[y]=slopePerYear[y*w+w-1]!;}
 return {key:input.key,bounds:{...bounds},width:w,height:h,
   transform:[...t],years:years.map(y=>({year:y.year,
     scenes:y.scenes.map((s:{sceneId:string;acquiredAt:string})=>({sceneId:s.sceneId,acquiredAt:s.acquiredAt}))})),
   north,south,west,east};
}
export function compareSentinelRegionSeamEdges(a:SentinelRegionSeamEdges,
 b:SentinelRegionSeamEdges,thresholdNdviPerYear=.08):SentinelRegionSeam{
 if(!finite(thresholdNdviPerYear)||thresholdNdviPerYear<=0||
   thresholdNdviPerYear>2||a.key===b.key)
   throw new RangeError("Invalid seam threshold or identical tile identity");
 let orientation:"east-west"|"north-south";
 let ae:Float32Array,be:Float32Array;
 let left=a,right=b;
 if(almost(a.bounds.east,b.bounds.west)&&
   almost(a.bounds.north,b.bounds.north)&&almost(a.bounds.south,b.bounds.south)){
   orientation="east-west";ae=a.east;be=b.west;
 }else if(almost(b.bounds.east,a.bounds.west)&&
   almost(a.bounds.north,b.bounds.north)&&almost(a.bounds.south,b.bounds.south)){
   orientation="east-west";left=b;right=a;ae=b.east;be=a.west;
 }else if(almost(a.bounds.south,b.bounds.north)&&
   almost(a.bounds.west,b.bounds.west)&&almost(a.bounds.east,b.bounds.east)){
   orientation="north-south";ae=a.south;be=b.north;
 }else if(almost(b.bounds.south,a.bounds.north)&&
   almost(a.bounds.west,b.bounds.west)&&almost(a.bounds.east,b.bounds.east)){
   orientation="north-south";left=b;right=a;ae=b.south;be=a.north;
 }else throw new RangeError("Seam tiles must share one complete geographic edge");
 const sameSource=a.years.length===b.years.length&&a.years.every((y,i)=>
   y.year===b.years[i]?.year&&
   y.scenes.length===b.years[i]?.scenes.length&&
   y.scenes.every((s,j)=>s.sceneId===b.years[i]?.scenes[j]?.sceneId&&
     s.acquiredAt===b.years[i]?.scenes[j]?.acquiredAt));
 const x=orientation==="east-west",tl=left.transform,tr=right.transform;
 // Pixel centers directly opposite one another, without interpolation.
 const aligned=ae.length===be.length&&
   (x?almost(tl[3]!,tr[3]!,0.3)&&almost(tl[5]!,tr[5]!,0.3)&&
       Math.abs((tl[0]!+tl[1]!*left.width)-tr[0]!)<.3:
       almost(tl[0]!,tr[0]!,0.3)&&almost(tl[1]!,tr[1]!,0.3)&&
       Math.abs((tl[3]!+tl[5]!*left.height)-tr[3]!)<.3);
 let pairs=0,sumAbs=0,sumSigned=0,maxAbs=0;
 if(aligned&&sameSource){
   for(let i=0;i<ae.length;i++){
     const one=ae[i]!,two=be[i]!;
     if(!finite(one)||!finite(two))continue;
     const d=two-one,ad=Math.abs(d);
     pairs++;sumAbs+=ad;sumSigned+=d;maxAbs=Math.max(maxAbs,ad);
   }
 }
 const state:SentinelRegionSeam["state"]=!sameSource?"different-acquisitions":
   !aligned?"unaligned-grid":pairs===0?"insufficient-edge-data":"comparable";
 return {status:"real-sentinel-region-seam-check",
   version:SENTINEL_REGION_SEAM_VERSION,tileA:left.key,tileB:right.key,
   orientation,comparableSources:sameSource,state,
   sourceEdgePixels:Math.min(ae.length,be.length),pairedPixels:pairs,
   meanAbsDifferenceNdviPerYear:pairs?sumAbs/pairs:null,
   maxAbsDifferenceNdviPerYear:pairs?maxAbs:null,
   meanSignedBMinusANdviPerYear:pairs?sumSigned/pairs:null,
   warning:state!=="comparable"||sumAbs/Math.max(1,pairs)>thresholdNdviPerYear,
   note:state==="different-acquisitions"?
     "Different original Sentinel scene IDs/times: no quantitative seam comparison.":
     state==="unaligned-grid"?
     "Pixel rows/columns do not align: no resampling or synthetic overlap.":
     state==="insufficient-edge-data"?
     "No pair of genuine SCL-valid edge pixels: difference unknown.":
     "Original adjacent distinct pixel centers, not co-located measurements. "+
     "Difference is observational, not evidence of a rendering error or a statistically significant ecological discontinuity."
 };
}
