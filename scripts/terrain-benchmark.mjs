import {mkdir,readFile,writeFile,stat,copyFile,rm} from "node:fs/promises";
import {resolve,join,relative} from "node:path";
import {spawnSync} from "node:child_process";
import {makeTerrainBenchmarkScene,sceneIds} from "./terrain-benchmark-scenes.mjs";
import {reconstructTerrainFromSource,refineTerrainSurface,validateTerrainHeights,terrainPointCloudPly} from "../dist/terrain/index.js";
import {writeRealTerrainViewer} from "./terrain-real-viewer.mjs";
const args=process.argv.slice(2),outIndex=args.indexOf("--out"),root=resolve(outIndex<0?"test-results/terrain-benchmark":args[outIndex+1]);
if(outIndex>=0&&(!args[outIndex+1]||args[outIndex+1].startsWith("--")))throw Error("Missing --out directory");
const mode=args.includes("--offline")?"offline":args.includes("--real-only")?"real":"all";
const matcherIndex=args.indexOf("--matcher"),matcher=matcherIndex<0?"height-sweep":args[matcherIndex+1];
const pyramidIndex=args.indexOf("--sgm-pyramid-levels");
const sgmPyramidLevels=pyramidIndex<0?1:Number(args[pyramidIndex+1]);
if(!["height-sweep","sgm"].includes(matcher)||![1,2].includes(sgmPyramidLevels))
 throw Error("--matcher height-sweep|sgm and --sgm-pyramid-levels 1|2");
const requested=args.includes("--case")?args[args.indexOf("--case")+1]:null;
const manifests=args.flatMap((v,i)=>v==="--aerial-manifest"?[args[i+1]]:[]);
if(manifests.some(v=>!v||v.startsWith("--")))throw Error("Missing --aerial-manifest path");
if(requested&&!sceneIds.includes(requested)&&!["aster-baseline","aster-detail","aster-north","aster-east","s2p-pair","s2p-triplet","s2p-triplet-large","real-aerial"].includes(requested))throw Error("Unknown benchmark case");
await mkdir(root,{recursive:true});
const rows=[];
const escape=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const pct=v=>Number.isFinite(v)?(100*v).toFixed(1)+"%":"—";
const num=v=>Number.isFinite(v)?v.toFixed(2):"—";
function record(id,kind,report,status,note){
 rows.push({id,kind,status,coverage:report?.coverage??null,filteredCoverage:report?.filteredCoverage??null,rmseM:report?.validation?.rmseM??report?.reference?.centeredRmseM??null,metric:report?.validation?(report.synthetic?"synthetic absolute error":"supplied checkpoint absolute error"):report?.reference?(id.startsWith("s2p")?"centered S2P comparison (not ground truth)":"centered external HGT comparison"):null,elapsedMs:report?.elapsedMs??null,reference:report?.reference??null,report:report??null,note});
}
const allowed=id=>!requested||requested===id;
async function synthetic(id){
 const out=join(root,id);await mkdir(out,{recursive:true});
 const o=makeTerrainBenchmarkScene(id),{reference,resolutionM,...options}=o,started=Date.now();
 const result=reconstructTerrainFromSource({...options,matcher,sgmPyramidLevels,patchRadius:2,minCorrelation:.72,minPeakGap:.015,peakExclusionM:2,recoverMissing:matcher==="height-sweep",maxWork:250_000_000});
 const refined=refineTerrainSurface(result.elevationMap,{outlierM:3.2,fillRadius:1});
 const validation=validateTerrainHeights(result.elevationMap,reference);
 const core=reference.filter(p=>p.zone!=="land"),coreMatches=core.filter(p=>Number.isFinite(result.elevationMap.values[p.row*o.grid.width+p.col])).length;
 const values=Array.from(refined.grid.values).filter(Number.isFinite);
 const sorted=[...values].sort((a,b)=>a-b);
 const report={matcher,sgmPyramidLevels,sourceKind:"aerial",synthetic:true,source:"Synthetic "+id,scene:id,model:result.model,verticalDatum:result.verticalDatum,resolutionM,validPixels:result.validPixels,totalPixels:result.totalPixels,coverage:result.validPixels/result.totalPixels,filteredCoverage:values.length/result.totalPixels,rejected:refined.rejected,interpolated:refined.filled,recoveredPixels:result.recoveredPixels,heightRangeM:values.length?[sorted[0],sorted.at(-1)]:null,validation,coreMatches,coreTotal:core.length,elapsedMs:Date.now()-started};
 const thresholds={flat:[.85,1],hills:[.85,1.5],mountains:[.4,5],urban:[.4,5],industrial:[.5,4],forest:[.4,4],water:[.4,4],clouds:[.4,4]};
 let passed;
 if(id==="no-parallax")passed=result.validPixels===0;
 else if(id==="repetitive")passed=result.validPixels===0||(validation.rmseM!==null&&validation.rmseM<1);
 else {const [cov,err]=thresholds[id];passed=report.coverage>=cov&&validation.rmseM!==null&&validation.rmseM<=err&&(id!=="clouds"||coreMatches===0);}
 report.benchmarkPassed=passed;
 await writeFile(join(out,"report.json"),JSON.stringify(report,null,2));
 await writeFile(join(out,"point-cloud.ply"),terrainPointCloudPly(result));
 // Persist actual generated image inputs and truth independently for reproducibility.
 for(const im of o.source.images){
   const finite=Array.from(im.values).filter(Number.isFinite),lo=Math.min(...finite),hi=Math.max(...finite);
   const pixels=Uint8Array.from(im.values,v=>Number.isFinite(v)?Math.round(255*(v-lo)/Math.max(1e-9,hi-lo)):0);
   await writeFile(join(out,im.source+".pgm"),Buffer.concat([Buffer.from("P5\n"+im.width+" "+im.height+"\n255\n"),pixels]));
   const raw=Buffer.alloc(im.values.length*8);for(let i=0;i<im.values.length;i++)raw.writeDoubleLE(im.values[i],i*8);
   await writeFile(join(out,im.source+".f64le"),raw);
 }
 await writeFile(join(out,"input-calibration.json"),JSON.stringify({grid:o.grid,minHeightM:o.minHeightM,maxHeightM:o.maxHeightM,heightStepM:o.heightStepM,images:o.source.images.map(({values,...im})=>({...im,file:im.source+".f64le"}))},null,2));
 await writeFile(join(out,"reference-only.json"),JSON.stringify(reference));
 await writeRealTerrainViewer(out,{result,refined,report});
 record(id,"synthetic aerial",report,passed?"PASS":"FAIL",id==="no-parallax"?"Expected zero reconstruction without baseline":id==="repetitive"?"Periodic texture: reject ambiguity or recover correct height":core.length?"Masked / ambiguous core matched "+coreMatches+"/"+core.length:"Known synthetic surface; not real-flight accuracy");
}
async function child(id,kind,script,opts){
 const out=join(root,id);await mkdir(out,{recursive:true});
 // Remove stale report before starting so failure cannot reuse earlier results.
 await rm(join(out,"report.json"),{force:true});
 await rm(join(out,"terrain.html"),{force:true});
 const r=spawnSync(process.execPath,[script,"--out",out,...opts],{stdio:"inherit",timeout:300000});
 const report=await readFile(join(out,"report.json"),"utf8").then(JSON.parse).catch(()=>null);
 record(id,kind,report,r.status===0&&report?(kind.startsWith("real aerial")&&!report.validation?"UNVALIDATED":"PASS"):"FAIL",r.error?.message??(r.status===0?"Completed; see metric type":"Exit "+r.status+"; inspect logs"));
}
const cache=join(root,"cache");
if(mode!=="real")for(const id of sceneIds)if(allowed(id)){try{await synthetic(id);}catch(e){record(id,"synthetic aerial",null,"FAIL",String(e));}}
if(mode!=="offline"){
 await mkdir(cache,{recursive:true});
 for(const [id,opts] of [["aster-baseline",["--size","32"]],["aster-detail",["--size","64","--resolution","15"]],["aster-north",["--size","32","--lon","25.691194","--lat","23.942235"]],["aster-east",["--size","32","--lon","25.701194","--lat","23.932235"]]]){
   if(allowed(id))await child(id,"real ASTER satellite","scripts/terrain-real-demo.mjs",["--cache",cache,...opts]);
 }
 for(const id of ["s2p-pair","s2p-triplet","s2p-triplet-large"])if(allowed(id)){
   if(id==="s2p-triplet-large"&& !requested)continue; // optional costly benchmark
   await child(id,"real high-resolution satellite","scripts/terrain-s2p-benchmark.mjs",["--matcher",matcher,"--sgm-pyramid-levels",String(sgmPyramidLevels),"--dataset",id==="s2p-triplet-large"?"s2p-triplet":id,...(id==="s2p-triplet-large"?["--size","128"]:[])]);
 }
 if(allowed("real-aerial")){
  if(manifests.length){for(let i=0;i<manifests.length;i++)await child(i===0?"real-aerial":"real-aerial-"+(i+1),"real aerial (user supplied)","scripts/terrain-aerial-demo.mjs",["--matcher",matcher,"--sgm-pyramid-levels",String(sgmPyramidLevels),"--manifest",resolve(manifests[i])]);}
  else record("real-aerial","real aerial",null,"NOT RUN","Supply --aerial-manifest with calibrated images. ISPRS Avenches / Höngg not automatically ingested.");
 }
}
if(!rows.length)throw Error("No benchmark cases selected");
await writeFile(join(root,"summary.json"),JSON.stringify({mode,matcher,sgmPyramidLevels,cases:rows},null,2));
const table=["case,kind,status,coverage,filteredCoverage,rmseM,metric,elapsedMs,note",...rows.map(r=>[r.id,r.kind,r.status,r.coverage,r.filteredCoverage,r.rmseM,r.metric,r.elapsedMs,r.note].map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(","))];
await writeFile(join(root,"summary.csv"),table.join("\n")+"\n");
const trs=await Promise.all(rows.map(async r=>{const has=await stat(join(root,r.id,"terrain.html")).then(()=>true).catch(()=>false);return "<tr><td>"+escape(r.id)+"</td><td>"+escape(r.kind)+"</td><td class='"+r.status.toLowerCase().replaceAll(" ","-")+"'>"+r.status+"</td><td>"+pct(r.coverage)+"</td><td>"+pct(r.filteredCoverage)+"</td><td>"+num(r.rmseM)+"</td><td>"+escape(r.metric)+"</td><td>"+num(r.elapsedMs===null?null:r.elapsedMs/1000)+"</td><td>"+(has?'<a href="'+r.id+'/terrain.html">3D model</a> · ':'')+escape(r.note)+"</td></tr>";}));
await writeFile(join(root,"index.html"),'<!doctype html><meta charset="utf-8"><title>OpenLaunch terrain benchmark</title><style>body{background:#101a25;color:#e7edf3;font:15px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #334354}a{color:#84bfff}.pass{color:#73d8a9}.fail{color:#ff9a89}.not-run,.unvalidated{color:#e9c582}</style><h1>OpenLaunch | Terrain benchmark</h1><p>Real and synthetic scenes are separate. Coverage is not accuracy. Failed cases are shown, not silently replaced. A centered reference comparison is not absolute elevation accuracy.</p><p><a href="summary.json">JSON</a> · <a href="summary.csv">CSV</a></p><table><thead><tr><th>Case</th><th>Input</th><th>Result</th><th>Matched</th><th>Filtered</th><th>RMSE (m)</th><th>Metric</th><th>Seconds</th><th>Details</th></tr></thead><tbody>'+trs.join("")+'</tbody></table>');
console.table(rows.map(r=>({case:r.id,status:r.status,coverage:pct(r.coverage),rmse:num(r.rmseM),seconds:num(r.elapsedMs===null?null:r.elapsedMs/1000)})));
console.log("Benchmark dashboard: "+join(root,"index.html"));
if(rows.some(r=>r.status==="FAIL"))process.exitCode=1;
