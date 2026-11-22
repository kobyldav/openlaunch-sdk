/** Visual-only edge aprons and down-facing skirts for independent real DSM tiles.
 *
 * Measured vertex elevations and triangle topology are unchanged. Aprons copy
 * observed boundary heights for at most half a raster cell to the exact common
 * tile outline; skirts extend those observed edges down by a declared depth.
 * Neither edge extrusion is an additional terrain measurement. Invalid DEM
 * perimeter samples never get fake elevations or synthetic geometry.
 */
import {mercatorFromLonLat,PRAGUE_STREAM_REGION} from "./terrain-prague-stream-grid.mjs";

export const TERRAIN_SEAM_VERSION=2;
export const SEAM_SKIRT_DEPTH_M=18;
const finite=Number.isFinite;

function worldBounds(area,region=PRAGUE_STREAM_REGION){
  const cx=(region.west+region.east)/2,cy=(region.south+region.north)/2;
  const [mx,my]=mercatorFromLonLat(cx,cy);
  const scale=Math.cos(region.centerLatitudeDeg*Math.PI/180);
  const [west,south,east,north]=area;
  const [wx,sy]=mercatorFromLonLat(west,south);
  const [ex,ny]=mercatorFromLonLat(east,north);
  return [(wx-mx)*scale,(sy-my)*scale,(ex-mx)*scale,(ny-my)*scale];
}
export function buildSeamMesh(mesh,width,height,bbox,originMeters,{skirtDepthM=SEAM_SKIRT_DEPTH_M}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||
    width*height>50000||!Array.isArray(bbox)||bbox.length!==4||
    bbox.some(n=>!finite(n))||!Array.isArray(originMeters)||originMeters.length!==2||
    originMeters.some(n=>!finite(n))||
    !finite(skirtDepthM)||skirtDepthM<2||skirtDepthM>80)
    throw new RangeError("Invalid seam mesh tile geometry or skirt depth");
  const original=mesh.positions,measured=mesh.triangles;
  if(original.length!==width*height*3||
    measured.length%3!==0||measured.some(i=>i>=width*height))
    throw new RangeError("Measured DSM grid or triangle layout does not match tile");
  const [west,south,east,north]=worldBounds(bbox);
  const [ox,oy]=originMeters;
  const pos=[],uv=[],faces=[];
  const measuredCount=width*height;
  for(let i=0;i<measuredCount;i++){
    const j=i*3,row=Math.floor(i/width),col=i%width;
    pos.push(original[j],original[j+1],original[j+2]);
    uv.push((col+.5)/width,(row+.5)/height);
  }
  for(const i of measured)faces.push(i);
  const good=i=>i>=0&&i<measuredCount&&finite(original[i*3+2]);
  const make=(x,y,z,u,v)=>{
    if(![x,y,z,u,v].every(finite))throw new RangeError("Invalid apron sample");
    const idx=pos.length/3;
    if(idx>=65536)throw new RangeError("WebGL1 index buffer exhausted by seams");
    pos.push(x,y,z);uv.push(u,v);return idx;
  };
  const project=(i,x,y,zDelta=0)=>{
    if(!good(i))return -1;
    const u=uv[i*2],v=uv[i*2+1];
    return make(x,y,original[i*3+2]+zDelta,u,v);
  };
  const addFace=(a,b,c)=>{
    if(a<0||b<0||c<0)return;
    faces.push(a,b,c);
  };
  let apronTriangles=0,skirtTriangles=0;
  const border=[
    {name:"north",indexes:Array.from({length:width},(_,i)=>i),
      edge:i=>[original[i*3],north-oy],inward:i=>i+width},
    {name:"south",indexes:Array.from({length:width},(_,i)=>(height-1)*width+i),
      edge:i=>[original[i*3],south-oy],inward:i=>i-width},
    {name:"west",indexes:Array.from({length:height},(_,i)=>i*width),
      edge:i=>[west-ox,original[i*3+1]],inward:i=>i+1},
    {name:"east",indexes:Array.from({length:height},(_,i)=>i*width+width-1),
      edge:i=>[east-ox,original[i*3+1]],inward:i=>i-1}
  ];
  let maxExtensionM=0;
  const sides=new Map();
  for(const side of border){
    const apron=[],low=[];
    for(const i of side.indexes){
      if(!good(i)||!good(side.inward(i))){apron.push(-1);low.push(-1);continue;}
      const [x,y]=side.edge(i);
      maxExtensionM=Math.max(maxExtensionM,
        Math.hypot(x-original[i*3],y-original[i*3+1]));
      const a=project(i,x,y);
      const b=project(i,x,y,-skirtDepthM);
      apron.push(a);low.push(b);
    }
    for(let j=1;j<side.indexes.length;j++){
      const left=side.indexes[j-1],right=side.indexes[j];
      if([left,right,apron[j-1],apron[j],low[j-1],low[j]].some(i=>i<0)||
        !good(side.inward(left))||!good(side.inward(right)))continue;
      addFace(left,right,apron[j]);addFace(left,apron[j],apron[j-1]);
      apronTriangles+=2;
      addFace(apron[j-1],apron[j],low[j]);addFace(apron[j-1],low[j],low[j-1]);
      skirtTriangles+=2;
    }
    sides.set(side.name,{apron,low});
  }
  // The four small corner gaps between the orthogonal aprons are closed using
  // the *observed* corner elevation and its copied north/east/south/west samples.
  const corners=[
    {index:0,coord:[west-ox,north-oy],sides:[["north",0],["west",0]]},
    {index:width-1,coord:[east-ox,north-oy],sides:[["north",width-1],["east",0]]},
    {index:(height-1)*width,coord:[west-ox,south-oy],sides:[["south",0],["west",height-1]]},
    {index:measuredCount-1,coord:[east-ox,south-oy],
      sides:[["south",width-1],["east",height-1]]}
  ];
  for(const corner of corners){
    const [a,b]=corner.sides.map(([name,idx])=>sides.get(name).apron[idx]);
    const [aLow,bLow]=corner.sides.map(([name,idx])=>sides.get(name).low[idx]);
    if(!good(corner.index)||a<0||b<0||aLow<0||bLow<0)continue;
    const [x,y]=corner.coord;
    const cap=project(corner.index,x,y),capLow=project(corner.index,x,y,-skirtDepthM);
    addFace(corner.index,a,cap);addFace(corner.index,cap,b);
    apronTriangles+=2;
    addFace(a,cap,capLow);addFace(a,capLow,aLow);
    addFace(cap,b,bLow);addFace(cap,bLow,capLow);
    skirtTriangles+=4;
  }
  // A malformed/no-data edge must not introduce any non-measured surface height.
  return {positions:new Float32Array(pos),uvs:new Float32Array(uv),
    triangles:new Uint16Array(faces),measuredVertices:mesh.validVertices,
    measuredTriangles:measured.length/3,
    renderVertices:pos.length/3,renderTriangles:faces.length/3,
    apronTriangles,skirtTriangles,skirtDepthM,maxExtensionM,
    provenance:"visual-only skirts/aprons; original ČÚZK elevations not modified"};
}
