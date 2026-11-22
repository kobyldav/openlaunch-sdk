import test from "node:test";
import assert from "node:assert/strict";
import {OpenLaunch,compareSentinelSeasonalNdvi,
  SENTINEL_SEASONAL_COMPOSITE_VERSION} from "../dist/index.js";
function scene(iso,id,values,extra={}){
 const pixel=Float32Array.from(values);
 return {status:"real-sentinel2-observation",version:2,sceneId:id,
   acquiredAt:iso,
   source:"Element84 Earth Search STAC / Copernicus Sentinel-2 L2A public COG",
   area:[14.425,50.093,14.427,50.095],width:3,height:3,groundSamplingM:10,
   grid:{crs:"EPSG:3857",transform:[100,10,0,200,0,-10]},
   ndviValues:pixel,
   statistics:{validPixels:Array.from(pixel).filter(Number.isFinite).length,
     maskedPixels:Array.from(pixel).filter(Number.isNaN).length,
     ndviMean:null,ndviMin:null,ndviMax:null},
   qa:{sclMask:true,maskClasses:[4,5,6,7],invalidReflectanceMasked:true},
   ...extra};
}
function samples(){
 const older=[
   scene("2024-08-04T10:00:00Z","S2A_33UVR_20240804_L2A",
     [.2,.3,NaN,.4,.2,.1,.5,.6,.7]),
   scene("2024-08-18T10:00:00Z","S2B_33UVR_20240818_L2A",
     [.4,.5,.4,NaN,.3,.1,.6,.7,.8])
 ];
 const newer=[
   scene("2025-08-06T10:00:00Z","S2A_33UVR_20250806_L2A",
     [.5,.6,.5,.7,NaN,.2,.2,.8,.9]),
   scene("2025-08-20T10:00:00Z","S2B_33UVR_20250820_L2A",
     [.6,.7,NaN,.8,.4,NaN,.1,.7,.8])
 ];
 return [older,newer];
}
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,a+" differs from "+b);
test("stage 14: genuine two-year same-month median source NDVI, quality counts and exact pixel grid",()=>{
 const [oldYear,newYear]=samples();
 const product=compareSentinelSeasonalNdvi(oldYear,newYear,{minOverlapPixels:4});
 assert.equal(product.status,"real-sentinel-interannual-ndvi");
 assert.equal(product.version,SENTINEL_SEASONAL_COMPOSITE_VERSION);
 assert.equal(product.before.year,2024);
 assert.equal(product.after.year,2025);
 assert.equal(product.before.month,8);
 assert.equal(product.after.month,8);
 assert.equal(product.grid.crs,"EPSG:3857");
 assert.equal(product.statistics.totalPixels,9);
 assert.equal(product.statistics.overlapPixels,9);
 assert.equal(product.statistics.robustTwoPerYearPixels,5);
 assert.equal(product.statistics.oneOrMorePerYearPixels,9);
 assert.equal(product.statistics.minValidPerYear,1);
 assert.equal(product.statistics.medianAcquisitionDayShift,2);
 assert.equal(product.statistics.dateShiftWarning,false);
 assert.equal(product.statistics.lowCoverageWarning,false);
 approx(product.deltaValues[0],.25);
 approx(product.deltaValues[1],.25);
 approx(product.deltaValues[2],.1);
 approx(product.deltaValues[3],.35);
 approx(product.deltaValues[6],-.4);
 assert.equal(product.beforeValidCount[2],1);
 assert.equal(product.afterValidCount[2],1);
 assert.equal(product.beforeValidCount[0],2);
 assert.equal(product.afterValidCount[0],2);
 assert.equal(product.deltaRgba[3],255);
 assert.equal(product.qa.medianPerYear,true);
 assert.equal(product.qa.pairedPixelIntersection,true);
 assert.equal(typeof new OpenLaunch().terrain.compareSentinelSeasons,"function");
});
test("stage 14: strict two-valid-observations-per-year only draws well-supported pixels",()=>{
 const [older,newer]=samples();
 const result=compareSentinelSeasonalNdvi(older,newer,{
   minValidPerYear:2,minOverlapPixels:4,thresholdNdvi:.15});
 assert.equal(result.statistics.overlapPixels,5);
 assert.equal(result.statistics.robustTwoPerYearPixels,5);
 for(const i of [2,3,4,5]){
   assert.ok(Number.isNaN(result.deltaValues[i]));
   assert.equal(result.deltaRgba[i*4+3],0,"one valid observation is not two");
 }
 approx(result.deltaValues[0],.25);
 approx(result.deltaValues[6],-.4);
 assert.equal(result.statistics.lowCoverageWarning,false);
});
test("stage 14: source-cloud holes are never filled, missing yearly overlap fails",()=>{
 const [older,newer]=samples();
 const entirelyMissing=scene("2025-08-06T10:00:00Z","S2A_33UVR_20250806_L2A",
   Array(9).fill(NaN));
 const empty2=scene("2025-08-20T10:00:00Z","S2B_33UVR_20250820_L2A",
   Array(9).fill(NaN));
 assert.throws(()=>compareSentinelSeasonalNdvi(older,[entirelyMissing,empty2],
   {minOverlapPixels:4}),/Insufficient real SCL-valid interannual overlap/);
 const onlyOne=[entirelyMissing,newer[1]];
 const result=compareSentinelSeasonalNdvi(older,onlyOne,
   {minOverlapPixels:4,minValidPerYear:1});
 assert.ok(result.statistics.overlapPixels>0);
 assert.equal(result.statistics.robustTwoPerYearPixels,0);
 assert.equal(result.statistics.lowCoverageWarning,false);
 assert.equal(result.statistics.minValidPerYear,1);
});
test("stage 14: deny falsely comparable sources, chronology, month, duplicate date and corrupted radiometry",()=>{
 const [older,newer]=samples();
 const compare=(a,b,options={minOverlapPixels:4})=>
   compareSentinelSeasonalNdvi(a,b,options);
 assert.throws(()=>compare([older[0]],newer),/2..3/);
 assert.throws(()=>compare(older,[...newer,newer[0],newer[1]]),/2..3/);
 assert.throws(()=>compare(newer,older),/two ordered years/);
 assert.throws(()=>compare(older,older),/distinct acquisition date/);
 assert.throws(()=>compare(older,[{...newer[0],acquiredAt:"2025-07-06T10:00:00Z"},newer[1]]),/calendar month/);
 assert.throws(()=>compare(older,[{...newer[0],grid:{...newer[0].grid,
   transform:[100,10,0,201,0,-10]}},newer[1]]),/mismatched source pixel grids/);
 assert.throws(()=>compare(older,[{...newer[0],qa:{sclMask:false}},newer[1]]),/calibrated masked/);
 assert.throws(()=>compare(older,[{...newer[0],statistics:{validPixels:1}},newer[1]]),/source pixel counts/);
 assert.throws(()=>compare(older,[{...newer[0],ndviValues:Float32Array.from(
   [2,.6,.5,.7,NaN,.2,.2,.8,.9])},newer[1]]),/out-of-range/);
 assert.throws(()=>compare(older,newer,{thresholdNdvi:0,minOverlapPixels:4}),/Invalid seasonal/);
 assert.throws(()=>compare(older,newer,{minValidPerYear:3,minOverlapPixels:4}),/Invalid seasonal/);
 assert.throws(()=>compare(older,newer,{minOverlapPixels:10}),/Insufficient real/);
});
test("stage 14: median acquisition day mismatch and partial coverage are made explicit",()=>{
 const [older,newer]=samples();
 const shifted=newer.map((s,i)=>({...s,
   acquiredAt:"2025-08-"+(i===0?"25":"31")+"T10:00:00Z"}));
 const sparse=older.map((s,i)=>({...s,ndviValues:Float32Array.from(
   Array.from(s.ndviValues,(x,p)=>p<5?NaN:x)),
   statistics:{...s.statistics,validPixels:Array.from(s.ndviValues,
     (x,p)=>p<5?NaN:x).filter(Number.isFinite).length}}));
 const result=compareSentinelSeasonalNdvi(sparse,shifted,{minOverlapPixels:4});
 assert.equal(result.statistics.overlapPixels,4);
 assert.equal(result.statistics.lowCoverageWarning,false);
 assert.equal(result.statistics.dateShiftWarning,true);
 assert.ok(result.statistics.medianAcquisitionDayShift>10);
 // Less than 25% valid area is labelled as a coverage warning, never
 // promoted to an authoritative full-tile difference.
 const tiny=(s,i)=>({...s,ndviValues:Float32Array.from(
   Array.from(s.ndviValues,(x,p)=>p<8?NaN:x)),
   statistics:{...s.statistics,validPixels:
     Array.from(s.ndviValues,(x,p)=>p<8?NaN:x).filter(Number.isFinite).length}});
 const tooSmall=older.map(tiny),tooFew=newer.map(tiny);
 assert.throws(()=>compareSentinelSeasonalNdvi(tooSmall,tooFew,
   {minOverlapPixels:4}),/Insufficient real/);
});
