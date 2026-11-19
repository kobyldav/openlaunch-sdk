import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
// Reference is fetched AFTER reconstruction and never passed to the matcher.
export async function compareReference(grid,out){
 const lon=grid.transform[0]+grid.width*grid.transform[1]/2,lat=grid.transform[3]+grid.height*grid.transform[5]/2;
 const south=Math.floor(lat),west=Math.floor(lon);
 const tag=(v,pos,neg,len)=>(v>=0?pos:neg)+String(Math.abs(v)).padStart(len,"0");
 const ns=tag(south,"N","S",2),name=ns+tag(west,"E","W",3);
 const url="https://s3.amazonaws.com/elevation-tiles-prod/skadi/"+ns+"/"+name+".hgt.gz";
 const path=join(out,name+".hgt.gz");
 let compressed=await readFile(path).catch(()=>null);
 if(!compressed){const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error("Reference HTTP "+response.status);compressed=Buffer.from(await response.arrayBuffer());if(compressed.length>30_000_000)throw Error("Reference download too large");await writeFile(path,compressed);}
 const raw=gunzipSync(compressed,{maxOutputLength:26_000_000}),n=Math.sqrt(raw.length/2);
 if(![1201,3601].includes(n))throw Error("Unexpected HGT dimensions");
 const errors=[],reference=[];let sum=0,ss=0;
 for(let i=0;i<grid.values.length;i++){
   const h=grid.values[i],x=grid.transform[0]+(i%grid.width+.5)*grid.transform[1],y=grid.transform[3]+(Math.floor(i/grid.width)+.5)*grid.transform[5];
   const col=Math.round((x-west)*(n-1)),row=Math.round((south+1-y)*(n-1));
   if(!Number.isFinite(h)||col<0||row<0||col>=n||row>=n)continue;
   const z=raw.readInt16BE(2*(row*n+col));if(z===-32768)continue;
   const e=h-z;errors.push(e);reference.push(z);sum+=e;ss+=e*e;
 }
 if(errors.length<10)throw Error("Insufficient reference overlap");
 const bias=sum/errors.length,centeredRmseM=Math.sqrt(Math.max(0,ss/errors.length-bias*bias));
 return {source:url,attribution:"Mapzen Terrain Tiles, USGS SRTM and other public sources",referenceDatum:"EGM96 orthometric (not converted)",reconstructedDatum:"WGS84 ellipsoid",count:errors.length,meanDifferenceM:bias,centeredRmseM,uncorrectedRmseM:Math.sqrt(ss/errors.length),referenceMinM:Math.min(...reference),referenceMaxM:Math.max(...reference),note:"Independent comparison only; constant datum offset removed in centered RMSE, no absolute ellipsoidal accuracy claim."};
}
