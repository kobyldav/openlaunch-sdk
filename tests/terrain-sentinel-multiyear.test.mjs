import test from "node:test";
import assert from "node:assert/strict";
import {OpenLaunch,analyzeSentinelMultiYearSeasons,
  SENTINEL_MULTIYEAR_VERSION} from "../dist/index.js";
const base=[.2,.4,.5,.6,.3,.7,.8,.2,.6];
function season(year,offset=0){
 return {year,observations:["05","20"].map((day,i)=>{
  const ndviValues=Float32Array.from(base,x=>x+offset);
  return {status:"real-sentinel2-observation",version:2,
   sceneId:"S2B_33UVR_"+year+"08"+day+"_"+i+"_L2A",
   acquiredAt:year+"-08-"+day+"T10:00:00Z",
   source:"Copernicus Sentinel-2 L2A via Element84 Earth Search STAC COG",
   area:[14.425,50.093,14.427,50.095],
   grid:{crs:"EPSG:3857",transform:[100,10,0,200,0,-10]},
   width:3,height:3,groundSamplingM:10,
   ndviValues,statistics:{validPixels:9},qa:{sclMask:true}};
 })};
}
const eq=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,"Expected "+a+" to equal "+b);
test("Stage 15: original 3-year same-month SCL medians, identical cohort and NDVI/year slope",()=>{
 const a=season(2023,0),b=season(2024,.1),c=season(2025,.2);
 b.observations[0].ndviValues[2]=NaN;
 b.observations[0].statistics.validPixels=8;
 for(const o of c.observations){
   for(const i of [4,7])o.ndviValues[i]=NaN;
   o.statistics.validPixels=7;
 }
 const result=analyzeSentinelMultiYearSeasons([c,a,b],{minCommonPixels:4});
 assert.equal(result.version,SENTINEL_MULTIYEAR_VERSION);
 assert.equal(result.status,"real-sentinel-multiyear-seasonal-trend");
 assert.deepEqual(result.years.map(y=>y.year),[2023,2024,2025]);
 assert.equal(result.statistics.commonValidPixels,7);
 assert.equal(result.statistics.robustAllYearsPixels,6);
 assert.equal(result.statistics.oneSourceSomeYearPixels,1);
 assert.equal(result.statistics.missingPixels,2);
 assert.equal(result.statistics.increasingPixels,7);
 assert.equal(result.qa.allSourceSclMasked,true);
 assert.equal(result.qa.fixedCommonPixelPopulation,true);
 assert.equal(result.qa.leaveOneYearOutSensitivity,true);
 for(const i of [0,1,2,3,5,6,8]){
   eq(result.slopePerYear[i],.1);
   eq(result.sensitivityLow[i],.1);
   eq(result.sensitivityHigh[i],.1);
 }
 assert.equal(result.robustAllYears[2],0);
 assert.equal(result.trendRgba[2*4+3],150);
 for(const i of [4,7]){
   assert.ok(Number.isNaN(result.slopePerYear[i]));
   assert.ok(Number.isNaN(result.sensitivityLow[i]));
   assert.ok(Number.isNaN(result.sensitivityHigh[i]));
   assert.equal(result.trendRgba[i*4+3],0);
 }
 eq(result.statistics.meanSlopeNdviPerYear,.1);
 for(let i=0;i<3;i++)
   eq(result.years[i].meanNdviOnCommon-result.years[0].meanNdviOnCommon,.1*i);
 assert.equal(typeof new OpenLaunch().terrain.analyzeSentinelMultiYear,"function");
});
test("Stage 15: leave-one-year-out sensitivity reveals outlier-driven sign instability",()=>{
 const a=season(2023),b=season(2024),c=season(2025);
 for(const o of a.observations)o.ndviValues.fill(.1);
 for(const o of b.observations)o.ndviValues.fill(.9);
 for(const o of c.observations)o.ndviValues.fill(.2);
 const result=analyzeSentinelMultiYearSeasons([a,b,c],{minCommonPixels:4});
 eq(result.slopePerYear[0],.05);
 eq(result.sensitivityLow[0],-.7);
 eq(result.sensitivityHigh[0],.8);
 assert.equal(result.statistics.signSensitivePixels,9);
 assert.equal(result.statistics.increasingPixels,9);
 assert.ok(result.statistics.meanLeaveOneOutWidth>1);
 assert.ok(result.caveats.some(x=>x.includes("NOT confidence intervals")));
});
test("Stage 15: strict mode needs two true SCL-accepted samples EVERY year",()=>{
 const a=season(2023),b=season(2024),c=season(2025);
 b.observations[0].ndviValues[0]=NaN;
 b.observations[0].statistics.validPixels=8;
 const permissive=analyzeSentinelMultiYearSeasons([a,b,c],{minCommonPixels:4});
 const strict=analyzeSentinelMultiYearSeasons([a,b,c],{
   minCommonPixels:4,minValidPerYear:2});
 assert.equal(permissive.statistics.commonValidPixels,9);
 assert.equal(permissive.statistics.robustAllYearsPixels,8);
 assert.equal(permissive.trendRgba[0*4+3],90);
 assert.equal(strict.statistics.commonValidPixels,8);
 assert.ok(Number.isNaN(strict.slopePerYear[0]));
 assert.equal(strict.trendRgba[0*4+3],0);
});
test("Stage 15: rejected unverified source years, calendar mismatches, CRS drift and missing observations",()=>{
 const a=season(2023),b=season(2024),c=season(2025);
 const check=series=>analyzeSentinelMultiYearSeasons(series,{minCommonPixels:4});
 assert.throws(()=>check([a,b]),/3..5/);
 assert.throws(()=>check([a,b,c,season(2026),season(2027),season(2028)]),/3..5/);
 assert.throws(()=>check([a,c,season(2026)]),/consecutive/);
 assert.throws(()=>check([a,b,{year:2025,observations:[c.observations[0]]}]),/two genuine/);
 assert.throws(()=>check([a,b,{...c,observations:[
   {...c.observations[0],acquiredAt:"2025-07-05T10:00:00Z"},
   c.observations[1]]}]),/SAME calendar month/);
 assert.throws(()=>check([a,b,{...c,observations:[
   {...c.observations[0],grid:{...c.observations[0].grid,
     transform:[101,10,0,200,0,-10]}},c.observations[1]]}]),/identical 10m/);
 assert.throws(()=>check([a,b,{...c,observations:[
   {...c.observations[0],qa:{sclMask:false}},c.observations[1]]}]),/source-proven/);
 assert.throws(()=>check([a,b,{...c,observations:[
   {...c.observations[0],statistics:{validPixels:1}},c.observations[1]]}]),/mismatched original/);
 const clipped=Float32Array.from(base);clipped[0]=Infinity;
 assert.throws(()=>check([a,b,{...c,observations:[
   {...c.observations[0],ndviValues:clipped},c.observations[1]]}]),/invalid reflectance/);
 assert.throws(()=>check([a,b,{...c,observations:[
   {...c.observations[0],sceneId:a.observations[0].sceneId},c.observations[1]]}]),/unique scene identities/);
 assert.throws(()=>analyzeSentinelMultiYearSeasons([a,b,c],{minCommonPixels:10}),/Insufficient real common/);
});
test("Stage 15: five observed yearly cohorts, original 10m geometry and actual sensitivity values",()=>{
 const result=analyzeSentinelMultiYearSeasons([
   season(2020),season(2021,.1),season(2022,.2),season(2023,.3),season(2024,.4)
 ],{minCommonPixels:4});
 assert.equal(result.statistics.yearCount,5);
 assert.equal(result.statistics.lastYear,2024);
 assert.equal(result.statistics.commonValidPixels,9);
 eq(result.statistics.meanSlopeNdviPerYear,.1);
 eq(result.statistics.meanFirstLastDeltaNdvi,.4);
 assert.equal(result.groundSamplingM,10);
 assert.equal(result.qa.noGapFilling,true);
 assert.ok(result.caveats.some(s=>s.includes("NOT confidence intervals")));
});
