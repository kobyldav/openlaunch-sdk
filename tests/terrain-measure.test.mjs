import test from "node:test";
import assert from "node:assert/strict";
import {bbox} from "../dist/geo/types.js";
import {lonLatToGridCrs,pixelToWorld,gridCrsToLonLat} from "../dist/eo/raster.js";
import {terrainGroundDistanceM,sampleRealTerrain,profileRealTerrain} from "../dist/terrain/measure.js";

const [left,bottom]=lonLatToGridCrs(14.40,50.08,"EPSG:3857");
const data={
  width:3,height:3,crs:"EPSG:3857",
  transform:[left,30,0,bottom+120,0,-30],
  values:new Float64Array([100,110,120,130,140,150,160,170,180]),unit:"m EGM2008"
};
const map={elevation:data,metadata:{groundResolutionM:20,verticalDatum:"EGM2008 geoid"}};
function pt(c,r){
  const [x,y]=pixelToWorld(data.transform,c+.5,r+.5);
  return gridCrsToLonLat(x,y,data.crs);
}
function sampleAt(c,r){
  const a=pt(c,r);return sampleRealTerrain(map,a[0],a[1]);
}
test("terrain triangle interpolation matches mesh face heights, not imaginary detail",()=>{
  assert.ok(Math.abs(sampleAt(0,0).elevationM-100)<1e-6);
  assert.ok(Math.abs(sampleAt(2,2).elevationM-180)<1e-6);
  assert.ok(Math.abs(sampleAt(.25,.25).elevationM-110)<1e-6);
  assert.ok(Math.abs(sampleAt(.75,.75).elevationM-130)<1e-6);
  assert.ok(Math.abs(sampleAt(.5,.5).elevationM-120)<1e-6);
  assert.equal(sampleAt(-.1,.5),null,"must not invent outside DEM edge");
  assert.equal(sampleAt(2.1,1),null,"must not extrapolate DEM");
});
test("measure refuses missing DEM triangles without blending across holes",()=>{
  const withHole={elevation:{...data,values:new Float64Array(data.values)}};
  withHole.elevation.values[4]=NaN;
  const p=pt(.6,.6);
  assert.equal(sampleRealTerrain(withHole,...p),null);
  const p1=pt(0,0);
  assert.ok(sampleRealTerrain(withHole,...p1));
});
test("ground distance and longitudinal/latitudinal validity",()=>{
  assert.equal(terrainGroundDistanceM(14.4,50.1,14.4,50.1),0);
  const d=terrainGroundDistanceM(14.40,50.08,14.41,50.08);
  assert.ok(d>700&&d<730);
  assert.throws(()=>terrainGroundDistanceM(200,0,0,0),/Invalid/);
});
test("terrain profile retains actual endpoint heights and computes finite surface length",()=>{
  const start=pt(0,0),end=pt(2,0);
  const p=profileRealTerrain(map,start,end,{samples:5});
  assert.equal(p.samples.length,5);
  assert.equal(p.validSamples,5);
  assert.ok(Math.abs(p.samples[0].elevationM-100)<1e-6);
  assert.ok(Math.abs(p.samples[4].elevationM-120)<1e-6);
  assert.ok(Math.abs(p.ascentM-20)<1e-6);
  assert.ok(Math.abs(p.descentM)<1e-6);
  assert.ok(p.surfaceDistanceM>p.horizontalDistanceM);
  assert.equal(p.verticalDatum,"EGM2008 geoid");
  assert.throws(()=>profileRealTerrain(map,start,end,{samples:3000}),/2..2048/);
});
test("profile reports gaps instead of silently interpolating missing DEM",()=>{
  const grid={...data,values:new Float64Array(data.values)};
  grid.values[1]=NaN;
  const p=profileRealTerrain({elevation:grid,metadata:map.metadata},pt(0,0),pt(2,0),{samples:5});
  assert.ok(p.validSamples<5);
  assert.equal(p.surfaceDistanceM,null);
  assert.equal(p.ascentM,null);
  assert.ok(p.samples.some(s=>s.elevationM===null));
});
