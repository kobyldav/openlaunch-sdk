import test from "node:test";
import assert from "node:assert/strict";
import {assessSentinelRegionQuality,SENTINEL_REGION_QUALITY_VERSION}
 from "../dist/index.js";

// Explicit QA summaries, NOT fictitious Sentinel pixels or benchmark results.
function sample(size=16,observed=0){
 const keys=Array.from({length:size},(_,i)=>"0-"+(i%4+1)+"-"+(Math.floor(i/4)+1));
 const tiles=keys.map((key,i)=>({key,status:i<observed?"analyzed":"error",
   commonValidPixels:i<observed?10:null,totalPixels:i<observed?20:null}));
 const cover={status:"real-sentinel-multiyear-region-coverage",version:1,
   fromYear:2023,toYear:2025,month:8,requestedTiles:size,processedTiles:size,
   pendingTiles:0,analyzedTiles:observed,insufficientTiles:0,errorTiles:size-observed,
   commonValidPixels:observed*10,
   percentValidWithinAnalyzedTiles:observed?50:null,
   regionFullyAnalyzed:observed===size,tiles};
 const runtime={elapsedMs:800,sourceSelectionMs:80,
   initialRssBytes:100*1048576,peakRssBytes:120*1048576,
   peakHeapUsedBytes:30*1048576,samplingIntervalMs:100,
   catalogCacheHitYears:3,
   tileMeasurements:keys.map((key,i)=>({key,durationMs:12,
     rssBytes:108*1048576,heapUsedBytes:22*1048576,
     sourceCache:i<observed?"hit":"unavailable"}))};
 return {cover,runtime};
}
test("Stage 20: no observed 4x4 tiles never produces invented whole-region SCL coverage",()=>{
 const {cover,runtime}=sample();
 const result=assessSentinelRegionQuality(cover,runtime);
 assert.equal(result.status,"real-sentinel-region-runtime-quality");
 assert.equal(result.version,SENTINEL_REGION_QUALITY_VERSION);
 assert.equal(result.requestedTiles,16);
 assert.equal(result.measuredTileCount,16);
 assert.equal(result.analyzedTiles,0);
 assert.equal(result.analyzedTilePercent,0);
 assert.equal(result.wholeRegionSclPixelCoveragePercent,null);
 assert.equal(result.validSclPixelsWithinAnalyzedTiles,0);
 assert.equal(result.outcome,"no-observed-tiles");
 assert.equal(result.rasterCacheUnavailable,16);
 assert.equal(result.rasterCacheHits,0);
 assert.equal(result.peakRssMiB,120);
 assert.equal(result.rssStartMiB,100);
 assert.equal(result.elapsedMs,800);
 assert.equal(result.catalogCacheHitYears,3);
 assert.ok(result.caveats.some(s=>/GPU/.test(s)));
});
test("Stage 20: partial 4x4 cannot claim complete-region pixel coverage",()=>{
 const {cover,runtime}=sample(16,2);
 const result=assessSentinelRegionQuality(cover,runtime);
 assert.equal(result.analyzedTiles,2);
 assert.equal(result.analyzedTilePercent,12.5);
 assert.equal(result.wholeRegionSclPixelCoveragePercent,null);
 assert.equal(result.outcome,"partially-observed-region");
 assert.equal(result.rasterCacheHits,2);
 assert.equal(result.rasterCacheMisses,0);
 assert.equal(result.rasterCacheUnavailable,14);
});
test("Stage 20: full original 4x4 summary may report source-pixel coverage",()=>{
 const {cover,runtime}=sample(16,16);
 runtime.tileMeasurements[7].sourceCache="miss";
 const result=assessSentinelRegionQuality(cover,runtime);
 assert.equal(result.outcome,"full-observed-region");
 assert.equal(result.analyzedTilePercent,100);
 assert.equal(result.wholeRegionSclPixelCoveragePercent,50);
 assert.equal(result.rasterCacheHits,15);
 assert.equal(result.rasterCacheMisses,1);
});
test("Stage 20: timing, RSS peaks, count, cache provenance and source denominator fail closed",()=>{
 const {cover,runtime}=sample(16,2);
 const corrupted=[
  {...runtime,tileMeasurements:runtime.tileMeasurements.slice(1)},
  {...runtime,peakRssBytes:90*1048576},
  {...runtime,elapsedMs:-1},
  {...runtime,catalogCacheHitYears:4},
  {...runtime,tileMeasurements:runtime.tileMeasurements.map((v,i)=>i? v:
    {...v,key:"0-9-9"})},
  {...runtime,tileMeasurements:runtime.tileMeasurements.map((v,i)=>i? v:
    {...v,sourceCache:"miss",rssBytes:200*1048576})},
 ];
 for(const invalid of corrupted)
   assert.throws(()=>assessSentinelRegionQuality(cover,invalid),
     /complete actual measurement|not verifiable/);
 assert.throws(()=>assessSentinelRegionQuality({
   ...cover,regionFullyAnalyzed:true
 },runtime),/complete actual measurement/);
 assert.throws(()=>assessSentinelRegionQuality({
   ...cover,pendingTiles:1
 },runtime),/complete actual measurement/);
});
