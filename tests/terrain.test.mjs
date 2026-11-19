import test from "node:test";
import assert from "node:assert/strict";
import {reconstructTerrain,createTerrainRpcCamera,createTerrainPinholeCamera,createTerrainPushbroomCamera,validateTerrainHeights,validateTerrainGeodetic,terrainPointCloudPly,discoverAsterStereo,TerrainReconstructionEngine} from "../dist/terrain/index.js";
const poly=(...pairs)=>{const a=Array(20).fill(0);for(const [i,v] of pairs)a[i]=v;return a;};
const rpc=(shift)=>createTerrainRpcCamera({
 longitudeOffset:14,latitudeOffset:50,heightOffset:100,longitudeScale:.01,latitudeScale:.01,heightScale:100,
 sampleOffset:48,lineOffset:48,sampleScale:40,lineScale:40,
 sampleNumerator:poly([1,1],[3,shift]),sampleDenominator:poly([0,1]),lineNumerator:poly([2,1]),lineDenominator:poly([0,1])
});
const signal=(x,y)=>Math.sin(x*.63+y*.41)+Math.cos(x*.27-y*.71)+Math.sin(x*.81-y*.21);
const image=(shift,id,flat=false)=>({width:96,height:96,source:id,camera:rpc(shift),values:Float64Array.from({length:96*96},(_,i)=>flat?1:signal(i%96-40*shift*.4,Math.floor(i/96)))});
const opts={images:[image(0,"left"),image(1,"right")],grid:{width:5,height:5,crs:"EPSG:4326",transform:[13.9995,.00025,0,49.9995,0,.00025]},minHeightM:80,maxHeightM:200,heightStepM:5,minPeakGap:.005};
test("RPC00B order, calibrated stereo recovers known 140 m surface without DEM",()=>{
 const p=rpc(1).project({longitudeDeg:14,latitudeDeg:50,heightM:140});
 assert.ok(Math.abs(p.x-64)<1e-9);assert.equal(p.y,48);
 const r=reconstructTerrain(opts);
 assert.ok(r.validPixels>=20,"valid "+r.validPixels);
 for(const h of r.elevationMap.values)if(Number.isFinite(h))assert.ok(Math.abs(h-140)<4,"height "+h);
 assert.equal(r.pointCloud.positionsEcefM.length,r.validPixels*3);
 assert.ok(r.mesh.triangles.length>0);assert.equal(r.verticalDatum,"WGS84 ellipsoid");
 const q=validateTerrainHeights(r.elevationMap,[{col:2,row:2,heightM:140}]);assert.equal(q.count,1);assert.ok(q.rmseM<4);
 const geo=validateTerrainGeodetic(r.elevationMap,[{longitudeDeg:14.000125,latitudeDeg:50.000125,heightM:140}]);assert.equal(geo.count,1);assert.ok(geo.rmseM<4);
 assert.match(terrainPointCloudPly(r),/comment WGS84 ECEF metres/);
});
test("ambiguous, flat or identical geometry does not invent heights",()=>{
 for(const images of [[image(0,"a",true),image(1,"b",true)],[image(0,"a"),image(0,"b")]]){
  const r=reconstructTerrain({...opts,images});assert.equal(r.validPixels,0);assert.equal(r.mesh.triangles.length,0);
 }
 assert.throws(()=>reconstructTerrain({...opts,maxWork:10}),/budget/);
 assert.throws(()=>reconstructTerrain({...opts,images:[opts.images[0]]}),/2–8/);
});
test("pinhole and line-scanner geometry",()=>{
 const pose={positionEcefM:[7000000,0,0],right:[0,1,0],down:[0,0,1],forward:[-1,0,0],focalXpx:1000,focalYpx:1000,centerXpx:10,centerYpx:0};
 const p=createTerrainPinholeCamera(pose).project({latitudeDeg:0,longitudeDeg:0,heightM:0});assert.deepEqual(p,{x:10,y:0});
 const camera=createTerrainPushbroomCamera([{...pose,positionEcefM:[7000000,0,-100]},{...pose,positionEcefM:[7000000,0,100]}]);
 assert.deepEqual(camera.project({latitudeDeg:0,longitudeDeg:0,heightM:0}),{x:10,y:.5});
});
test("CMR discovery bounded, identifies input data only",async()=>{
 const results=await discoverAsterStereo({bounds:[14,49,15,50],from:new Date("2020-01-01"),to:new Date("2020-02-01"),fetch:async url=>{
  assert.equal(url.searchParams.get("short_name"),"AST_L1A");assert.equal(url.searchParams.get("version"),"004");
  return new Response(JSON.stringify({feed:{entry:[{id:"G1",title:"test",links:[{href:"https://example.org/file.hdf",rel:"http://esipfed.org/ns/fedsearch/1.1/data#"}]}]}}));
 }});
 assert.deepEqual(results[0].links,["https://example.org/file.hdf"]);
 assert.equal(new TerrainReconstructionEngine().reconstruct,reconstructTerrain);
});
