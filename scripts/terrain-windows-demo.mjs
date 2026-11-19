import {mkdir,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {performance} from "node:perf_hooks";
import {createTerrainRpcCamera,reconstructTerrain,validateTerrainHeights,terrainPointCloudPly} from "../dist/terrain/index.js";

// Synthetic scene: these known heights are used ONLY to render the input
// views and evaluate the result, never as input to reconstructTerrain.
const width=180,height=140,cx=90,cy=70;
const terrain=(x,y)=>120+48*Math.exp(-((x-cx+7)**2+(y-cy-4)**2)/550)+10*Math.sin((x-cx)/20)*Math.cos((y-cy)/23);
const texture=(x,y)=>Math.sin(x*.35+y*.24)+.7*Math.cos(x*.19-y*.46)+.5*Math.sin(x*.77-y*.31)+.32*Math.sin(x*.11*y*.07);
const poly=(...pairs)=>{const v=Array(20).fill(0);for(const [i,n] of pairs)v[i]=n;return v;};
function view(shift,source){
  const camera=createTerrainRpcCamera({longitudeOffset:14,latitudeOffset:50,heightOffset:100,longitudeScale:.01,latitudeScale:.01,heightScale:100,sampleOffset:cx,lineOffset:cy,sampleScale:100,lineScale:100,sampleNumerator:poly([1,1],[3,shift]),sampleDenominator:poly([0,1]),lineNumerator:poly([2,1]),lineDenominator:poly([0,1])});
  const values=Float64Array.from({length:width*height},(_,i)=>{
    const px=i%width,y=Math.floor(i/width);
    let x=px;
    for(let n=0;n<40;n++)x=px-shift*(terrain(x,y)-100);
    return texture(x,y);
  });
  return {width,height,values,camera,source};
}
const images=[view(0,"synthetic-nadir"),view(.36,"synthetic-east"),view(-.36,"synthetic-west")];
const size=44,step=.0001;
const grid={width:size,height:size,crs:"EPSG:4326",transform:[14-size/2*step,step,0,50-size/2*step,0,step]};
console.log("OpenLaunch 3D terrain demo | SYNTHETIC stereo imagery (not satellite measurements)");
console.log("Reconstructing from three images, no input DEM...");
const start=performance.now();
const result=reconstructTerrain({images,grid,minHeightM:90,maxHeightM:200,heightStepM:5,patchRadius:2,minCorrelation:.65,minPeakGap:.008,maxWork:10_000_000});
const elapsed=performance.now()-start;
const checkpoints=Array.from({length:size*size},(_,i)=>({col:i%size,row:Math.floor(i/size),heightM:terrain(cx+i%size+.5-size/2,cy+Math.floor(i/size)+.5-size/2)}));
const validation=validateTerrainHeights(result.elevationMap,checkpoints);
const coverage=result.validPixels/result.totalPixels;
const report={synthetic:true,model:result.model,verticalDatum:result.verticalDatum,images:images.map(i=>i.source),validPixels:result.validPixels,totalPixels:result.totalPixels,coverage,triangles:result.mesh.triangles.length/3,validation,elapsedMs:Math.round(elapsed)};
console.log(JSON.stringify(report,null,2));
if(coverage<.5||validation.rmseM===null||validation.rmseM>12||report.triangles===0)throw new Error("Synthetic terrain quality gate failed");

// Rotate the SDK's ECEF-relative mesh into local east/north/up metres.
const lat=50*Math.PI/180,lon=14*Math.PI/180;
const enu=(x,y,z)=>[-Math.sin(lon)*x+Math.cos(lon)*y,-Math.sin(lat)*Math.cos(lon)*x-Math.sin(lat)*Math.sin(lon)*y+Math.cos(lat)*z,Math.cos(lat)*Math.cos(lon)*x+Math.cos(lat)*Math.sin(lon)*y+Math.sin(lat)*z];
const vertices=Array.from({length:result.totalPixels},(_,i)=>Number.isFinite(result.mesh.positions[i*3])?enu(...result.mesh.positions.slice(i*3,i*3+3)):null);
const faces=Array.from({length:result.mesh.triangles.length/3},(_,i)=>Array.from(result.mesh.triangles.slice(i*3,i*3+3)));
const out=resolve(process.argv[2]??"test-results/terrain-demo");
await mkdir(out,{recursive:true});
const obj=["# OpenLaunch synthetic terrain; local ENU metres; Y-up OBJ"];
const ids=new Map();
for(let i=0;i<vertices.length;i++){const v=vertices[i];if(v){ids.set(i,ids.size+1);obj.push("v "+[v[0],v[2],-v[1]].map(x=>x.toFixed(5)).join(" "));}}
for(const f of faces)obj.push("f "+[f[0],f[2],f[1]].map(i=>ids.get(i)).join(" "));
const csv=["longitude_deg,latitude_deg,reconstructed_height_m,confidence,synthetic_reference_height_m"];
for(let i=0;i<result.totalPixels;i++){const p=checkpoints[i],v=result.elevationMap.values[i],q=result.confidenceMap.values[i];csv.push([grid.transform[0]+(p.col+.5)*step,grid.transform[3]+(p.row+.5)*step,Number.isFinite(v)?v:"",Number.isFinite(q)?q:"",p.heightM].join(","));}
const pgm=im=>"P2\n"+im.width+" "+im.height+"\n255\n"+Array.from(im.values,v=>Math.max(0,Math.min(255,Math.round((v+2.6)/5.2*255)))).join(" ")+"\n";
const data={size,width,height,vertices,faces,heights:Array.from(result.elevationMap.values),confidence:Array.from(result.confidenceMap.values),inputs:images.map(im=>Array.from(im.values)),report};
const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenLaunch terrain demo</title><style>*{box-sizing:border-box}body{font:15px system-ui;background:#101821;color:#e1eaf1;margin:24px}h1{margin:0}p{color:#a8bac9}canvas{width:100%;height:auto;background:#152332;border-radius:8px;display:block}#mesh{touch-action:none;cursor:grab;max-height:65vh}.panel{background:#192735;padding:16px;border-radius:10px;margin:16px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}button{background:#2a465d;color:white;border:0;border-radius:5px;padding:10px}small{color:#a8bac9}</style><h1>OpenLaunch | 3D terrain reconstruction</h1><p>SYNTHETIC input views. No real satellite data or DEM. Drag to rotate, scroll to zoom.</p><div class="panel"><div id="stats"></div><canvas id="mesh" width="1000" height="600"></canvas><button id="reset">Reset view</button> <small>Local east / north / up coordinates in metres. Missing samples remain holes.</small></div><div class="grid"><div class="panel">Input: nadir<canvas id="a"></canvas></div><div class="panel">Input: east<canvas id="b"></canvas></div><div class="panel">Input: west<canvas id="c"></canvas></div><div class="panel">Reconstructed height<canvas id="d"></canvas></div><div class="panel">Matching confidence<canvas id="e"></canvas></div></div><script>const D='+JSON.stringify(data)+';'+
String.raw`const $=id=>document.getElementById(id);
const r=D.report;$("stats").textContent="Valid: "+r.validPixels+"/"+r.totalPixels+" | Triangles: "+r.triangles+" | Synthetic RMSE: "+r.validation.rmseM.toFixed(2)+" m";
function map(id,w,h,v,lo,hi,color){const c=$(id);c.width=w;c.height=h;const ctx=c.getContext("2d"),im=ctx.createImageData(w,h);v.forEach((x,i)=>{const p=i*4,t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));const rgb=x===null?[20,26,35]:color(t);im.data.set([...rgb,255],p);});ctx.putImageData(im,0,0);}
const gray=t=>[t*255,t*255,t*255],heightColor=t=>[45+205*t,105+100*t,155-110*t];
D.inputs.forEach((v,i)=>map(["a","b","c"][i],D.width,D.height,v,-2.6,2.6,gray));
map("d",D.size,D.size,D.heights,110,180,heightColor);map("e",D.size,D.size,D.confidence,0,1,gray);
const c=$("mesh"),ctx=c.getContext("2d");let az=-.7,tilt=.65,zoom=1,drag=null;
const good=D.vertices.filter(Boolean),center=[0,1,2].map(i=>good.reduce((s,v)=>s+v[i],0)/good.length);
const span=Math.max(...good.map(v=>Math.hypot(v[0]-center[0],v[1]-center[1],v[2]-center[2])),1);
function draw(){ctx.clearRect(0,0,c.width,c.height);const ca=Math.cos(az),sa=Math.sin(az),ct=Math.cos(tilt),st=Math.sin(tilt),scale=Math.min(c.width,c.height)*.42/span*zoom;
const p=D.vertices.map(v=>{if(!v)return null;const x=v[0]-center[0],y=v[1]-center[1],z=v[2]-center[2],a=ca*x-sa*y,b=sa*x+ca*y;return [c.width/2+a*scale,c.height/2+(b*st-z*ct)*scale,b*ct+z*st];});
const ordered=D.faces.map(f=>({f,depth:f.reduce((s,i)=>s+p[i][2],0)/3})).sort((a,b)=>a.depth-b.depth);
for(const {f} of ordered){const t=Math.max(0,Math.min(1,(f.reduce((s,i)=>s+D.heights[i],0)/3-110)/70));ctx.beginPath();f.forEach((i,k)=>{const v=p[i];if(k)ctx.lineTo(v[0],v[1]);else ctx.moveTo(v[0],v[1]);});ctx.closePath();ctx.fillStyle="rgb("+heightColor(t).map(Math.round).join(",")+")";ctx.fill();ctx.strokeStyle="rgba(9,20,29,.28)";ctx.stroke();}
}
c.onpointerdown=e=>{drag=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId);};c.onpointermove=e=>{if(!drag)return;az+=(e.clientX-drag[0])*.008;tilt=Math.max(.05,Math.min(1.55,tilt+(e.clientY-drag[1])*.008));drag=[e.clientX,e.clientY];draw();};c.onpointerup=c.onpointercancel=()=>drag=null;c.addEventListener("wheel",e=>{e.preventDefault();zoom=Math.max(.3,Math.min(4,zoom*Math.exp(-e.deltaY*.001)));draw();},{passive:false});$("reset").onclick=()=>{az=-.7;tilt=.65;zoom=1;draw();};draw();`+'</script></html>';
await Promise.all([
  writeFile(join(out,"terrain.html"),html),
  writeFile(join(out,"terrain.obj"),obj.join("\n")+"\n"),
  writeFile(join(out,"point-cloud.ply"),terrainPointCloudPly(result)),
  writeFile(join(out,"heights.csv"),csv.join("\n")+"\n"),
  writeFile(join(out,"report.json"),JSON.stringify(report,null,2)+"\n"),
  ...images.map(im=>writeFile(join(out,im.source+".pgm"),pgm(im)))
]);
console.log("Output: "+out);
console.log("Open terrain.html in your browser (offline).");
