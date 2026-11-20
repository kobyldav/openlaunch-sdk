import test from "node:test";
import assert from "node:assert/strict";
import {bbox} from "../dist/geo/types.js";
import {OpenLaunch,copernicusGlo30TileUrl,loadRealTerrain} from "../dist/index.js";

const prague=bbox(14.411,50.083,14.430,50.094);
const geoGrid={width:50,height:50,crs:"EPSG:4326",
  transform:[14.40,0.001,0,50.11,0,-0.001]};
function raster(k=1) {
  const values=new Float64Array(2500);
  for(let i=0;i<values.length;i++)values[i]=k+(i%50)*0.25+Math.floor(i/50)*0.5;
  return {...geoGrid,values,unit:"native-sample"};
}
const scene={kind:"satellite-optical-rgb",
  provider:"Element84 Earth Search / Copernicus Sentinel-2 L2A",
  collection:"sentinel-2-l2a",sceneId:"S2B_TEST_L2A",
  acquiredAt:"2025-08-12T10:06:56Z",sceneCloudPercent:5,
  nativeResolutionM:10,bands:{red:raster(1000),green:raster(900),blue:raster(800)},
  bandUrls:{red:"test",green:"test",blue:"test"},grid:geoGrid,area:prague,
  verticalModel:null,elevationSource:"none",stats:{},warnings:[]};
function mockReader(value=raster(195)) {
  return async (href,area,opts)=>{
    assert.match(href,/^https:\/\/copernicus-dem-30m\.s3\.eu-central-1\.amazonaws\.com\//);
    assert.deepEqual(opts.allowedHosts,["copernicus-dem-30m.s3.eu-central-1.amazonaws.com"]);
    assert.ok(area.bbox[0]>=14&&area.bbox[2]<=15);
    return {raster:value,requestedTiles:1,metadataBytesRead:1024,tileBytesRead:1024,
      totalSourceBytes:100000,transferStrategy:"http-byte-ranges",warnings:[]};
  };
}
test("public GLO-30 tile URLs encode latitude, hemisphere and longitude",()=>{
  assert.equal(copernicusGlo30TileUrl(50,14),
    "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/Copernicus_DSM_COG_10_N50_00_E014_00_DEM/Copernicus_DSM_COG_10_N50_00_E014_00_DEM.tif");
  assert.match(copernicusGlo30TileUrl(-5,-3),/S05_00_W003_00_DEM/);
  assert.throws(()=>copernicusGlo30TileUrl(100,14),/Invalid/);
});
test("real map loads two independent data sources, preserves elevation and emits 3D geometry",async()=>{
  let rgbCalls=0,demCalls=0;
  const result=await new OpenLaunch().terrain.load({
    area:prague,
    rgbLoader:async request=>{rgbCalls++;assert.deepEqual(request.area,prague);return scene;},
    demReader:async (...params)=>{demCalls++;return mockReader()(...params);}
  });
  assert.equal(rgbCalls,1);assert.equal(demCalls,1);
  assert.equal(result.kind,"satellite-rgb-on-copernicus-dsm");
  assert.equal(result.elevation.crs,"EPSG:3857");
  assert.ok(result.elevation.width>20);
  assert.ok(result.elevation.height>20);
  assert.equal(result.mesh.validVertices,result.elevation.values.length);
  assert.ok(result.mesh.triangles.length>0);
  assert.ok(result.metadata.sampledColors>0);
  assert.equal(result.vertexRgb.length,result.elevation.values.length*3);
  assert.equal(result.metadata.verticalDatum,"EGM2008 geoid");
  assert.equal(result.metadata.sceneId,scene.sceneId);
  assert.ok(result.metadata.heightMinM>=195);
  assert.equal(result.mesh.positions[2],Math.fround(result.elevation.values[0]));
});
test("invalid AOI, partial providers and no-height scenes never synthesize a model",async()=>{
  await assert.rejects(()=>loadRealTerrain({area:bbox(14,50,14.4,50.4)}),/9 km2/);
  await assert.rejects(()=>loadRealTerrain({
    area:prague,rgbLoader:async()=>scene,
    demReader:async()=>{throw Error("503 DEM source down");}
  }),/503 DEM/);
  await assert.rejects(()=>loadRealTerrain({
    area:prague,rgbLoader:async()=>scene,
    demReader:mockReader({...geoGrid,values:new Float64Array(2500).fill(NaN)})
  }),/enough real elevation/);
});
test("DEM one-degree boundaries request distinct source tiles",async()=>{
  const area=bbox(14.999,50.001,15.001,50.003),urls=[];
  const result=await loadRealTerrain({
    area,rgbLoader:async()=>scene,
    demReader:async (url,window,opts)=>{
      urls.push(url);
      return {raster:raster(250),requestedTiles:1,metadataBytesRead:1024,
        tileBytesRead:1024,totalSourceBytes:100000,transferStrategy:"http-byte-ranges",warnings:[]};
    }
  }).catch(error=>error);
  assert.equal(urls.length,2);
  assert.ok(urls.some(u=>u.includes("E014")));
  assert.ok(urls.some(u=>u.includes("E015")));
  // Our narrow scene mock is over central Prague: no RGB can overlap this AOI.
  assert.match(String(result),/no valid pixels aligned/);
});
