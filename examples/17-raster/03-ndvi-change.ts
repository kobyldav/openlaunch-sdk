import {
  type RasterGrid,ndviRaster,rasterDifference,
  rasterStatistics,
} from "../../src/index.js";

// NETWORK: no. Values stand in for already-calibrated, aligned scene pixels.
const reference:RasterGrid={
  width:3,height:1,crs:"EPSG:4326",
  transform:[14,.01,0,51,0,-.01],
  values:new Float64Array([.15,.2,.25]),unit:"reflectance",
};
const redBefore:RasterGrid={...reference};
const nirBefore:RasterGrid={...reference,values:new Float64Array([.4,.45,.5])};
const redAfter:RasterGrid={...reference,values:new Float64Array([.1,.2,NaN])};
const nirAfter:RasterGrid={...reference,values:new Float64Array([.6,.43,.55])};
const before=ndviRaster(redBefore,nirBefore);
const after=ndviRaster(redAfter,nirAfter);
const diff=rasterDifference(before,after);
console.log({comparedPixels:diff.comparedPixels,change:rasterStatistics(diff.grid)});
