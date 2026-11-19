import test from "node:test";
import assert from "node:assert/strict";
import {parseTerrainRpcXml,refineTerrainSurface,loadTerrainRpcImage} from "../dist/terrain/index.js";
const poly=(i)=>Array.from({length:20},(_,j)=>i===j?1:0).join(" ");
const xml="<RPB><IMAGE>"+Object.entries({LINEOFFSET:5,SAMPOFFSET:6,LATOFFSET:50,LONGOFFSET:14,HEIGHTOFFSET:100,LINESCALE:4,SAMPSCALE:4,LATSCALE:.01,LONGSCALE:.01,HEIGHTSCALE:100,LINENUMCOEF:poly(2),LINEDENCOEF:poly(0),SAMPNUMCOEF:poly(1),SAMPDENCOEF:poly(0)}).map(([k,v])=>"<"+k+">"+v+"</"+k+">").join("")+"</IMAGE></RPB>";
test("ASP RPC XML and raw unreferenced TIFF input",async()=>{
 const r=parseTerrainRpcXml(xml);assert.equal(r.longitudeOffset,14);assert.equal(r.lineOffset,5);assert.equal(parseTerrainRpcXml(xml,{pixelOrigin:1}).lineOffset,4);
 assert.throws(()=>parseTerrainRpcXml("<!DOCTYPE x>"+xml),/Unsafe/);
 const tags=[[256,4,2],[257,4,2],[258,3,8],[259,3,1],[262,3,1],[273,4,122],[277,3,1],[278,4,2],[279,4,4]];
 const b=new Uint8Array(126),v=new DataView(b.buffer);b.set([73,73]);v.setUint16(2,42,true);v.setUint32(4,8,true);v.setUint16(8,tags.length,true);
 tags.forEach(([tag,type,val],i)=>{const p=10+i*12;v.setUint16(p,tag,true);v.setUint16(p+2,type,true);v.setUint32(p+4,1,true);v.setUint32(p+8,val,true);});b.set([1,2,3,4],122);
 const im=await loadTerrainRpcImage(b,"raw",{xml});assert.deepEqual([...im.image.values],[1,2,3,4]);
});
test("quality pass removes isolated spikes without mutating raw data; interpolation flagged",()=>{
 const values=new Float64Array(25).fill(100);values[12]=900;const grid={width:5,height:5,crs:"EPSG:4326",transform:[14,.001,0,50,0,-.001],values};
 const r=refineTerrainSurface(grid,{outlierM:30,fillRadius:1});assert.equal(r.rejected,1);assert.equal(r.filled,1);assert.equal(r.flags[12],3);assert.equal(r.grid.values[12],100);assert.equal(values[12],900);
});
