/** Stage 20: measured 4×4 (max) Sentinel regional QA report.
 * Runs on source-proven regional tile summaries and REAL observed process
 * measurements.  Never estimates missing pixel counts, GPU memory or network IO.
 */
import type {SentinelRegionCoverage} from "./sentinel-region.js";
export const SENTINEL_REGION_QUALITY_VERSION=1;
export type SentinelRegionCacheResult="hit"|"miss"|"unavailable";
export interface SentinelRegionTileMeasurement{
 key:string;durationMs:number;rssBytes:number;heapUsedBytes:number;
 sourceCache:SentinelRegionCacheResult;
}
export interface SentinelRegionRuntimeMeasurement{
 elapsedMs:number;sourceSelectionMs:number;
 initialRssBytes:number;peakRssBytes:number;peakHeapUsedBytes:number;
 samplingIntervalMs:number;catalogCacheHitYears:number;
 tileMeasurements:readonly SentinelRegionTileMeasurement[];
}
export interface SentinelRegionQuality{
 status:"real-sentinel-region-runtime-quality";version:1;
 evidence:"actual-source-results-and-observed-node-process-memory";
 outcome:"full-observed-region"|"partially-observed-region"|"no-observed-tiles";
 requestedTiles:number;analyzedTiles:number;unavailableTiles:number;
 analyzedTilePercent:number;
 /** Always null if some tiles lack a source-backed numerical denominator. */
 wholeRegionSclPixelCoveragePercent:number|null;
 validSclPixelsWithinAnalyzedTiles:number;
 rssStartMiB:number;peakRssMiB:number;peakHeapUsedMiB:number;
 elapsedMs:number;sourceSelectionMs:number;
 samplingIntervalMs:number;measuredTileCount:number;
 rasterCacheHits:number;rasterCacheMisses:number;
 rasterCacheUnavailable:number;catalogCacheHitYears:number;
 tiles:SentinelRegionTileMeasurement[];
 caveats:string[];
}
export function assessSentinelRegionQuality(
 coverage:SentinelRegionCoverage,
 runtime:SentinelRegionRuntimeMeasurement
):SentinelRegionQuality{
 const tiles=coverage?.tiles??[],metrics=runtime?.tileMeasurements??[];
 if(coverage?.status!=="real-sentinel-multiyear-region-coverage"||
   coverage.version!==1||
   !Number.isInteger(coverage.requestedTiles)||
   coverage.requestedTiles<1||coverage.requestedTiles>16||
   coverage.processedTiles!==coverage.requestedTiles||
   coverage.pendingTiles!==0||tiles.length!==coverage.requestedTiles||
   coverage.analyzedTiles+coverage.insufficientTiles+
     coverage.errorTiles!==coverage.requestedTiles||
   coverage.regionFullyAnalyzed!==(coverage.analyzedTiles===coverage.requestedTiles)||
   !Number.isInteger(coverage.commonValidPixels)||
   coverage.commonValidPixels<0||
   !Array.isArray(metrics)||metrics.length!==tiles.length||
   !Number.isFinite(runtime.elapsedMs)||runtime.elapsedMs<0||
   !Number.isFinite(runtime.sourceSelectionMs)||runtime.sourceSelectionMs<0||
   runtime.sourceSelectionMs>runtime.elapsedMs+10||
   !Number.isInteger(runtime.samplingIntervalMs)||runtime.samplingIntervalMs<1||
   !Number.isInteger(runtime.catalogCacheHitYears)||
   runtime.catalogCacheHitYears<0||
   runtime.catalogCacheHitYears>coverage.toYear-coverage.fromYear+1||
   ![runtime.initialRssBytes,runtime.peakRssBytes,runtime.peakHeapUsedBytes]
     .every(x=>Number.isFinite(x)&&x>=0)||
   runtime.peakRssBytes<runtime.initialRssBytes)
   throw new RangeError("Region QA requires complete actual measurement metadata");
 const seen=new Set<string>(),summary=new Map(tiles.map(t=>[t.key,t]));
 for(const m of metrics){
   const tile=summary.get(m.key);
   if(!tile||seen.has(m.key)||!Number.isFinite(m.durationMs)||m.durationMs<0||
     m.durationMs>runtime.elapsedMs+10||
     !Number.isFinite(m.rssBytes)||m.rssBytes<0||
     !Number.isFinite(m.heapUsedBytes)||m.heapUsedBytes<0||
     m.rssBytes>runtime.peakRssBytes||
     m.heapUsedBytes>runtime.peakHeapUsedBytes||
     !["hit","miss","unavailable"].includes(m.sourceCache)||
     (tile.status==="analyzed"&&m.sourceCache==="unavailable")||
     (tile.status!=="analyzed"&&m.sourceCache!=="unavailable"))
     throw new RangeError("Region QA tile timing, identity or source cache is not verifiable");
   seen.add(m.key);
 }
 const full=coverage.regionFullyAnalyzed;
 const observed=coverage.analyzedTiles;
 return {
   status:"real-sentinel-region-runtime-quality",
   version:SENTINEL_REGION_QUALITY_VERSION,
   evidence:"actual-source-results-and-observed-node-process-memory",
   outcome:full?"full-observed-region":observed>0?
     "partially-observed-region":"no-observed-tiles",
   requestedTiles:coverage.requestedTiles,analyzedTiles:observed,
   unavailableTiles:coverage.insufficientTiles+coverage.errorTiles,
   analyzedTilePercent:100*observed/coverage.requestedTiles,
   wholeRegionSclPixelCoveragePercent:full?
     coverage.percentValidWithinAnalyzedTiles:null,
   validSclPixelsWithinAnalyzedTiles:coverage.commonValidPixels,
   rssStartMiB:runtime.initialRssBytes/1048576,
   peakRssMiB:runtime.peakRssBytes/1048576,
   peakHeapUsedMiB:runtime.peakHeapUsedBytes/1048576,
   elapsedMs:runtime.elapsedMs,sourceSelectionMs:runtime.sourceSelectionMs,
   samplingIntervalMs:runtime.samplingIntervalMs,
   measuredTileCount:metrics.length,
   rasterCacheHits:metrics.filter(m=>m.sourceCache==="hit").length,
   rasterCacheMisses:metrics.filter(m=>m.sourceCache==="miss").length,
   rasterCacheUnavailable:metrics.filter(m=>m.sourceCache==="unavailable").length,
   catalogCacheHitYears:runtime.catalogCacheHitYears,
   tiles:metrics.map(m=>({...m})),
   caveats:[
     "RSS and V8 heap are sampled for the whole local Node process, not isolated per tile. Peak between samples may be higher.",
     "Browser GPU, disk cache size, network transfer and client memory were not measured by these Node process counters.",
     "Whole-region SCL pixel coverage is unavailable (null) when any requested tile lacks real validated Sentinel observations.",
     "Tile success is scientific source provenance and numerical QA, not statistical significance or causal attribution."
   ]
 };
}
