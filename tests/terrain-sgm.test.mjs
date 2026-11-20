import test from "node:test";
import assert from "node:assert/strict";
import {aggregateTerrainCostVolume,reconstructTerrain} from "../dist/terrain/index.js";

const inf=Infinity;
test("SGM paths support a uniform surface despite isolated local outlier",()=>{
 const width=7,height=5,levels=5,n=width*height;
 const costs=new Float32Array(n*levels);
 for(let p=0;p<n;p++)for(let d=0;d<levels;d++)costs[p*levels+d]=d===2?0.1:0.7;
 const center=2*width+3;
 costs[center*levels+2]=0.28;
 costs[center*levels+4]=0.02; // local unary favours a false isolated spike
 const aggregated=aggregateTerrainCostVolume({width,height,levels,costs},{paths:8,p1:.04,p2:.40});
 const winner=[...Array(levels).keys()].sort((a,b)=>aggregated[center*levels+a]-aggregated[center*levels+b])[0];
 assert.equal(winner,2);
});
test("SGM leaves all invalid photometric labels invalid, including path seams",()=>{
 const costs=Float32Array.from([1,0,2,inf,inf,inf,1,0,2]);
 const result=aggregateTerrainCostVolume({width:3,height:1,levels:3,costs});
 assert.ok([3,4,5].every(k=>!Number.isFinite(result[k])));
 assert.equal(result.length,costs.length);
 assert.throws(()=>aggregateTerrainCostVolume({width:3,height:1,levels:3,costs},{p1:.5,p2:.1}),/SGM/);
});
test("SGM refuses unsupported postprocessing modes",()=>{
 const images=[0,1].map((k)=>({width:8,height:8,source:"view"+k,
   values:new Float64Array(64).fill(1),camera:{project:()=>({x:4,y:4})}}));
 const o={matcher:"sgm",images,grid:{width:3,height:3,crs:"EPSG:4326",transform:[14,.001,0,50,0,-.001]},minHeightM:0,maxHeightM:30,heightStepM:5};
 assert.throws(()=>reconstructTerrain({...o,recoverMissing:true}),/Unsupported SGM/);
 assert.throws(()=>reconstructTerrain({...o,sgmPaths:6}),/SGM/);
});
