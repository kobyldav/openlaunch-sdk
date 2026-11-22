import test from "node:test";
import assert from "node:assert/strict";
import {
 BUILDING_LAYER_VERSION,CUZK_DMR_5G,OVERPASS_ENDPOINT,
 world,parseOsmHeight,overpassQuery,fetchOsmFootprints,buildBuildings
} from "../scripts/terrain-prague-buildings.mjs";
import {tileSpec} from "../scripts/terrain-prague-stream-grid.mjs";
const tile=tileSpec(0,3,3);
const center=[(tile.west+tile.east)/2,(tile.south+tile.north)/2];
const polygon=(lon,lat,dLon=.00030,dLat=.00023)=>[
 {lon:lon-dLon,lat:lat-dLat},{lon:lon+dLon,lat:lat-dLat},
 {lon:lon+dLon,lat:lat+dLat},{lon:lon-dLon,lat:lat+dLat},
 {lon:lon-dLon,lat:lat-dLat}
];
function inputs(){
 const ground={width:20,height:20,
   values:new Float64Array(400).fill(183),
   bbox:[tile.west,tile.south,tile.east,tile.north],
   verticalDatum:"Bpv (Baltic 1957)"};
 const originMeters=[0,0],positions=[];
 const [x,y]=world(...center);
 for(let row=0;row<11;row++)for(let col=0;col<11;col++)
   positions.push(x+(col-5)*10,y+(row-5)*10,202);
 const dsm={positions:new Float32Array(positions),width:11,height:11,
   originMeters,verticalDatum:"Bpv (Baltic 1957)"};
 return {ground,dsm};
}
test("source height parser uses explicit numeric OSM heights only, never guessed floor count",()=>{
 assert.equal(parseOsmHeight("12.5 m"),12.5);
 assert.equal(parseOsmHeight("18,2"),18.2);
 assert.ok(Math.abs(parseOsmHeight("36ft")-10.9728)<1e-7);
 for(const input of ["4-6","~10","building:levels=5","2","301 m","10;20",null,14])
   assert.equal(parseOsmHeight(input),null);
 assert.equal(BUILDING_LAYER_VERSION,1);
 assert.match(CUZK_DMR_5G,/cuzk/);
 assert.match(OVERPASS_ENDPOINT,/overpass/);
});
test("OSM query is area bounded, real-data only, with no synthetic fallback",async()=>{
 const q=overpassQuery(tile);
 assert.match(q,/way\["building"\]/);
 assert.match(q,/out tags geom/);
 assert.match(q,/\[timeout:30\]/);
 assert.throws(()=>overpassQuery({...tile,east:tile.west+1}),/Bounded/);
 const elements=[{type:"way",id:123,tags:{building:"yes",height:"15"},
   geometry:polygon(...center)}];
 let calls=0;
 const actual=await fetchOsmFootprints(tile,{fetchImpl:async(url,options)=>{
   calls++;assert.equal(url,OVERPASS_ENDPOINT);
   assert.equal(options.method,"POST");
   assert.match(options.body,/data=/);
   return new Response(JSON.stringify({elements}),{
     status:200,headers:{"Content-Type":"application/json"}});
 }});
 assert.equal(calls,1);
 assert.equal(actual[0].id,123);
 await assert.rejects(()=>fetchOsmFootprints(tile,{fetchImpl:async()=>new Response(
   JSON.stringify({elements:"wrong"}),{status:200})}),/elements/);
 await assert.rejects(()=>fetchOsmFootprints(tile,{fetchImpl:async()=>new Response(
   "temporarily rate-limited",{status:429})}),/HTTP 429/);
});
test("3D building geometry has real OSM footprint and DMR ground, explicitly tagged roof height",()=>{
 const {ground,dsm}=inputs();
 const objects=[{type:"way",id:1,tags:{building:"yes",height:"16 m"},
   geometry:polygon(...center)}];
 const result=buildBuildings(tile,objects,ground,dsm);
 assert.equal(result.status,"real-source-buildings");
 assert.equal(result.buildings,1);
 assert.equal(result.heightMethods.explicitOsmHeight,1);
 assert.equal(result.heightMethods.estimatedDsmMinusDmr,0);
 assert.equal(result.heightMethods.omitted,0);
 assert.equal(result.roofGeometry,"flat-LOD1-visual-proxy");
 assert.match(result.source,/OpenStreetMap/);
 assert.match(result.source,/ČÚZK/);
 const vertices=new Float32Array(Buffer.from(result.positionsF32LE,"base64").buffer.slice(0));
 const tris=Buffer.from(result.trianglesU16LE,"base64");
 assert.equal(vertices.length,24);
 assert.equal(tris.length,12*3*2);
 const actual=Buffer.from(result.positionsF32LE,"base64");
 const pos=new Float32Array(actual.buffer,actual.byteOffset,actual.byteLength/4);
 const heights=Array.from({length:8},(_,i)=>pos[i*3+2]);
 assert.ok(heights.slice(0,4).every(h=>h===183));
 assert.ok(heights.slice(4).every(h=>h===199));
 assert.equal(result.triangles,12);
});
test("without tag, roof is derived only from real DSM points and real ground heights",()=>{
 const {ground,dsm}=inputs();
 const objects=[{type:"way",id:2,tags:{building:"yes"},
   geometry:polygon(...center)}];
 const result=buildBuildings(tile,objects,ground,dsm);
 assert.equal(result.buildings,1);
 assert.equal(result.heightMethods.explicitOsmHeight,0);
 assert.equal(result.heightMethods.estimatedDsmMinusDmr,1);
 const actual=Buffer.from(result.positionsF32LE,"base64");
 const pos=new Float32Array(actual.buffer,actual.byteOffset,actual.byteLength/4);
 assert.ok(pos.every(Number.isFinite));
 assert.ok(Array.from({length:4},(_,i)=>pos[(i+4)*3+2]).every(h=>h===202));
 const holes=inputs();
 holes.dsm.positions.fill(NaN);
 assert.equal(buildBuildings(tile,objects,holes.ground,holes.dsm).buildings,0,
   "no DSM roof means no constructed inferred building");
 const noground=inputs();
 noground.ground.values.fill(NaN);
 assert.equal(buildBuildings(tile,objects,noground.ground,noground.dsm).buildings,0,
   "no ground means no invented building elevation");
});
test("open, incomplete and invalid OSM buildings are omitted without synthetic geometry",()=>{
 const {ground,dsm}=inputs();
 const objects=[
  {type:"way",id:1,tags:{building:"yes",height:"20"},
    geometry:polygon(...center).slice(0,-1)},
  {type:"way",id:2,tags:{building:"yes"},
    geometry:[...polygon(...center).slice(0,2)]},
  {type:"way",id:3,tags:{building:"yes",height:"-50"},
    geometry:polygon(...center)}
 ];
 const result=buildBuildings(tile,objects,ground,dsm);
 assert.equal(result.heightMethods.omitted>=2,true);
 assert.ok(result.buildings<=1);
 assert.throws(()=>buildBuildings(tile,[],{...ground,verticalDatum:"EGM2008"},dsm),/Bpv/);
 assert.throws(()=>buildBuildings(tile,[],ground,{...dsm,verticalDatum:"EGM2008"}),/Bpv/);
});
