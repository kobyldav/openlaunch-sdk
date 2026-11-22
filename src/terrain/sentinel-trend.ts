/** Multi-acquisition Sentinel-2 NDVI trend over an *identical*, dual-SCL-quality
 * controlled geographic footprint. A short-window rate is NOT a long-term
 * vegetation trend, causal inference, or land-cover-change classification.
 *
 * The median of all observed pairwise temporal slopes (Theil–Sen) is robust
 * to one anomalous acquisition; masks use the intersection of ALL scene data.
 * The returned NDVI-per-30-days value describes an observed window only.
 */
import type {SentinelNdviEvidence} from "./sentinel-change.js";
export const SENTINEL_NDVI_TREND_VERSION=1;
export const SENTINEL_TREND_MAX_SCENES=6;
const finite=Number.isFinite,DAY_MS=86400000;
export interface SentinelTrendOptions{
 /** Theil–Sen slope threshold in NDVI per 30 days, for colors only. */
 thresholdNdviPer30Days?:number;
 /** Minimum number of common valid pixels required for ANY result. */
 minCommonPixels?:number;
}
export interface SentinelNdviTrend{
 status:"real-sentinel-ndvi-time-series";
 version:number;
 source:string;
 scenes:{sceneId:string;acquiredAt:string;validPixels:number;
   meanNdviCommon:number}[];
 area:SentinelNdviEvidence["area"];grid:SentinelNdviEvidence["grid"];
 width:number;height:number;groundSamplingM:number;
 slopePer30Days:Float32Array;
 trendRgba:Uint8Array;
 statistics:{
  totalPixels:number;sceneCount:number;spanDays:number;
  commonValidPixels:number;commonValidPercent:number;
  excludedPixels:number;
  firstMeanNdvi:number;lastMeanNdvi:number;meanChangeNdvi:number;
  meanSlopePer30Days:number;minSlopePer30Days:number;maxSlopePer30Days:number;
  increasingPixels:number;decreasingPixels:number;stablePixels:number;
  thresholdNdviPer30Days:number;
 };
 qa:{allSclMasked:true;sameGrid:true;fixedCommonPixelPopulation:true;
   theilSen:true;noGapFilling:true};
 caveats:string[];
}
function median(items:number[]):number{
 items.sort((a,b)=>a-b);
 const mid=items.length>>1;
 return items.length%2?items[mid]!:(items[mid-1]!+items[mid]!)/2;
}
function validateScene(s:SentinelNdviEvidence,index:number):void{
 const prefix="Scene "+index;
 if(!s||s.status!=="real-sentinel2-observation"||s.version!==2||
    !/^[A-Za-z0-9_-]{5,120}$/.test(s.sceneId)||
    typeof s.source!=="string"||!s.source.includes("Sentinel-2")||
    !finite(Date.parse(s.acquiredAt))||
    s.qa?.sclMask!==true||s.grid?.crs!=="EPSG:3857"||
    !Number.isInteger(s.width)||!Number.isInteger(s.height)||
    s.width<2||s.height<2||s.width*s.height>50000||
    !finite(s.groundSamplingM)||s.groundSamplingM<10||
    !Array.isArray(s.area)||s.area.length!==4||s.area.some(v=>!finite(v))||
    !Array.isArray(s.grid.transform)||s.grid.transform.length!==6||
    s.grid.transform.some(v=>!finite(v))||
    !(s.ndviValues instanceof Float32Array)||
    s.ndviValues.length!==s.width*s.height||
    !Number.isInteger(s.statistics?.validPixels))
   throw new RangeError(prefix+" lacks source-verified numeric NDVI / SCL grid");
 let count=0;
 for(const v of s.ndviValues){
   if(Number.isNaN(v))continue;
   if(!finite(v)||v< -1.00001||v>1.00001)
     throw new RangeError(prefix+" contains uncalibrated/out-of-range NDVI");
   count++;
 }
 if(count!==s.statistics.validPixels)
   throw new RangeError(prefix+" has inconsistent valid SCL pixel count");
}
/** Compute a robust temporal-rate visualization only when 3..6 actual,
 * unique chronological Sentinel scenes share exactly the same grid.
 * A uniform intersected population underlies EVERY mean and slope.
 */
export function analyzeSentinelNdviTimeSeries(
 observations:readonly SentinelNdviEvidence[],options:SentinelTrendOptions={}
):SentinelNdviTrend{
 const threshold=options.thresholdNdviPer30Days??.12;
 const minCommon=options.minCommonPixels??16;
 if(!finite(threshold)||threshold<=0||threshold>1||
    !Number.isInteger(minCommon)||minCommon<4||minCommon>50000)
   throw new RangeError("Trend threshold must be in (0,1], common pixels >=4");
 if(!Array.isArray(observations)||observations.length<3||
    observations.length>SENTINEL_TREND_MAX_SCENES)
   throw new RangeError("NDVI temporal trend needs 3..6 genuine Sentinel observations");
 const scenes=[...observations];
 scenes.forEach(validateScene);
 scenes.sort((a,b)=>Date.parse(a.acquiredAt)-Date.parse(b.acquiredAt));
 const reference=scenes[0]!;
 for(let i=1;i<scenes.length;i++){
   const s=scenes[i]!,prev=scenes[i-1]!;
   if(s.sceneId===prev.sceneId||Date.parse(s.acquiredAt)<=Date.parse(prev.acquiredAt))
     throw new RangeError("Temporal scenes must have distinct, strictly increasing acquisitions");
   if(s.width!==reference.width||s.height!==reference.height||
      s.groundSamplingM!==reference.groundSamplingM||
      s.area.some((n:number,k:number)=>n!==reference.area[k])||
      s.grid.transform.some((n:number,k:number)=>n!==reference.grid.transform[k]))
     throw new RangeError("Source NDVI time series must share exact pixel grid / extent");
 }
 const dates=scenes.map(s=>Date.parse(s.acquiredAt)/DAY_MS);
 const spanDays=dates[dates.length-1]!-dates[0]!;
 if(spanDays<14)
   throw new RangeError("NDVI time series shorter than 14 days cannot establish a usable trend");
 const n=reference.width*reference.height;
 const slopePer30Days=new Float32Array(n);slopePer30Days.fill(NaN);
 const trendRgba=new Uint8Array(n*4);
 const totals=new Float64Array(scenes.length);
 let commonValid=0,positive=0,negative=0,stable=0,
   sumSlope=0,minSlope=Infinity,maxSlope=-Infinity;
 for(let p=0;p<n;p++){
   const v=scenes.map(s=>s.ndviValues[p]!);
   if(v.some(n=>!finite(n)))continue;
   const slopes:number[]=[];
   for(let i=0;i<scenes.length;i++)for(let j=i+1;j<scenes.length;j++)
     slopes.push((v[j]!-v[i]!)/(dates[j]!-dates[i]!)*30);
   const slope=median(slopes);
   if(!finite(slope))throw Error("Invalid robust temporal slope");
   slopePer30Days[p]=slope;commonValid++;sumSlope+=slope;
   minSlope=Math.min(minSlope,slope);maxSlope=Math.max(maxSlope,slope);
   for(let k=0;k<v.length;k++)totals[k]+=v[k]!;
   let color:[number,number,number];
   if(slope>=threshold){
     positive++;const shade=Math.min(1,Math.abs(slope)/.45);
     color=[Math.round(90-58*shade),Math.round(174-45*shade),Math.round(130-38*shade)];
   }else if(slope<=-threshold){
     negative++;const shade=Math.min(1,Math.abs(slope)/.45);
     color=[Math.round(177+61*shade),Math.round(120-75*shade),Math.round(135-60*shade)];
   }else{stable++;color=[196,198,188];}
   trendRgba.set([...color,255],p*4);
 }
 if(commonValid<minCommon)
   throw new Error("Insufficient common cloud-free time-series pixels ("+commonValid+
     "; required "+minCommon+"). No synthetic temporal interpolation allowed.");
 const sceneMeans=scenes.map((s,i)=>({
   sceneId:s.sceneId,acquiredAt:s.acquiredAt,
   validPixels:s.statistics.validPixels,meanNdviCommon:totals[i]!/commonValid
 }));
 const firstMeanNdvi=sceneMeans[0]!.meanNdviCommon;
 const lastMeanNdvi=sceneMeans[sceneMeans.length-1]!.meanNdviCommon;
 return {
   status:"real-sentinel-ndvi-time-series",
   version:SENTINEL_NDVI_TREND_VERSION,
   source:"Copernicus Sentinel-2 L2A / Element84 Earth Search public COG; "+
     "fixed-population SCL-masked NDVI time series",
   scenes:sceneMeans,area:reference.area,grid:reference.grid,
   width:reference.width,height:reference.height,
   groundSamplingM:reference.groundSamplingM,
   slopePer30Days,trendRgba,
   statistics:{
     totalPixels:n,sceneCount:scenes.length,spanDays,
     commonValidPixels:commonValid,commonValidPercent:commonValid/n*100,
     excludedPixels:n-commonValid,
     firstMeanNdvi,lastMeanNdvi,meanChangeNdvi:lastMeanNdvi-firstMeanNdvi,
     meanSlopePer30Days:sumSlope/commonValid,
     minSlopePer30Days:minSlope,maxSlopePer30Days:maxSlope,
     increasingPixels:positive,decreasingPixels:negative,stablePixels:stable,
     thresholdNdviPer30Days:threshold
   },
   qa:{allSclMasked:true,sameGrid:true,fixedCommonPixelPopulation:true,
     theilSen:true,noGapFilling:true},
   caveats:[
     "Three or more genuine dated Sentinel-2 L2A NDVI observations; exact same 10m pixel centers and SCL masks.",
     "Each temporal mean and per-pixel slope uses ONLY the intersection of pixels valid in ALL selected scenes.",
     "Median observed pairwise slopes (Theil–Sen) expressed per 30 days; descriptive rate for the observed date interval, NOT a forecast.",
     "The 0.12 NDVI/30-day color threshold is a user-facing illustrative choice, NOT evidence of significant land-cover change.",
     "Seasonality, changing solar geometry, atmosphere, scene corrections and inaccurate SCL classification may explain the pattern.",
     "This is NOT a scientifically controlled multi-year vegetation trend, deforestation inventory, or ecological diagnosis.",
     "No inferred heights or invented clear-sky pixels; the true ČÚZK 3D DEM and Bpv height datum remain unchanged."
   ]
 };
}
