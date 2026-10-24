import assert from "node:assert/strict";
import {SpaceMapClient} from "@openlaunch/earth";
import {bbox} from "@openlaunch/raster";
const maps=new SpaceMapClient();
const mask={width:4,height:2,crs:"EPSG:4326",transform:[14,.01,0,51,0,-.01],
 values:new Float64Array([4,8,3,11,6,9,0,5])};
const q=maps.analyzeAoiPixelQuality({mask,area:bbox(14,50.98,14.04,51),source:"sentinel-2-l2a-scl"});
assert.equal(q.aoiPixelCount,8);assert.equal(q.clearPixels,3);assert.equal(q.cloudPixels,2);
assert.equal(q.shadowPixels,1);assert.equal(q.snowPixels,1);assert.equal(q.noDataPixels,1);
assert.equal(q.usablePercentOfAoi,37.5);assert.equal(q.cloudPercentOfClassified,28.57);
console.log("PASS OpenLaunch v1.13 AOI Pixel Quality");
console.log("AOI pixels:",q.aoiPixelCount);
console.log("Cloud pixels:",q.cloudPixels);
console.log("Usable AOI pixels:",q.usablePercentOfAoi+"%");
console.log("Cloud over classified:",q.cloudPercentOfClassified+"%");
console.log("Sensor acquisition verified:",q.sensorAcquisitionVerified);
