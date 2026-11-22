/** Annual same-calendar-month Sentinel-2 L2A NDVI trend across 3–5 years.
 * Uses ONLY original calibrated Float32 NDVI values and accepted SCL pixels.
 * Per-year 2-scene medians (no gap filling), then per-pixel Theil–Sen slope
 * in NDVI/year. Leave-one-year-out ranges measure sensitivity, NOT statistical
 * confidence, significance or a forecast.
 */
import type {SentinelNdviEvidence} from "./sentinel-change.js";

export const SENTINEL_MULTIYEAR_VERSION=1;
export interface SentinelYearSeason{
 year:number;
 observations:readonly SentinelNdviEvidence[];
}
export interface SentinelMultiYearOptions{
 /** Purely illustrative magnitude threshold in NDVI/year. */
 thresholdNdviPerYear?:number;
 /** Minimum number of pixels observed in every year. */
 minCommonPixels?:number;
 /** 1 = one actual clear measurement per year; 2 = both years' scenes clear. */
 minValidPerYear?:1|2;
}
export interface SentinelMultiYearResult{
 status:"real-sentinel-multiyear-seasonal-trend";
 version:number;source:string;
 month:number;
 years:{year:number;scenes:{sceneId:string;acquiredAt:string;validPixels:number}[];
   medianAcquisitionDay:number;meanNdviOnCommon:number}[];
 area:SentinelNdviEvidence["area"];
 grid:SentinelNdviEvidence["grid"];
 width:number;height:number;groundSamplingM:number;
 slopePerYear:Float32Array;
 /** Min / max leave-one-year-out slopes; these are sensitivity limits, NOT a CI. */
 sensitivityLow:Float32Array;
 sensitivityHigh:Float32Array;
 /** 1 iff every year provides two genuine SCL-accepted measurements. */
 robustAllYears:Uint8Array;
 trendRgba:Uint8Array;
 statistics:{
   totalPixels:number;yearCount:number;firstYear:number;lastYear:number;
   commonValidPixels:number;commonValidPercent:number;missingPixels:number;
   robustAllYearsPixels:number;oneSourceSomeYearPixels:number;
   minValidPerYear:number;meanSlopeNdviPerYear:number;
   minSlopeNdviPerYear:number;maxSlopeNdviPerYear:number;
   firstMeanNdvi:number;lastMeanNdvi:number;meanFirstLastDeltaNdvi:number;
   increasingPixels:number;decreasingPixels:number;stablePixels:number;
   thresholdNdviPerYear:number;
   /** Across valid pixels, slope sensitivity to deleting one annual point. */
   meanLeaveOneOutWidth:number;
   signSensitivePixels:number;
   maxMedianAcquisitionDayShift:number;
   lowCoverageWarning:boolean;dateShiftWarning:boolean;
 };
 qa:{allSourceSclMasked:true;allSameGrid:true;allSameCalendarMonth:true;
   allDistinctAcquisitions:true;twoScenesPerYear:true;
   fixedCommonPixelPopulation:true;noGapFilling:true;
   annualMedian:true;theilSen:true;leaveOneYearOutSensitivity:true};
 caveats:string[];
}
function median(items:number[]):number{
 items.sort((a,b)=>a-b);
 const i=items.length>>1;
 return items.length%2?items[i]!:(items[i-1]!+items[i]!)/2;
}
function slopes(years:readonly number[],values:readonly number[]):number{
 const pairs:number[]=[];
 for(let i=0;i<years.length;i++)for(let j=i+1;j<years.length;j++){
   const dt=years[j]!-years[i]!;
   if(dt<=0)throw new RangeError("Repeated or unordered annual observation");
   pairs.push((values[j]!-values[i]!)/dt);
 }
 return median(pairs);
}
function validate(s:SentinelNdviEvidence,name:string){
 if(!s||s.status!=="real-sentinel2-observation"||s.version!==2||
   !/^[A-Za-z0-9_-]{5,120}$/.test(s.sceneId)||
   typeof s.source!=="string"||!s.source.includes("Sentinel-2")||
   !Number.isFinite(Date.parse(s.acquiredAt))||
   s.qa?.sclMask!==true||s.grid?.crs!=="EPSG:3857"||
   !Number.isInteger(s.width)||!Number.isInteger(s.height)||
   s.width<2||s.height<2||s.width*s.height>50000||
   !Number.isFinite(s.groundSamplingM)||s.groundSamplingM<10||
   !Array.isArray(s.area)||s.area.length!==4||
   s.area.some(x=>!Number.isFinite(x))||
   !Array.isArray(s.grid.transform)||s.grid.transform.length!==6||
   s.grid.transform.some(x=>!Number.isFinite(x))||
   !(s.ndviValues instanceof Float32Array)||
   s.ndviValues.length!==s.width*s.height||
   !Number.isInteger(s.statistics?.validPixels))
   throw new RangeError(name+" is not source-proven calibrated SCL NDVI");
 let valid=0;
 for(const v of s.ndviValues){
   if(Number.isNaN(v))continue;
   if(!Number.isFinite(v)||v< -1.00001||v>1.00001)
     throw new RangeError(name+" has invalid reflectance-derived NDVI");
   valid++;
 }
 if(valid!==s.statistics.validPixels)
   throw new RangeError(name+" has mismatched original SCL pixel count");
}
function tinted(slope:number,threshold:number,strong:boolean):[number,number,number,number]{
 const magnitude=Math.min(1,Math.abs(slope)/.15);
 if(slope>=threshold)
   return [Math.round(95-64*magnitude),Math.round(180-49*magnitude),
     Math.round(126-34*magnitude),strong?245:150];
 if(slope<=-threshold)
   return [Math.round(168+65*magnitude),Math.round(124-66*magnitude),
     Math.round(135-70*magnitude),strong?245:150];
 return [200,199,189,90];
}
/** True interannual descriptive NDVI slope with observational sensitivity.
 * All annual mean values are taken from the exact same valid pixel cohort.
 */
export function analyzeSentinelMultiYearSeasons(
 input:readonly SentinelYearSeason[],
 options:SentinelMultiYearOptions={}
):SentinelMultiYearResult{
 if(!Array.isArray(input)||input.length<3||input.length>5)
   throw new RangeError("Multi-year NDVI requires 3..5 real annual seasons");
 const threshold=options.thresholdNdviPerYear??.04;
 const minCommon=options.minCommonPixels??16;
 const minPerYear=options.minValidPerYear??1;
 if(!Number.isFinite(threshold)||threshold<=0||threshold>1||
   !Number.isInteger(minCommon)||minCommon<4||minCommon>50000||
   ![1,2].includes(minPerYear))
   throw new RangeError("Invalid annual slope threshold, common pixels or annual source minimum");
 const seasons=[...input].sort((a,b)=>a.year-b.year);
 if(seasons.some((s,i)=>!Number.isInteger(s.year)||s.year<2017||s.year>2100||
   !Array.isArray(s.observations)||s.observations.length!==2||
   (i>0&&s.year!==seasons[i-1]!.year+1)))
   throw new RangeError("Three to five consecutive years require exactly two genuine dated scenes each");
 const sources=seasons.flatMap(s=>s.observations);
 sources.forEach((s,i)=>validate(s,"Annual scene "+i));
 const ref=sources[0]!;
 const month=new Date(ref.acquiredAt).getUTCMonth()+1;
 const ids=new Set(),days=new Set();
 for(const [i,s] of sources.entries()){
   const date=new Date(s.acquiredAt);
   const year=seasons[Math.floor(i/2)]!.year;
   const day=date.toISOString().slice(0,10);
   if(ids.has(s.sceneId)||days.has(day))
     throw new RangeError("Annual sources must have unique scene identities and dates");
   ids.add(s.sceneId);days.add(day);
   if(date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month)
     throw new RangeError("Multi-year Sentinel sources must have the SAME calendar month in their reported year");
   if(s.width!==ref.width||s.height!==ref.height||
     s.groundSamplingM!==ref.groundSamplingM||
     s.area.some((v:number,k:number)=>v!==ref.area[k])||
     s.grid.transform.some((v:number,k:number)=>v!==ref.grid.transform[k]))
     throw new RangeError("Annual Sentinel sources do not share identical 10m georeferenced pixel grids");
 }
 const yearDays=seasons.map(s=>{
   const d=s.observations.map((o:SentinelNdviEvidence)=>new Date(o.acquiredAt).getUTCDate());
   const times=s.observations.map((o:SentinelNdviEvidence)=>Date.parse(o.acquiredAt));
   if(Math.abs(times[0]!-times[1]!)<4*86400000)
     throw new RangeError("A year requires independent acquisitions separated by at least four days");
   return median(d);
 });
 const maxDayShift=Math.max(...yearDays)-Math.min(...yearDays);
 const years=seasons.map(s=>s.year),n=ref.width*ref.height;
 const slopePerYear=new Float32Array(n),sensitivityLow=new Float32Array(n),
   sensitivityHigh=new Float32Array(n),robustAllYears=new Uint8Array(n),
   trendRgba=new Uint8Array(n*4);
 for(const array of [slopePerYear,sensitivityLow,sensitivityHigh])array.fill(NaN);
 const yearTotals=new Float64Array(years.length);
 let common=0,robust=0,up=0,down=0,stable=0,signSensitive=0;
 let sumSlope=0,min=Infinity,max=-Infinity,sumWidth=0;
 for(let pixel=0;pixel<n;pixel++){
   const samples=seasons.map(s=>s.observations.map((o:SentinelNdviEvidence)=>o.ndviValues[pixel]!)
     .filter(Number.isFinite));
   if(samples.some(a=>a.length<minPerYear))continue;
   const annual=samples.map(values=>median(values));
   const slope=slopes(years,annual);
   if(!Number.isFinite(slope))throw Error("Measured annual slope is not finite");
   const jackknife=years.map((_,leave)=>{
     const yy=years.filter((_,i)=>i!==leave);
     const vv=annual.filter((_,i)=>i!==leave);
     return slopes(yy,vv);
   });
   const low=Math.min(...jackknife),high=Math.max(...jackknife);
   const strong=samples.every(values=>values.length===2);
   if(strong){robustAllYears[pixel]=1;robust++;}
   slopePerYear[pixel]=slope;
   sensitivityLow[pixel]=low;sensitivityHigh[pixel]=high;
   common++;sumSlope+=slope;
   min=Math.min(min,slope);max=Math.max(max,slope);
   sumWidth+=high-low;
   if(low<=0&&high>=0)signSensitive++;
   for(let i=0;i<annual.length;i++)yearTotals[i]=(yearTotals[i]??0)+annual[i]!;
   if(slope>=threshold)up++;
   else if(slope<=-threshold)down++;
   else stable++;
   trendRgba.set(tinted(slope,threshold,strong),pixel*4);
 }
 if(common<minCommon)
   throw new Error("Insufficient real common SCL-valid pixels for all "+years.length+
     " years: "+common+"/"+n+", required "+minCommon+". No fabricated annual gaps.");
 const means=seasons.map((s,i)=>({
   year:s.year,medianAcquisitionDay:yearDays[i]!,
   meanNdviOnCommon:yearTotals[i]!/common,
   scenes:[...s.observations].sort((a,b)=>Date.parse(a.acquiredAt)-Date.parse(b.acquiredAt))
     .map(o=>({sceneId:o.sceneId,acquiredAt:o.acquiredAt,
       validPixels:o.statistics.validPixels}))
 }));
 const first=means[0]!.meanNdviOnCommon,last=means[means.length-1]!.meanNdviOnCommon;
 return {
   status:"real-sentinel-multiyear-seasonal-trend",
   version:SENTINEL_MULTIYEAR_VERSION,
   source:"Copernicus Sentinel-2 L2A / Element84 Earth Search public COG; "+
     "multi-year same-calendar-month median SCL-masked source NDVI",
   month,years:means,area:ref.area,grid:ref.grid,width:ref.width,height:ref.height,
   groundSamplingM:ref.groundSamplingM,
   slopePerYear,sensitivityLow,sensitivityHigh,robustAllYears,trendRgba,
   statistics:{
     totalPixels:n,yearCount:years.length,firstYear:years[0]!,
     lastYear:years[years.length-1]!,commonValidPixels:common,
     commonValidPercent:100*common/n,missingPixels:n-common,
     robustAllYearsPixels:robust,oneSourceSomeYearPixels:common-robust,
     minValidPerYear:minPerYear,meanSlopeNdviPerYear:sumSlope/common,
     minSlopeNdviPerYear:min,maxSlopeNdviPerYear:max,
     firstMeanNdvi:first,lastMeanNdvi:last,meanFirstLastDeltaNdvi:last-first,
     increasingPixels:up,decreasingPixels:down,stablePixels:stable,
     thresholdNdviPerYear:threshold,meanLeaveOneOutWidth:sumWidth/common,
     signSensitivePixels:signSensitive,
     maxMedianAcquisitionDayShift:maxDayShift,
     lowCoverageWarning:common/n<.25,dateShiftWarning:maxDayShift>10
   },
   qa:{
     allSourceSclMasked:true,allSameGrid:true,allSameCalendarMonth:true,
     allDistinctAcquisitions:true,twoScenesPerYear:true,
     fixedCommonPixelPopulation:true,noGapFilling:true,
     annualMedian:true,theilSen:true,leaveOneYearOutSensitivity:true
   },
   caveats:[
     "Actual Sentinel-2 L2A measurements in the same calendar month of 3–5 consecutive years (two different source acquisitions per year).",
     "Annual NDVI per pixel is a median of only source-qualified calibrated pixels; no SCL cloud, shadow or missing data is interpolated.",
     "All annual means and interannual slopes use the same intersection of pixels truly valid in every selected year.",
     "Default accepts one clear acquisition per year per pixel; robustAllYearsPixels have two actual measurements in every year.",
     "Theil–Sen median pairwise slope is descriptive NDVI/year, not a statistical significance test, causal land-cover classification or forecast.",
     "The leave-one-year-out min/max slopes are sensitivity ranges, NOT confidence intervals; sign changes indicate instability.",
     "The color threshold 0.04 NDVI/year is illustrative, not a calibrated deforestation or ecological threshold.",
     "Phenology, weather, atmosphere, solar geometry and imperfect SCL classifications may cause between-year differences even in one calendar month.",
     "Original ČÚZK 2m Bpv height model, measured geometry and buildings remain untouched."
   ]
 };
}
