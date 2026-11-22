/** Stage 16: constant-raster-memory regional Sentinel-2 NDVI coverage accounting.
 * Accepts only completed, independently source-validated Stage 15 tile reports.
 * Holds O(number of selected tiles × years) metadata; never stores full rasters.
 * Missing tiles are explicitly marked; missing satellite pixels are never filled.
 */
import type {SentinelMultiYearResult} from "./sentinel-multiyear.js";

export const SENTINEL_MULTIYEAR_REGION_VERSION=1;
export type SentinelRegionBounds={west:number;south:number;east:number;north:number};
export type SentinelRegionTileStatus="analyzed"|"insufficient"|"error";
export interface SentinelRegionTile{
 key:string;bounds:SentinelRegionBounds;status:SentinelRegionTileStatus;
 commonValidPixels:number|null;totalPixels:number|null;
 commonValidPercent:number|null;robustAllYearsPixels:number|null;
 meanSlopeNdviPerYear:number|null;
 sourceScenes?:{year:number;scenes:{sceneId:string;acquiredAt:string}[]}[];
 reason?:string;
}
export type SentinelRegionSource=Pick<SentinelMultiYearResult,
 "status"|"version"|"month"|"years"|"width"|"height"|"groundSamplingM"|"statistics"|"qa">;
export interface SentinelRegionCoverage{
 status:"real-sentinel-multiyear-region-coverage";version:number;
 fromYear:number;toYear:number;month:number;
 requestedTiles:number;processedTiles:number;analyzedTiles:number;
 insufficientTiles:number;errorTiles:number;pendingTiles:number;
 /** Denominator excludes failed / unavailable tiles; not whole-region coverage. */
 analyzedPixels:number;commonValidPixels:number;robustAllYearsPixels:number;
 percentValidWithinAnalyzedTiles:number|null;
 meanSlopeOnObservedPixels:number|null;
 years:{year:number;meanNdviOnObservedPixels:number|null}[];
 regionFullyAnalyzed:boolean;
 tiles:SentinelRegionTile[];
 caveats:string[];
}
const assertBounds=(b:SentinelRegionBounds):void=>{
 if(!b||![b.west,b.south,b.east,b.north].every(Number.isFinite)||
   b.west>=b.east||b.south>=b.north||
   b.west< -180||b.east>180||b.south< -85||b.north>85)
   throw new RangeError("Invalid regional tile WGS84 bounds");
};
const overlap=(a:SentinelRegionBounds,b:SentinelRegionBounds):boolean=>
 Math.min(a.east,b.east)-Math.max(a.west,b.west)>1e-9&&
 Math.min(a.north,b.north)-Math.max(a.south,b.south)>1e-9;

/** Incremental aggregator for sequential remote tiles. One tile may be
 * loaded/released at a time; this class retains only bounded QA summaries.
 */
export class SentinelMultiYearRegionAccumulator{
 private readonly keys:readonly string[];
 private readonly records=new Map<string,SentinelRegionTile>();
 private readonly yearly=new Map<string,number[]>();
 private sampleResolution:number|null=null;
 constructor(readonly fromYear:number,readonly toYear:number,readonly month:number,
   expectedTileKeys:readonly string[]){
   if(!Number.isInteger(fromYear)||!Number.isInteger(toYear)||
     fromYear<2017||toYear>2100||toYear-fromYear<2||toYear-fromYear>4||
     !Number.isInteger(month)||month<1||month>12||
     !Array.isArray(expectedTileKeys)||expectedTileKeys.length<1||
     expectedTileKeys.length>16||
     expectedTileKeys.some(k=>typeof k!=="string"||
       !/^[A-Za-z0-9_-]{1,80}$/.test(k))||
     new Set(expectedTileKeys).size!==expectedTileKeys.length)
     throw new RangeError("Regional Sentinel requires 3–5 years and 1..16 distinct tiles");
   this.keys=[...expectedTileKeys];
 }
 private check(key:string,bounds:SentinelRegionBounds):void{
   if(!this.keys.includes(key)||this.records.has(key))
     throw new RangeError("Unexpected or duplicate regional tile");
   assertBounds(bounds);
   for(const existing of this.records.values())
     if(overlap(existing.bounds,bounds))
       throw new RangeError("Overlapping tiles would double-count source pixels");
 }
 addResult(key:string,bounds:SentinelRegionBounds,data:SentinelRegionSource):void{
   this.check(key,bounds);
   const s=data?.statistics;
   const years=data?.years;
   const n=data?.width*data?.height;
   if(data?.status!=="real-sentinel-multiyear-seasonal-trend"||
     data.version!==1||data.month!==this.month||
     data.qa?.allSourceSclMasked!==true||
     data.qa?.allSameGrid!==true||
     data.qa?.fixedCommonPixelPopulation!==true||
     data.qa?.noGapFilling!==true||
     data.qa?.leaveOneYearOutSensitivity!==true||
     !Number.isInteger(data.width)||!Number.isInteger(data.height)||
     data.width<2||data.height<2||n>50000||
     !Number.isFinite(data.groundSamplingM)||data.groundSamplingM<10||
     s?.firstYear!==this.fromYear||s?.lastYear!==this.toYear||
     s?.yearCount!==this.toYear-this.fromYear+1||
     s?.totalPixels!==n||
     !Number.isInteger(s?.commonValidPixels)||s.commonValidPixels<16||
     s.commonValidPixels>n||
     !Number.isInteger(s?.robustAllYearsPixels)||
     s.robustAllYearsPixels<0||s.robustAllYearsPixels>s.commonValidPixels||
     !Number.isFinite(s?.meanSlopeNdviPerYear)||
     !Array.isArray(years)||years.length!==s.yearCount||
     !years.every((year,i)=>year.year===this.fromYear+i&&
       Number.isFinite(year.meanNdviOnCommon)&&
       Math.abs(year.meanNdviOnCommon)<=1.00001&&
       Array.isArray(year.scenes)&&year.scenes.length===2&&
       year.scenes.every(scene=>typeof scene.sceneId==="string"&&
         Number.isFinite(Date.parse(scene.acquiredAt)))))
     throw new RangeError("Regional tile is not a valid source-backed multi-year result");
   if(this.sampleResolution!==null&&
     Math.abs(this.sampleResolution-data.groundSamplingM)>1e-8)
     throw new RangeError("Cannot pixel-weight regional tiles of different spectral sampling");
   this.sampleResolution=data.groundSamplingM;
   this.records.set(key,{key,bounds:{...bounds},status:"analyzed",
     commonValidPixels:s.commonValidPixels,totalPixels:n,
     commonValidPercent:100*s.commonValidPixels/n,
     robustAllYearsPixels:s.robustAllYearsPixels,
     meanSlopeNdviPerYear:s.meanSlopeNdviPerYear,
     sourceScenes:years.map(y=>({year:y.year,scenes:y.scenes.map(scene=>({
       sceneId:scene.sceneId,acquiredAt:scene.acquiredAt
     }))}))});
   this.yearly.set(key,years.map(y=>y.meanNdviOnCommon));
 }
 addUnavailable(key:string,bounds:SentinelRegionBounds,
   status:"insufficient"|"error",reason:string):void{
   this.check(key,bounds);
   if(status!=="insufficient"&&status!=="error")
     throw new RangeError("Unknown missing-source tile status");
   this.records.set(key,{key,bounds:{...bounds},status,
     commonValidPixels:null,totalPixels:null,commonValidPercent:null,
     robustAllYearsPixels:null,meanSlopeNdviPerYear:null,
     reason:String(reason).slice(0,180)});
 }
 snapshot():SentinelRegionCoverage{
   const tiles=this.keys.flatMap(key=>{
     const t=this.records.get(key);return t?[{...t}]:[];
   });
   const analyzed=tiles.filter(t=>t.status==="analyzed");
   const observed=analyzed.reduce((n,t)=>n+(t.commonValidPixels??0),0);
   const total=analyzed.reduce((n,t)=>n+(t.totalPixels??0),0);
   const robust=analyzed.reduce((n,t)=>n+(t.robustAllYearsPixels??0),0);
   const annual=Array.from({length:this.toYear-this.fromYear+1},(_,i)=>{
     const weighted=analyzed.reduce((sum,t)=>
       sum+(this.yearly.get(t.key)?.[i]??0)*(t.commonValidPixels??0),0);
     return {year:this.fromYear+i,meanNdviOnObservedPixels:
       observed>0?weighted/observed:null};
   });
   return {
     status:"real-sentinel-multiyear-region-coverage",
     version:SENTINEL_MULTIYEAR_REGION_VERSION,
     fromYear:this.fromYear,toYear:this.toYear,month:this.month,
     requestedTiles:this.keys.length,processedTiles:tiles.length,
     analyzedTiles:analyzed.length,
     insufficientTiles:tiles.filter(t=>t.status==="insufficient").length,
     errorTiles:tiles.filter(t=>t.status==="error").length,
     pendingTiles:this.keys.length-tiles.length,
     analyzedPixels:total,commonValidPixels:observed,
     robustAllYearsPixels:robust,
     percentValidWithinAnalyzedTiles:total>0?100*observed/total:null,
     meanSlopeOnObservedPixels:observed>0?
       analyzed.reduce((sum,t)=>sum+(t.meanSlopeNdviPerYear??0)*(t.commonValidPixels??0),0)/observed:null,
     years:annual,regionFullyAnalyzed:analyzed.length===this.keys.length,
     tiles,caveats:[
       "Regional means weight only genuinely observed common SCL pixels in successfully analyzed nonoverlapping tiles.",
       "Pixel coverage percentage excludes tiles without a complete validated source series; it is not whole-region coverage.",
       "Unprocessed and unavailable tiles are not treated as zero NDVI, interpolated, or replaced with synthetic measurements.",
       "Theil-Sen annual slopes and leave-one-year-out sensitivity remain descriptive, not statistically significant or causal.",
       "Sequential tile aggregation stores summary metadata only; source raster storage is managed by the caller."
     ]
   };
 }
 finish():SentinelRegionCoverage{
   if(this.records.size!==this.keys.length)
     throw new Error("Cannot finalize an incomplete regional analysis");
   return this.snapshot();
 }
}
