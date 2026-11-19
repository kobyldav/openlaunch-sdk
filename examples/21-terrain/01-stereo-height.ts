import { createTerrainRpcCamera,reconstructTerrain,validateTerrainHeights,terrainPointCloudPly } from "../../src/index.js";
const poly=(index:number,value:number)=>Array.from({length:20},(_,i)=>i===index?value:0);
function image(shift:number,source:string){
  const sampleNumerator=poly(1,1);sampleNumerator[3]=shift;
  const camera=createTerrainRpcCamera({longitudeOffset:14,latitudeOffset:50,heightOffset:100,longitudeScale:.01,latitudeScale:.01,heightScale:100,sampleOffset:48,lineOffset:48,sampleScale:40,lineScale:40,sampleNumerator,sampleDenominator:poly(0,1),lineNumerator:poly(2,1),lineDenominator:poly(0,1)});
  // Synthetic independent views of a textured 140 m ellipsoidal surface.
  const values=Float64Array.from({length:96*96},(_,i)=>{const x=i%96-16*shift,y=Math.floor(i/96);return Math.sin(x*.63+y*.41)+Math.cos(x*.27-y*.71)+Math.sin(x*.81-y*.21);});
  return {width:96,height:96,values,source,camera};
}
const result=reconstructTerrain({images:[image(0,"left"),image(1,"right")],grid:{width:5,height:5,crs:"EPSG:4326",transform:[13.9995,.00025,0,49.9995,0,.00025]},minHeightM:80,maxHeightM:200,heightStepM:5,minPeakGap:.005});
console.log({valid:result.validPixels,validation:validateTerrainHeights(result.elevationMap,[{col:2,row:2,heightM:140}]),plyBytes:terrainPointCloudPly(result).length});
if(result.validPixels<20)throw new Error("Synthetic stereo reconstruction failed");
