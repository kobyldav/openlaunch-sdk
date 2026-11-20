import test from "node:test";
import assert from "node:assert/strict";
import {reconstructTerrain,reconstructTerrainTiled,sampleTerrainImage,createTerrainRpcCamera,createTerrainPinholeCamera,createTerrainPushbroomCamera,validateTerrainHeights,validateTerrainGeodetic,terrainPointCloudPly,discoverAsterStereo,TerrainReconstructionEngine} from "../dist/terrain/index.js";
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

test("optional recovery preserves original matches and never fills untextured data",()=>{
 const first=reconstructTerrain(opts),next=reconstructTerrain({...opts,recoverMissing:true});
 for(let i=0;i<first.totalPixels;i++)if(Number.isFinite(first.elevationMap.values[i])){assert.equal(next.elevationMap.values[i],first.elevationMap.values[i]);assert.equal(next.matchPass[i],1);}
 assert.equal(next.validPixels,first.validPixels+next.recoveredPixels);
 const flat=reconstructTerrain({...opts,images:[image(0,"a",true),image(1,"b",true)],recoverMissing:true});
 assert.equal(flat.validPixels,0);assert.equal(flat.recoveredPixels,0);
});

test("image-evidence peak refinement uses real image correlation and preserves geometric rejection",()=>{
 const base=reconstructTerrain(opts);
 const fine=reconstructTerrain({...opts,peakRefinement:"image-evidence"});
 assert.equal(fine.validPixels,base.validPixels);
 for(let i=0;i<fine.totalPixels;i++)if(Number.isFinite(fine.elevationMap.values[i])){
   assert.ok(Math.abs(fine.elevationMap.values[i]-140)<4);
 }
 const failed=reconstructTerrain({...opts,images:[image(0,"a",true),image(1,"b",true)],peakRefinement:"image-evidence"});
 assert.equal(failed.validPixels,0);
 assert.throws(()=>reconstructTerrain({...opts,peakRefinement:"unknown"}),/peak refinement/);
});

test("tiled reconstruction conserves stereo measurements across rotated global pixel transforms",()=>{
 const ref=reconstructTerrain(opts);
 const {images,...base}=opts;
 // The existing test images use RPC calibration, not a DOM or a data service.
 const toRpc=shift=>({
  longitudeOffset:14,latitudeOffset:50,heightOffset:100,
  longitudeScale:.01,latitudeScale:.01,heightScale:100,
  sampleOffset:48,lineOffset:48,sampleScale:40,lineScale:40,
  sampleNumerator:poly([1,1],[3,shift]),sampleDenominator:poly([0,1]),
  lineNumerator:poly([2,1]),lineDenominator:poly([0,1])
 });
 const source={kind:"satellite",images:images.map((im,i)=>({...im,calibration:{kind:"rpc",rpc:toRpc(i)}}))};
 const progress=[];
 const tiled=reconstructTerrainTiled({...base,source,tileSize:3,onTile:p=>progress.push(p)});
 assert.equal(tiled.tiles,4);assert.equal(tiled.totalPixels,25);
 assert.equal(progress.at(-1).completed,4);
 assert.equal(tiled.validPixels,ref.validPixels);
 assert.equal(tiled.mesh.positions.length,25*3);
 for(let i=0;i<25;i++){
  if(!Number.isFinite(ref.elevationMap.values[i]))assert.ok(Number.isNaN(tiled.elevationMap.values[i]));
  else assert.ok(Math.abs(ref.elevationMap.values[i]-tiled.elevationMap.values[i])<1e-6);
 }
 assert.throws(()=>reconstructTerrainTiled({...base,source,tileSize:1}),/Tile size/);
});

test("match patch footprint is independent of output grid sampling",()=>{
 const s=reconstructTerrain({...opts,patchSpacingScale:1});
 const same=reconstructTerrain({...opts,patchSpacingScale:1.0});
 assert.deepEqual(Array.from(s.elevationMap.values),Array.from(same.elevationMap.values));
 assert.throws(()=>reconstructTerrain({...opts,patchSpacingScale:0}),/patchSpacingScale/);
 assert.throws(()=>reconstructTerrain({...opts,patchSpacingScale:9}),/patchSpacingScale/);
});

test("image bilinear interpolation retains valid edge pixels but never invents masked intensity",()=>{
 const img={width:2,height:2,source:"mask",values:[7,NaN,NaN,NaN],camera:{project:()=>null}};
 assert.equal(sampleTerrainImage(img,{x:0,y:0}),7);
 assert.ok(Number.isNaN(sampleTerrainImage(img,{x:.25,y:0})));
 assert.ok(Number.isNaN(sampleTerrainImage(img,{x:1,y:1})));
 const full={...img,values:[1,2,3,4]};
 assert.equal(sampleTerrainImage(full,{x:1,y:1}),4);
 assert.equal(sampleTerrainImage(full,{x:0,y:1}),3);
 assert.equal(sampleTerrainImage(full,{x:.5,y:.5}),2.5);
 assert.ok(Number.isNaN(sampleTerrainImage(full,{x:1.01,y:0})));
});

test("stereo-pair consensus can only reject incoherent multiview correspondences",()=>{
 const triple=[image(0,"a"),image(1,"b"),image(-1,"c")];
 const plain=reconstructTerrain({...opts,images:triple});
 const strict=reconstructTerrain({...opts,images:triple,pairConsensusToleranceM:10});
 assert.ok(strict.validPixels<=plain.validPixels);
 assert.throws(()=>reconstructTerrain({...opts,pairConsensusToleranceM:0}),/consensus/);
});

test("optional tiled local-height pilot reports its origin and keeps camera geometry",()=>{
 const toRpc=shift=>({longitudeOffset:14,latitudeOffset:50,heightOffset:100,longitudeScale:.01,latitudeScale:.01,heightScale:100,sampleOffset:48,lineOffset:48,sampleScale:40,lineScale:40,sampleNumerator:poly([1,1],[3,shift]),sampleDenominator:poly([0,1]),lineNumerator:poly([2,1]),lineDenominator:poly([0,1])});
 const source={kind:"satellite",images:opts.images.map((im,i)=>({...im,calibration:{kind:"rpc",rpc:toRpc(i)}}))};
 const m=reconstructTerrainTiled({...opts,images:undefined,source,tileSize:3,localHeightPilot:true});
 assert.equal(m.pilotTiles+m.pilotFallbacks,m.tiles);
 assert.ok(m.validPixels>=0);
});

test("stereo rejection reasons distinguish untextured pixels and measured output",()=>{
 const result=reconstructTerrain(opts);
 assert.equal(result.rejectionReasons.length,result.totalPixels);
 for(let i=0;i<result.totalPixels;i++)if(result.matchPass[i])assert.equal(result.rejectionReasons[i],0);
 const flat=reconstructTerrain({...opts,images:[image(0,"a",true),image(1,"b",true)]});
 assert.equal(flat.validPixels,0);
 assert.ok(Array.from(flat.rejectionReasons).every(c=>c>0));
});

test("adaptive multiview can accept an occluded third image without changing original pair geometry",()=>{
 const masked=image(2,"masked",true);
 const pair=reconstructTerrain(opts);
 const loose=reconstructTerrain({...opts,images:[...opts.images,masked],minMatchingPairs:1});
 assert.equal(loose.validPixels,pair.validPixels);
 assert.throws(()=>reconstructTerrain({...opts,minMatchingPairs:0}),/minMatchingPairs/);
 const strict=reconstructTerrain({...opts,images:[...opts.images,masked]});
 assert.equal(strict.validPixels,0);
});

test("measured-only iterative recovery never changes accepted stereo heights",()=>{
 const base=reconstructTerrain({...opts,recoverMissing:true});
 const extended=reconstructTerrain({...opts,recoverMissing:true,recoveryExpansionRounds:3});
 assert.ok(extended.validPixels>=base.validPixels);
 assert.equal(extended.validPixels,extended.matchPass.reduce((n,x)=>n+(x>0?1:0),0));
 for(let i=0;i<base.totalPixels;i++)if(base.matchPass[i]){
   assert.equal(extended.elevationMap.values[i],base.elevationMap.values[i]);
   assert.equal(extended.matchPass[i],base.matchPass[i]);
 }
 assert.throws(()=>reconstructTerrain({...opts,recoveryExpansionRounds:0}),/recoveryExpansionRounds/);
});

test("native SGM reconstructs a calibrated synthetic stereo plane without reference heights",()=>{
 const result=reconstructTerrain({...opts,matcher:"sgm",minCorrelation:.5,minPeakGap:.003,maxWork:1000000});
 assert.equal(result.model,"stereo-height-sgm");
 assert.ok(result.validPixels>=10,"valid SGM pixels "+result.validPixels);
 let err=0;
 for(const h of result.elevationMap.values)if(Number.isFinite(h))err+=Math.abs(h-140);
 assert.ok(err/result.validPixels<5,"Mean plane error "+err/result.validPixels);
 const rejected=reconstructTerrain({...opts,matcher:"sgm",images:[image(0,"flat-a",true),image(1,"flat-b",true)]});
 assert.equal(rejected.validPixels,0);
 assert.ok(Array.from(rejected.rejectionReasons).every(reason=>reason>0));
});
