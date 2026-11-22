import test from "node:test";
import assert from "node:assert/strict";
import {captureSentinelRegionSeamEdges,compareSentinelRegionSeamEdges,
 SENTINEL_REGION_SEAM_VERSION} from "../dist/index.js";

const R=6378137;
function merc(lon,lat){
 return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
}
function source({key="a",bounds={west:14.4,south:50.09,east:14.41,north:50.10},
  width=5,height=4,values,day=5,shift=0}={}){
 const [x0,y0]=merc(bounds.west,bounds.north),
   [x1,y1]=merc(bounds.east,bounds.south);
 return {key,bounds,width,height,grid:{crs:"EPSG:3857",transform:[
   x0+shift,(x1-x0)/width,0,y0,0,(y1-y0)/height]},
   slopePerYear:Float32Array.from(values??Array(width*height).fill(.1)),
   years:[2023,2024,2025].map(year=>({year,scenes:[day,day+10].map((d,i)=>({
     sceneId:"S2A_"+year+"08"+String(d).padStart(2,"0")+"_"+i+"_L2A",
     acquiredAt:year+"-08-"+String(d).padStart(2,"0")+"T10:00:00Z"
   }))}))};
}
const west={west:14.4,south:50.09,east:14.41,north:50.10},
  east={west:14.41,south:50.09,east:14.42,north:50.10},
  south={west:14.4,south:50.08,east:14.41,north:50.09};
const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,
 "Expected "+actual+" close to "+expected);

test("Stage 18: compare exact native neighboring source edge centers, no NoData filling",()=>{
 const av=Array(20).fill(.02),bv=Array(20).fill(.3);
 // Each original adjacent pixel-center pair is distinct, not co-located.
 for(let row=0;row<4;row++){
   av[row*5+4]=.1;
   bv[row*5]=.15;
 }
 bv[2*5]=NaN; // Real masked pixel must never count as a zero value.
 const a=captureSentinelRegionSeamEdges(source({values:av,bounds:west,key:"0-3-3"})),
   b=captureSentinelRegionSeamEdges(source({values:bv,bounds:east,key:"0-4-3"}));
 assert.equal(a.east.length,4);
 assert.equal(a.west.length,4);
 assert.ok(!("slopePerYear" in a),"Stage 18 retains edge strips, not source raster");
 const r=compareSentinelRegionSeamEdges(a,b);
 assert.equal(r.version,SENTINEL_REGION_SEAM_VERSION);
 assert.equal(r.orientation,"east-west");
 assert.equal(r.tileA,"0-3-3");
 assert.equal(r.tileB,"0-4-3");
 assert.equal(r.state,"comparable");
 assert.equal(r.sourceEdgePixels,4);
 assert.equal(r.pairedPixels,3);
 approx(r.meanAbsDifferenceNdviPerYear,.05);
 approx(r.maxAbsDifferenceNdviPerYear,.05);
 approx(r.meanSignedBMinusANdviPerYear,.05);
 assert.equal(r.warning,false);
 assert.equal(compareSentinelRegionSeamEdges(a,b,.02).warning,true);
 const reverse=compareSentinelRegionSeamEdges(b,a);
 assert.equal(reverse.state,"comparable");
 approx(reverse.meanAbsDifferenceNdviPerYear,.05);
});

test("Stage 18: different authentic acquisitions are never silently treated as same-scene seams",()=>{
 const a=captureSentinelRegionSeamEdges(source({bounds:west,key:"a"})),
   b=captureSentinelRegionSeamEdges(source({bounds:east,key:"b",day:6}));
 const r=compareSentinelRegionSeamEdges(a,b);
 assert.equal(r.comparableSources,false);
 assert.equal(r.state,"different-acquisitions");
 assert.equal(r.pairedPixels,0);
 assert.equal(r.meanAbsDifferenceNdviPerYear,null);
 assert.equal(r.warning,true);
 assert.match(r.note,/Different original Sentinel/);
});

test("Stage 18: north-south adjacent native edge samples and masked edge",()=>{
 const a=captureSentinelRegionSeamEdges(source({bounds:west,key:"a"}));
 const b=captureSentinelRegionSeamEdges(source({bounds:south,key:"b"}));
 const r=compareSentinelRegionSeamEdges(a,b);
 assert.equal(r.state,"comparable");
 assert.equal(r.orientation,"north-south");
 assert.equal(r.pairedPixels,5);
 approx(r.meanAbsDifferenceNdviPerYear,0);
 const absent=source({bounds:south,key:"masked",values:Array(20).fill(NaN)});
 const c=captureSentinelRegionSeamEdges(absent);
 const zero=compareSentinelRegionSeamEdges(a,c);
 assert.equal(zero.state,"insufficient-edge-data");
 assert.equal(zero.pairedPixels,0);
 assert.equal(zero.meanAbsDifferenceNdviPerYear,null);
});

test("Stage 18: reject inaccurate grid phase and geographically unrelated source rasters",()=>{
 const a=captureSentinelRegionSeamEdges(source({bounds:west,key:"a"}));
 const shifted=source({bounds:east,key:"b",shift:30});
 assert.throws(()=>captureSentinelRegionSeamEdges(shifted),/not located/);
 const differentRaster=source({bounds:east,key:"b",width:6,height:4});
 const r=compareSentinelRegionSeamEdges(a,captureSentinelRegionSeamEdges(differentRaster));
 // Native grids have different projected longitudinal step across the seam,
 // but Y edge pixel centers are still aligned for an east-west neighbor.
 assert.equal(r.state,"comparable");
 const mismatched=source({bounds:east,key:"b",width:5,height:5});
 const unaligned=compareSentinelRegionSeamEdges(a,
   captureSentinelRegionSeamEdges(mismatched));
 assert.equal(unaligned.state,"unaligned-grid");
 assert.equal(unaligned.pairedPixels,0);
 assert.throws(()=>compareSentinelRegionSeamEdges(a,a),/identical/);
 assert.throws(()=>compareSentinelRegionSeamEdges(a,
   captureSentinelRegionSeamEdges(source({bounds:{
     west:14.6,east:14.61,south:50.09,north:50.10
   },key:"d"}))),/share one/);
});

test("Stage 18: invalid radiometric values, dates, nodata and missing origin fail closed",()=>{
 assert.throws(()=>captureSentinelRegionSeamEdges(source({
   values:Array(20).fill(Infinity)})),/Invalid observed/);
 assert.throws(()=>captureSentinelRegionSeamEdges(source({
   bounds:west,width:5,height:4,values:Array(18).fill(0)})),/source-verified/);
 assert.throws(()=>captureSentinelRegionSeamEdges({
   ...source(),years:[{year:2025,scenes:[]}]
 }),/source-verified/);
});

test("Stage 18: real 3D viewer and localhost stream use no source edge extrapolation",async()=>{
 const {readFile}=await import("node:fs/promises");
 const {Script}=await import("node:vm");
 const page=await readFile(new URL("../scripts/terrain-prague-stream-viewer.html",import.meta.url),"utf8");
 const js=page.match(/<script>\s*"use strict";([\s\S]+?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Script(js));
 assert.match(page,/id="region-seam-export"/);
 assert.match(page,/id="region-seam-note"/);
 assert.match(page,/regionSeams\.push\(seam\)/);
 assert.match(page,/ctx\.setLineDash\(seam\.warning/);
 assert.match(page,/function exportRegionSeamsCsv\(/);
 assert.match(page,/vUv\.x>=0\.0 && vUv\.x<=1\.0/);
 assert.match(page,/vUv\.y>=0\.0 && vUv\.y<=1\.0/);
 const server=await readFile(new URL("../scripts/terrain-prague-stream.mjs",import.meta.url),"utf8");
 assert.match(server,/captureSentinelRegionSeamEdges\(/);
 assert.match(server,/compareSentinelRegionSeamEdges\(/);
 assert.match(server,/emit\(\{type:"seam",seam\}\)/);
 assert.match(server,/seamWarningCount:seams\.filter/);
});
