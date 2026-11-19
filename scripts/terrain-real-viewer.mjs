import {writeFile} from "node:fs/promises";
import {join} from "node:path";
export async function writeRealTerrainViewer(out,{result,refined,report}){
 const w=result.elevationMap.width,h=result.elevationMap.height;
 const data={w,h,raw:Array.from(result.elevationMap.values),refined:Array.from(refined.grid.values),flags:Array.from(refined.flags),texture:Array.from(result.texture.values),confidence:Array.from(result.confidenceMap.values),report};
 const good=data.refined.filter(Number.isFinite),min=good.length?Math.min(...good):0,max=good.length?Math.max(...good):1;
 const obj=["# OpenLaunch refined DSM: local horizontal approx metres, Y up; flags 3 interpolated"];
 const ids=new Map();for(let i=0;i<w*h;i++){const z=data.refined[i];if(Number.isFinite(z)){ids.set(i,ids.size+1);obj.push("v "+[(i%w-w/2)*report.resolutionM,z,-(h/2-Math.floor(i/w))*report.resolutionM].join(" "));}}
 for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){const a=y*w+x,b=a+1,c=a+w,d=c+1;for(const f of [[a,c,b],[b,c,d]])if(f.every(i=>ids.has(i)))obj.push("f "+f.map(i=>ids.get(i)).join(" "));}
 await writeFile(join(out,"terrain.obj"),obj.join("\n")+"\n");
 const html='<!doctype html><meta charset="utf-8"><title>OpenLaunch real stereo terrain</title><style>body{background:#0f1924;color:#ecf4fa;font:15px system-ui;margin:24px}canvas{background:#172637;width:100%;max-height:72vh;touch-action:none;display:block;border-radius:8px}label{margin:10px;display:inline-block}button,select{padding:8px}small{color:#b3c4d2}</style><h1>OpenLaunch | Real satellite stereo reconstruction</h1><p id="summary"></p><label>Surface <select id="mode"><option value="refined">Filtered + marked interpolation</option><option value="raw">Raw measured heights</option></select></label><label>Color <select id="color"><option value="texture">Projected image intensity</option><option value="height">Height</option><option value="confidence">Confidence</option><option value="quality">Quality flags</option></select></label><label>Vertical scale <input id="z" type="range" min="1" max="8" step=".25" value="2"><span id="zv">2x</span></label><label><input id="wire" type="checkbox"> Wireframe</label><canvas id="c" width="1100" height="650"></canvas><p><small>Drag to rotate, wheel to zoom. Orange = interpolated in quality view. Unvalidated ellipsoidal DSM, not bare-earth elevation or live satellite data.</small></p><script>const D='+JSON.stringify(data)+',LO='+min+',HI='+max+';'+String.raw`
 const $=id=>document.getElementById(id),c=$("c"),ctx=c.getContext("2d");let az=-.7,tilt=.65,zoom=1,drag=null;
 $("summary").textContent="Measured "+D.report.validPixels+"/"+D.report.totalPixels+" | filtered "+D.report.rejected+" | interpolated "+D.report.interpolated+" | independently validated: no";
 const tex=D.texture.filter(Number.isFinite),tmin=tex.length?Math.min(...tex):0,tmax=tex.length?Math.max(...tex):1;
 const norm=(x,a,b)=>Math.max(0,Math.min(1,(x-a)/Math.max(1e-9,b-a)));
 function draw(){ctx.clearRect(0,0,c.width,c.height);const raw=$("mode").value==="raw",vals=raw?D.raw:D.refined,z=Number($("z").value),s=Math.min(c.width,c.height)*.78/(Math.max(D.w,D.h)*D.report.resolutionM)*zoom; $("zv").textContent=z+"x";
 const ca=Math.cos(az),sa=Math.sin(az),ct=Math.cos(tilt),st=Math.sin(tilt),p=vals.map((v,i)=>{if(v===null)return null;const x=(i%D.w-D.w/2)*D.report.resolutionM,y=(D.h/2-Math.floor(i/D.w))*D.report.resolutionM,h=(v-(LO+HI)/2)*z,a=ca*x-sa*y,b=sa*x+ca*y;return [c.width/2+a*s,c.height/2+(b*st-h*ct)*s,b*ct+h*st];});
 const faces=[];for(let y=0;y<D.h-1;y++)for(let x=0;x<D.w-1;x++){const a=y*D.w+x,b=a+1,d=a+D.w,e=d+1;for(const f of [[a,d,b],[b,d,e]])if(f.every(i=>p[i]))faces.push({f,depth:f.reduce((s,i)=>s+p[i][2],0)/3});}faces.sort((a,b)=>a.depth-b.depth);
 for(const {f} of faces){const avg=a=>f.reduce((s,i)=>s+(a[i]??0),0)/3,mode=$("color").value;let rgb;const t=norm(avg(vals),LO,HI),q=avg(D.confidence),g=norm(avg(D.texture),tmin,tmax);
 if(mode==="quality")rgb=f.some(i=>D.flags[i]===3)?[244,154,46]:[75,175,140];else if(mode==="height")rgb=[45+210*t,110+95*t,165-100*t];else if(mode==="confidence")rgb=[210*(1-q),180*q,90];else rgb=[55+185*g,65+170*g,75+155*g];
 ctx.beginPath();f.forEach((i,k)=>{const v=p[i];if(k)ctx.lineTo(v[0],v[1]);else ctx.moveTo(v[0],v[1]);});ctx.closePath();ctx.fillStyle="rgb("+rgb.map(Math.round).join(",")+")";ctx.fill();if($("wire").checked){ctx.strokeStyle="#1118";ctx.stroke();}}
 }
 for(const id of ["mode","color","z","wire"])$(id).oninput=draw;c.onpointerdown=e=>{drag=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId);};c.onpointermove=e=>{if(!drag)return;az+=(e.clientX-drag[0])*.008;tilt=Math.max(.05,Math.min(1.55,tilt+(e.clientY-drag[1])*.008));drag=[e.clientX,e.clientY];draw();};c.onpointerup=c.onpointercancel=()=>drag=null;c.addEventListener("wheel",e=>{e.preventDefault();zoom=Math.max(.3,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));draw();},{passive:false});draw();
 `+'</script>';
 await writeFile(join(out,"terrain.html"),html);
}
