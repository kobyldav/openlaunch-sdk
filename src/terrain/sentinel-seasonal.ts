/** Same-season, two-year Sentinel-2 L2A NDVI composites from real COG
 * observations. Uses only calibrated source numeric NDVI and both years'
 * accepted SCL/reflectance pixels; no gap-filling or inferred observations.
 *
 * This measures observed interannual NDVI differences, not a causal change,
 * forecast, cloud-free coverage claim or statistically significant trend.
 */
import type {SentinelNdviEvidence} from "./sentinel-change.js";

export const SENTINEL_SEASONAL_COMPOSITE_VERSION=2;
const finite=Number.isFinite;
export interface SentinelSeasonalOptions{
  /** Visualization threshold; not a validated significance test. Default 0.15 NDVI. */
  thresholdNdvi?:number;
  /** Genuine pixels valid in both yearly composites; default 16. */
  minOverlapPixels?:number;
  /** Pixel needs this many clear acquisitions from EACH year (1 or 2). */
  minValidPerYear?:1|2;
}
export interface SentinelSeasonalComposite{
  status:"real-sentinel-interannual-ndvi";
  version:number;
  source:string;
  before:{year:number;month:number;scenes:{sceneId:string;acquiredAt:string;
    validPixels:number}[]};
  after:{year:number;month:number;scenes:{sceneId:string;acquiredAt:string;
    validPixels:number}[]};
  area:SentinelNdviEvidence["area"];
  grid:SentinelNdviEvidence["grid"];
  width:number;height:number;groundSamplingM:number;
  /** Calibrated after-year median NDVI minus before-year median NDVI. */
  deltaValues:Float32Array;
  /** Number of genuine SCL-valid acquisitions in each year at each pixel. */
  beforeValidCount:Uint8Array;afterValidCount:Uint8Array;
  deltaRgba:Uint8Array;
  statistics:{
    totalPixels:number;overlapPixels:number;overlapPercent:number;
    missingEitherPixels:number;robustTwoPerYearPixels:number;
    oneOrMorePerYearPixels:number;minValidPerYear:number;
    increasedPixels:number;decreasedPixels:number;stablePixels:number;
    thresholdNdvi:number;
    meanDeltaNdvi:number;minDeltaNdvi:number;maxDeltaNdvi:number;
    beforeMeanNdviOnOverlap:number;afterMeanNdviOnOverlap:number;
    medianAcquisitionDayShift:number;
    lowCoverageWarning:boolean;dateShiftWarning:boolean;
  };
  qa:{sameMonth:true;distinctYears:true;identicalGrid:true;
    independentSourceScenes:true;pixelSclMasked:true;noCloudGapFilling:true;
    medianPerYear:true;pairedPixelIntersection:true};
  caveats:string[];
}
function verify(e:SentinelNdviEvidence,name:string){
 if(!e||e.status!=="real-sentinel2-observation"||e.version!==2||
    typeof e.source!=="string"||!e.source.includes("Sentinel-2")||
    !/^[A-Za-z0-9_-]{5,120}$/.test(e.sceneId)||
    !finite(Date.parse(e.acquiredAt))||e.qa?.sclMask!==true||
    e.grid?.crs!=="EPSG:3857"||
    !Number.isInteger(e.width)||!Number.isInteger(e.height)||
    e.width<2||e.height<2||e.width*e.height>50000||
    !finite(e.groundSamplingM)||e.groundSamplingM<10||
    !Array.isArray(e.area)||e.area.length!==4||
    e.area.some(x=>!finite(x))||
    !Array.isArray(e.grid.transform)||e.grid.transform.length!==6||
    e.grid.transform.some(x=>!finite(x))||
    !(e.ndviValues instanceof Float32Array)||
    e.ndviValues.length!==e.width*e.height||
    !Number.isInteger(e.statistics?.validPixels))
   throw new RangeError(name+" missing calibrated masked Sentinel-2 evidence");
 let valid=0;
 for(const value of e.ndviValues){
   if(Number.isNaN(value))continue;
   if(!finite(value)||value< -1.00001||value>1.00001)
     throw new RangeError(name+" has out-of-range/non-finite NDVI");
   valid++;
 }
 if(valid!==e.statistics.validPixels)
   throw new RangeError(name+" does not match SCL source pixel counts");
}
function median(input:number[]):number{
 input.sort((a,b)=>a-b);
 const middle=Math.floor(input.length/2);
 return input.length%2?input[middle]!:
   (input[middle-1]!+input[middle]!)/2;
}
function palette(delta:number,threshold:number):[number,number,number]{
 if(delta>=threshold){
   const q=Math.min(1,delta/.65);
   return [Math.round(95-q*72),Math.round(173-q*52),
     Math.round(120-q*35)];
 }
 if(delta<=-threshold){
   const q=Math.min(1,-delta/.65);
   return [Math.round(170+q*65),Math.round(124-q*72),
     Math.round(144-q*78)];
 }
 return [201,199,188];
}
/** Two matched calendar months in two different years, 2–3 independent
 * source acquisitions per year. Pixel median is built *only* from real
 * available measurements; pixels without a source in either year are NoData.
 */
export function compareSentinelSeasonalNdvi(
 before:readonly SentinelNdviEvidence[],
 after:readonly SentinelNdviEvidence[],
 options:SentinelSeasonalOptions={}
):SentinelSeasonalComposite{
 if(!Array.isArray(before)||!Array.isArray(after)||
    before.length<2||after.length<2||
    before.length>3||after.length>3)
   throw new RangeError("Same-season comparison requires 2..3 real scenes per year");
 const threshold=options.thresholdNdvi??.15;
 const minOverlap=options.minOverlapPixels??16;
 const minPerYear=options.minValidPerYear??1;
 if(!finite(threshold)||threshold<=0||threshold>1||
    !Number.isInteger(minOverlap)||minOverlap<4||minOverlap>50000||
    ![1,2].includes(minPerYear))
   throw new RangeError("Invalid seasonal threshold, pixel overlap or per-year minimum");
 const scenes=[...before,...after];
 scenes.forEach((scene,i)=>verify(scene,"Scene "+i));
 const reference=scenes[0]!;
 for(const current of scenes.slice(1))
   if(current.width!==reference.width||current.height!==reference.height||
      current.groundSamplingM!==reference.groundSamplingM||
      current.area.some((v:number,i:number)=>v!==reference.area[i])||
      current.grid.transform.some((v:number,i:number)=>v!==reference.grid.transform[i]))
     throw new RangeError("Seasonal inputs use mismatched source pixel grids");
 const sceneIds=new Set(scenes.map(s=>s.sceneId));
 const dates=scenes.map(s=>new Date(s.acquiredAt));
 const days=dates.map(d=>d.toISOString().slice(0,10));
 if(sceneIds.size!==scenes.length||new Set(days).size!==days.length)
   throw new RangeError("Each seasonal observation requires a distinct acquisition date and scene");
 const beforeYear=dates[0]!.getUTCFullYear();
 const afterYear=dates[before.length]!.getUTCFullYear();
 const month=dates[0]!.getUTCMonth()+1;
 if(beforeYear>=afterYear||afterYear-beforeYear>15||
    !scenes.every((s,i)=>
      dates[i]!.getUTCFullYear()===(i<before.length?beforeYear:afterYear)&&
      dates[i]!.getUTCMonth()+1===month))
   throw new RangeError("Seasonal observations must share calendar month across two ordered years");
 // With multiple source scenes in a month, report the difference between
 // median acquisition day-of-month as a warning if >10 days.
 const beforeDay=median(dates.slice(0,before.length).map(d=>d.getUTCDate()));
 const afterDay=median(dates.slice(before.length).map(d=>d.getUTCDate()));
 const dayShift=Math.abs(beforeDay-afterDay);
 const n=reference.width*reference.height;
 const beforeValidCount=new Uint8Array(n),afterValidCount=new Uint8Array(n);
 const deltaValues=new Float32Array(n);deltaValues.fill(NaN);
 const deltaRgba=new Uint8Array(n*4);
 let overlap=0,robust=0,candidates=0,increased=0,decreased=0,stable=0;
 let sumBefore=0,sumAfter=0,sumDelta=0,min=Infinity,max=-Infinity;
 for(let p=0;p<n;p++){
   const old=before.map(s=>s.ndviValues[p]!).filter(finite);
   const fresh=after.map(s=>s.ndviValues[p]!).filter(finite);
   beforeValidCount[p]=old.length;afterValidCount[p]=fresh.length;
   if(old.length>=1&&fresh.length>=1)candidates++;
   if(old.length>=2&&fresh.length>=2)robust++;
   if(old.length<minPerYear||fresh.length<minPerYear)continue;
   const previous=median(old),current=median(fresh);
   const delta=current-previous;
   deltaValues[p]=delta;overlap++;
   sumBefore+=previous;sumAfter+=current;sumDelta+=delta;
   min=Math.min(min,delta);max=Math.max(max,delta);
   if(delta>=threshold)increased++;
   else if(delta<=-threshold)decreased++;
   else stable++;
   // Stable source-measured pixels retain visible real ČÚZK ortho detail:
   // tint lightly; strong measured differences stay highly visible.
   const alpha=Math.abs(delta)>=threshold?245:90;
   deltaRgba.set([...palette(delta,threshold),alpha],p*4);
 }
 if(overlap<minOverlap)
   throw new Error("Insufficient real SCL-valid interannual overlap: "+overlap+
     "/"+n+" pixels; required "+minOverlap+". No cloud gap filling.");
 const ordered=(data:readonly SentinelNdviEvidence[])=>[...data]
   .sort((a,b)=>Date.parse(a.acquiredAt)-Date.parse(b.acquiredAt))
   .map(s=>({sceneId:s.sceneId,acquiredAt:s.acquiredAt,
     validPixels:s.statistics.validPixels}));
 return {
   status:"real-sentinel-interannual-ndvi",
   version:SENTINEL_SEASONAL_COMPOSITE_VERSION,
   source:"Copernicus Sentinel-2 L2A / Element84 Earth Search COG; "+
     "two calendar-month matched measured SCL-masked yearly NDVI composites",
   before:{year:beforeYear,month,scenes:ordered(before)},
   after:{year:afterYear,month,scenes:ordered(after)},
   area:reference.area,grid:reference.grid,
   width:reference.width,height:reference.height,
   groundSamplingM:reference.groundSamplingM,
   deltaValues,beforeValidCount,afterValidCount,deltaRgba,
   statistics:{
     totalPixels:n,overlapPixels:overlap,overlapPercent:100*overlap/n,
     missingEitherPixels:n-overlap,robustTwoPerYearPixels:robust,
     oneOrMorePerYearPixels:candidates,minValidPerYear:minPerYear,
     increasedPixels:increased,decreasedPixels:decreased,stablePixels:stable,
     thresholdNdvi:threshold,meanDeltaNdvi:sumDelta/overlap,
     minDeltaNdvi:min,maxDeltaNdvi:max,
     beforeMeanNdviOnOverlap:sumBefore/overlap,
     afterMeanNdviOnOverlap:sumAfter/overlap,
     medianAcquisitionDayShift:dayShift,
     lowCoverageWarning:overlap/n<.25,dateShiftWarning:dayShift>10
   },
   qa:{sameMonth:true,distinctYears:true,identicalGrid:true,
     independentSourceScenes:true,pixelSclMasked:true,
     noCloudGapFilling:true,medianPerYear:true,pairedPixelIntersection:true},
   caveats:[
     "Measured median of 2–3 true Sentinel-2 L2A acquisitions for the SAME calendar month in each year.",
     "Per-pixel annual median uses only real SCL-valid acquisitions; no cloud or missing-source pixel is filled.",
     "Default requires at least one clear valid observation per year per pixel; only robustTwoPerYearPixels have >=2 in both years.",
     "Mean annual NDVI values are calculated on the SAME pixels valid in both years, not changing sample denominators.",
     "This is a descriptive interannual spectral difference, NOT a statistically significant land-cover classification or causal diagnosis.",
     "Calendar-month matching reduces, but does not eliminate, phenology, solar-angle, weather, and atmospheric-correction differences.",
     "A low common-area fraction or >10-day shift of median day-of-month reduces comparability.",
     "The 0.15 NDVI visualization threshold is not a statistical confidence threshold.",
     "Native Sentinel-2 ~10m pixels, ČÚZK DSM geometry and Bpv heights stay unchanged."
   ]
 };
}
