import {
  type RasterGrid,ndviRaster,alignRasterTo,calibrateRasterFromStac,
  maskRasterBySentinel2Scl,rasterStatistics,type StacAsset,
} from "../../src/index.js";

// NETWORK: no. In an application, these RasterGrids come from real decoded TIFF.
const red:RasterGrid={
  width:2,height:2,crs:"EPSG:4326",
  transform:[14,.01,0,51,0,-.01],
  values:new Float64Array([9000,10000,11000,12000]),
};
const nir:RasterGrid={...red,values:new Float64Array([18000,20000,15000,17000])};
const scl:RasterGrid={...red,values:new Float64Array([4,9,6,3])};
const calibration:StacAsset={
  href:"https://example.invalid/mock.tif",
  "raster:bands":[{scale:0.0000275,offset:-0.2,nodata:0,unit:"reflectance"}],
};
const r=calibrateRasterFromStac(red,calibration).grid;
const n=calibrateRasterFromStac(nir,calibration).grid;
const cleanRed=maskRasterBySentinel2Scl(r,scl).grid;
const cleanNir=maskRasterBySentinel2Scl(alignRasterTo(n,r),scl).grid;
console.log(rasterStatistics(ndviRaster(cleanRed,cleanNir)));
