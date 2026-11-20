import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {deflateSync} from "node:zlib";
import {bbox} from "../dist/geo/types.js";
import {fetchSentinel2RgbTile} from "../dist/eo/sentinel2-rgb.js";

const args=process.argv.slice(2);
const opt=(key,fallback)=>{
 const i=args.indexOf("--"+key);
 if(i<0)return fallback;
 if(!args[i+1]||args[i+1].startsWith("--"))throw Error("Missing --"+key);
 return args[i+1];
};
const out=resolve(opt("out","test-results/terrain-prague-sentinel2"));
const startDate=opt("from","2025-06-01"),endDate=opt("to","2025-09-30");
const maxCloudPercent=Number(opt("max-cloud","35"));
const area=bbox(14.411,50.083,14.430,50.094);
const imageName="prague-sentinel2-rgb.png";
await mkdir(out,{recursive:true});
const reportPath=join(out,"report.json"),imagePath=join(out,imageName),pagePath=join(out,"index.html");
const escape=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function html(report,error=""){
 const good=!!report,scene=good?'<p><b>Acquisition:</b> '+escape(report.acquiredAt)+' | <b>Scene:</b> '+escape(report.sceneId)+
 ' | <b>Scene cloud cover:</b> '+escape(report.sceneCloudPercent)+" %"+
 ' | <b>Native pixel:</b> '+escape(report.nativeResolutionM)+" m</p>":'';
 return '<!doctype html><html lang="en"><meta charset="utf-8"><title>OpenLaunch | Real Sentinel-2 Prague</title>'+
 '<style>body{max-width:1060px;margin:28px auto;padding:0 16px;background:#0d1826;color:#e9f1f8;font:15px system-ui}'+
 'section{background:#1a2b3d;padding:18px;border-radius:10px}a{color:#90c8ff}'+
 'img{image-rendering:pixelated;border:1px solid #465973;max-width:none}'+
 'button{padding:7px 12px}#viewport{overflow:auto;max-height:68vh}</style>'+
 '<h1>OpenLaunch | Real Sentinel-2 RGB of central Prague</h1>'+
 '<p>Actual Copernicus Sentinel-2 L2A scene from Element84 Earth Search, retrieved by OpenLaunch SDK.</p>'+
 (good?'<section>'+scene+
 '<p><button id="minus">−</button> <span id="zoom"></span> <button id="plus">+</button>'+
 ' · <a href="'+imageName+'">Original generated PNG</a> · <a href="report.json">Source metadata</a></p>'+
 '<div id="viewport"><img id="rgb" src="'+imageName+'" alt="Actual satellite imagery over Prague"></div>'+
 '<p>Contrast-stretched band imagery: B04 red / B03 green / B02 blue. Pixel zoom does not add physical detail.</p>'+
 '<p><b>Not 3D:</b> Sentinel-2 does not supply a calibrated high-detail stereo pair. No building heights or terrain were inferred.</p></section>'+
 '<script>let scale=3;const img=document.getElementById("rgb");const z=document.getElementById("zoom");'+
 'function upd(){img.style.width='+report.width+'*scale+"px";z.textContent=scale+"× pixels";}'+
 'document.getElementById("plus").onclick=()=>{scale=Math.min(12,scale+1);upd()};'+
 'document.getElementById("minus").onclick=()=>{scale=Math.max(1,scale-1);upd()};upd();</script>':
 '<section><b>Real data unavailable.</b><pre style="white-space:pre-wrap">'+escape(error)+
 '</pre><p>No fake image or synthetic elevation has been generated.</p></section>')+'</html>';
}
function crc(buffer){let c=0xffffffff;for(const x of buffer){c^=x;
 for(let k=0;k<8;k++)c=c>>>1^(c&1?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,payload){const tag=Buffer.from(type),len=Buffer.alloc(4),check=Buffer.alloc(4);
 len.writeUInt32BE(payload.length);check.writeUInt32BE(crc(Buffer.concat([tag,payload])));
 return Buffer.concat([len,tag,payload,check]);}
function pngRgb(w,h,rgb){
 const uncompressed=Buffer.alloc(h*(w*3+1));
 for(let row=0;row<h;row++)Buffer.from(rgb.buffer,rgb.byteOffset+row*w*3,w*3)
   .copy(uncompressed,row*(w*3+1)+1);
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),
   chunk("IDAT",deflateSync(uncompressed,{level:6})),chunk("IEND",Buffer.alloc(0))]);
}
function stretch(a){
 const vals=Array.from(a).filter(v=>Number.isFinite(v)&&v>0).sort((x,y)=>x-y);
 if(!vals.length)throw Error("No valid reflectance samples for selected RGB band");
 const low=vals[Math.floor((vals.length-1)*.01)],high=vals[Math.floor((vals.length-1)*.99)];
 return {low,high:Math.max(low+1,high)};
}
function renderRgb(bands){
 const source=[bands.red.values,bands.green.values,bands.blue.values];
 const ranges=source.map(stretch),pixels=new Uint8Array(source[0].length*3);
 let valid=0;
 for(let i=0;i<source[0].length;i++){
  if(source.some(channel=>!Number.isFinite(channel[i])||channel[i]<=0))continue;
  valid++;
  for(let ch=0;ch<3;ch++){
   const value=source[ch][i],{low,high}=ranges[ch];
   pixels[i*3+ch]=Math.round(255*Math.pow(Math.max(0,Math.min(1,(value-low)/(high-low))),.87));
  }
 }
 return {pixels,valid,ranges};
}
const previous=await readFile(reportPath,"utf8").then(JSON.parse).catch(()=>null);
const previousPng=await readFile(imagePath).catch(()=>null);
const pngMagic=Buffer.from([137,80,78,71,13,10,26,10]);
if(!args.includes("--refresh")&&previous?.status==="real-sentinel2-rgb"&&
 previous.startDate===startDate&&previous.endDate===endDate&&
 previous.maxCloudPercent===maxCloudPercent&&previousPng?.subarray(0,8).equals(pngMagic)){
 await writeFile(pagePath,html(previous));
 console.log("Reusing already verified real RGB tile: "+imagePath);
}else{
 try{
  console.log("Fetching real Sentinel-2 L2A scene over central Prague...",{startDate,endDate,maxCloudPercent});
  const scene=await fetchSentinel2RgbTile({area,startDate,endDate,maxCloudPercent});
  const {pixels,valid,ranges}=renderRgb(scene.bands);
  if(valid<100)throw Error("Fewer than 100 valid Prague RGB pixels");
  const report={
   status:"real-sentinel2-rgb",source:scene.provider,sceneId:scene.sceneId,
   acquiredAt:scene.acquiredAt,sceneCloudPercent:scene.sceneCloudPercent,
   startDate,endDate,maxCloudPercent,areaBbox:area.bbox,
   width:scene.grid.width,height:scene.grid.height,crs:scene.grid.crs,
   transform:scene.grid.transform,nativeResolutionM:scene.nativeResolutionM,
   validPixels:valid,totalPixels:scene.grid.width*scene.grid.height,
   bandAssets:scene.bandUrls,bandStatistics:scene.stats,visualContrastRanges:ranges,
   hasStereoCamera:false,hasHeightModel:false,elevationSource:"none",warnings:scene.warnings
  };
  await writeFile(imagePath,pngRgb(report.width,report.height,pixels));
  await writeFile(reportPath,JSON.stringify(report,null,2));
  await writeFile(pagePath,html(report));
  console.log(JSON.stringify({sceneId:report.sceneId,acquiredAt:report.acquiredAt,
    sceneCloudPercent:report.sceneCloudPercent,dimensions:[report.width,report.height],
    resolutionM:report.nativeResolutionM,validPixels:valid,hasHeightModel:false},null,2));
 }catch(e){
  await writeFile(pagePath,html(null,String(e)));
  console.error("Real Sentinel-2 Prague: "+String(e));
  console.error("Diagnostic viewer saved without making up imagery.");
  process.exitCode=1;
 }
}
console.log("Open: "+pagePath);
