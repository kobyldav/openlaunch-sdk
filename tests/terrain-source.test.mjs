import test from "node:test";
import assert from "node:assert/strict";
import {createTerrainProjectedCamera,terrainSourceImages,reconstructTerrainFromSource,TerrainReconstructionEngine} from "../dist/terrain/index.js";
import {gridCrsToLonLat} from "../dist/eo/raster.js";
test("projected aerial camera uses offset-relative UTM coordinates",()=>{
 const camera={crs:"EPSG:32633",worldOffset:[460000,5540000,200],matrix:[100,0,-50,5000,0,-100,-50,5000,0,0,-1,100]};
 const [longitudeDeg,latitudeDeg]=gridCrsToLonLat(460010,5540000,camera.crs);
 const p=createTerrainProjectedCamera(camera).project({longitudeDeg,latitudeDeg,heightM:200});
 assert.ok(Math.abs(p.x-60)<.001);assert.ok(Math.abs(p.y-50)<.001);
 assert.equal(createTerrainProjectedCamera(camera).project({longitudeDeg,latitudeDeg,heightM:301}),null);
 const im={source:"a",width:2,height:2,values:[1,2,3,4],calibration:{kind:"projected",camera}};
 assert.equal(terrainSourceImages({kind:"aerial",images:[im]}).length,1);
 assert.throws(()=>terrainSourceImages({kind:"satellite",images:[im]}),/Calibration/);
 assert.equal(new TerrainReconstructionEngine().reconstructFromSource,reconstructTerrainFromSource);
});
