export * from "./camera.js";
export * from "./reconstruct.js";
export * from "./aster.js";
import {reconstructTerrain,validateTerrainHeights,validateTerrainGeodetic} from "./reconstruct.js";
import {reconstructTerrainFromSource} from "./source.js";
import {discoverAsterStereo} from "./aster.js";
import {loadRealTerrain} from "./real-map.js";
import {discoverSentinelTerrainScenes,loadSentinelTerrainOverlay} from "./sentinel-overlay.js";
import {compareSentinelNdviScenes} from "./sentinel-change.js";
import {analyzeSentinelNdviTimeSeries} from "./sentinel-trend.js";
import {compareSentinelSeasonalNdvi} from "./sentinel-seasonal.js";
import {analyzeSentinelMultiYearSeasons} from "./sentinel-multiyear.js";
import {SentinelMultiYearRegionAccumulator} from "./sentinel-region.js";
export class TerrainReconstructionEngine {
  load = loadRealTerrain;
  discoverObservations = discoverSentinelTerrainScenes;
  observeSentinel2 = loadSentinelTerrainOverlay;
  compareSentinelNdvi = compareSentinelNdviScenes;
  analyzeSentinelNdviTrend = analyzeSentinelNdviTimeSeries;
  compareSentinelSeasons = compareSentinelSeasonalNdvi;
  analyzeSentinelMultiYear = analyzeSentinelMultiYearSeasons;
  createSentinelMultiYearRegion = (fromYear:number,toYear:number,month:number,
    expectedTileKeys:readonly string[]) =>
    new SentinelMultiYearRegionAccumulator(fromYear,toYear,month,expectedTileKeys);
  reconstruct = reconstructTerrain;
  reconstructFromSource = reconstructTerrainFromSource;
  validate = validateTerrainHeights;
  validateGeodetic = validateTerrainGeodetic;
  discoverAster = discoverAsterStereo;
}
export * from "./rpc-input.js";
export * from "./quality.js";
export * from "./pilot.js";
export * from "./source.js";
export * from "./tiles.js";
export * from "./sgm.js";

export * from "./real-map.js";
export * from "./cuzk-dmpok.js";
export * from "./cuzk-ortho.js";

export * from "./measure.js";

export * from "./sentinel-overlay.js";
export * from "./sentinel-change.js";
export * from "./sentinel-trend.js";
export * from "./sentinel-seasonal.js";
export * from "./sentinel-multiyear.js";
export * from "./sentinel-region.js";
export * from "./sentinel-region-seams.js";
export * from "./sentinel-region-catalog.js";