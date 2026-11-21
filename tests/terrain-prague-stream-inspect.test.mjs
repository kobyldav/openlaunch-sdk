import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {pragueStreamManifest} from "../scripts/terrain-prague-stream-grid.mjs";

const page=await readFile(new URL("../scripts/terrain-prague-stream-inspect.js",import.meta.url),"utf8");
const realm={window:{}};
runInNewContext(page,realm);
const inspect=realm.window.OpenLaunchTerrainInspect;
assert.ok(inspect,"The browser inspector must be exposed to the actual streamed map");
function testTile({missingRight=false,withFakeSkirt=false}={}){
 const heights=[210,210,210,210];
 const positions=[
   0,0,heights[0],10,0,heights[1],
   0,-10,heights[2],10,-10,heights[3]
 ];
 const measured=missingRight?[0,1,2]:[0,1,2,1,3,2];
 if(withFakeSkirt){
   // Test-only visual-only geometry, high above the source.
   positions.push(5,-5,800,7,-5,800,5,-7,800);
   measured.push(4,5,6);
 }
 return {id:"test-source",positions:new Float32Array(positions),
   indices:new Uint16Array(measured),measuredTriangles:missingRight?1:2,
   width:2,height:2};
}
const down=(east,north)=>({origin:[east,600,-north],direction:[0,-1,0]});

test("vertical ray returns true Bpv source-triangle elevation without extrapolation",()=>{
 const sample=inspect.pickMeasured([testTile()],down(2,-2));
 assert.ok(sample);
 assert.ok(Math.abs(sample.elevationM-210)<1e-6);
 assert.ok(Math.abs(sample.east-2)<1e-6);
 assert.ok(Math.abs(sample.north+2)<1e-6);
 assert.equal(sample.id,"test-source");
 assert.equal(sample.verticalDatum,"Bpv (Baltic 1957)");
 const outside=inspect.pickMeasured([testTile()],down(15,-2));
 assert.equal(outside,null);
 assert.equal(inspect.pickMeasured([],down(2,-2)),null);
});
test("NoData faces are not interpolated and visual-only seam faces can never be measured",()=>{
 const tile=testTile({missingRight:true,withFakeSkirt:true});
 assert.equal(inspect.pickMeasured([tile],down(8,-8)),null);
 const measured=inspect.pickMeasured([tile],down(2,-2));
 assert.equal(measured.elevationM,210);
 // Test-only appendix overlaps x=5,y=-5 at 800m, but is never returned.
 assert.equal(inspect.pickMeasured([tile],down(5.3,-5.3)),null);
 const noSource={...testTile({withFakeSkirt:true}),measuredTriangles:0};
 assert.equal(inspect.pickMeasured([noSource],down(5.2,-5.2)),null);
});
test("2D pixel ray uses the exact perspective camera, including width and orientation",()=>{
 const camera={yaw:0,pitch:1.1,panX:5,panNorth:-5,vertical:1,distance:200};
 const basis=inspect.cameraBasis(camera);
 const ray=inspect.screenRay(camera,400,300,800,600);
 for(let i=0;i<3;i++)assert.ok(Math.abs(ray.direction[i]-basis.forward[i])<1e-10);
 const point=inspect.pickMeasured([testTile()],ray);
 assert.ok(point);
 assert.ok(point.elevationM>=209.999&&point.elevationM<=210.001);
 const left=inspect.screenRay(camera,0,300,800,600);
 const right=inspect.screenRay(camera,800,300,800,600);
 assert.ok(left.direction[0]!==right.direction[0]);
 assert.throws(()=>inspect.screenRay(camera,0,0,0,100),/viewport/);
 assert.throws(()=>inspect.cameraBasis({...camera,vertical:0}),/camera/);
});
test("profile includes genuine triangle samples, NaN gaps and accurate horizontal distances",()=>{
 const manifest=pragueStreamManifest();
 const a={east:2,north:-2},b={east:8,north:-8};
 const flat=inspect.profile([testTile()],a,b,{samples:17,config:manifest});
 assert.equal(flat.validSamples,17);
 assert.ok(flat.samples.every(x=>x.elevationM!==null&&Math.abs(x.elevationM-210)<1e-8));
 assert.ok(Math.abs(flat.horizontalDistanceM-Math.hypot(6,6))<1e-9);
 assert.ok(Math.abs(flat.surfaceDistanceM-flat.horizontalDistanceM)<1e-9);
 const partial=inspect.profile([testTile({missingRight:true})],a,b,
   {samples:17,config:manifest});
 assert.ok(partial.validSamples>=1&&partial.validSamples<17);
 assert.equal(partial.surfaceDistanceM,null);
 assert.ok(partial.samples.some(p=>p.elevationM===null));
 assert.equal(inspect.profile([],a,b,{samples:6,config:manifest}).validSamples,0);
 assert.equal(inspect.profile([],a,b,{samples:6,config:manifest}).surfaceDistanceM,null);
 assert.throws(()=>inspect.profile([],a,b,{samples:1,config:manifest}),/profile/);
});
test("local-metre to WGS84 conversion preserves manifest center and Earth orientation",()=>{
 const manifest=pragueStreamManifest();
 const center=inspect.geoFromLocal(0,0,manifest);
 assert.ok(Math.abs(center.longitudeDeg-manifest.center[0])<1e-10);
 assert.ok(Math.abs(center.latitudeDeg-manifest.center[1])<1e-10);
 const east=inspect.geoFromLocal(300,0,manifest);
 const north=inspect.geoFromLocal(0,300,manifest);
 assert.ok(east.longitudeDeg>center.longitudeDeg);
 assert.ok(north.latitudeDeg>center.latitudeDeg);
 assert.ok(Math.abs(east.latitudeDeg-center.latitudeDeg)<1e-10);
 assert.throws(()=>inspect.geoFromLocal(0,0,{}),/coordinate frame/);
});
