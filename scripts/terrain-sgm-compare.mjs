import {mkdir,readFile,writeFile,rm,stat} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {resolve,join} from "node:path";

// A/B reconstruction and validation are separate. Network failures MUST NOT
// erase computed geometry or turn unverified reference data into "PASS".
const args=process.argv.slice(2);
const opt=(name,fallback)=>{
  const i=args.indexOf("--"+name);
  if(i<0)return fallback;
  if(!args[i+1]||args[i+1].startsWith("--"))throw Error("Missing --"+name);
  return args[i+1];
};
const dataset=opt("dataset","s2p-triplet"),out=resolve(opt("out","test-results/terrain-sgm"));
const size=Number(opt("size","48")),halo=Number(opt("tile-halo","0")),pyramid=Number(opt("sgm-pyramid-levels","1"));
if(!Number.isInteger(size)||size<16||size>256)throw Error("size must be 16..256");
if(!["s2p-triplet","s2p-pair"].includes(dataset))throw Error("Unknown dataset");
if(!Number.isInteger(halo)||halo<0||halo>32)throw Error("Invalid --tile-halo");
if(![1,2].includes(pyramid))throw Error("--sgm-pyramid-levels 1|2");
await mkdir(out,{recursive:true});
const cache=join(out,"s2p-cache");
const variants=["height-sweep","sgm",...(halo>0&&size>64?["sgm-halo"]:[]),...(pyramid===2?["sgm-pyramid"]:[])];
const rows=[],surfaces=new Map();
let commonSupportCount=null,comparisonComplete=false,betterAccuracy=null,betterCoverage=null;
const esc=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const num=(v,decimals=2)=>Number.isFinite(v)?Number(v).toFixed(decimals):"—";

async function writeDashboard(){
 const entries=await Promise.all(rows.map(async r=>{
   const hasModel=await stat(join(out,r.matcher,"terrain.html")).then(()=>true).catch(()=>false);
   const link=hasModel?'<a href="'+encodeURIComponent(r.matcher)+'/terrain.html">Open 3D model</a>':"—";
   return '<tr><td>'+esc(r.matcher)+'</td><td>'+esc(r.status)+'</td><td>'+
     (Number.isFinite(r.coverage)?num(r.coverage*100,1)+"%":"—")+'</td><td>'+
     num(r.centeredRmseM)+' m</td><td>'+num(r.commonSupportCenteredRmseM)+' m</td><td>'+
     num((r.elapsedMs??NaN)/1000,1)+' s</td><td>'+
     (r.passedStrictComparison===null?"NOT CHECKED":r.passedStrictComparison?"PASS":"FAIL")+
     '</td><td>'+link+'</td><td>'+esc(r.reason??"")+'</td></tr>';
 }));
 const note=comparisonComplete?
   'All variants have a reference and their RMSE is compared on identical measured pixels.':
   'Incomplete / unverified diagnostic: a missing reference or unfinished variant prevents an honest A/B accuracy comparison.';
 const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>OpenLaunch SGM comparison</title>'+
   '<style>body{background:#101b28;color:#eef4fa;font:15px system-ui;margin:28px}'+
   'th,td{text-align:left;padding:12px;border-bottom:1px solid #455;vertical-align:top}a{color:#8ac7ff}'+
   'table{border-collapse:collapse;width:100%}</style>'+
   '<h1>OpenLaunch | SGM terrain A/B</h1><p>'+esc(note)+'</p>'+
   '<p>Source: calibrated real satellite imagery. Reference: published S2P algorithm output, NOT independent ground truth. '+
   'A completed geometric reconstruction can be viewed even if the external reference download failed.</p>'+
   '<p>Rows completed: '+rows.length+' / '+variants.length+
   ' | common measured pixels: '+(commonSupportCount??"not available")+'</p>'+
   '<table><tr><th>Method</th><th>Status</th><th>Measured coverage</th><th>Centered RMSE</th>'+
   '<th>RMSE on common measured points</th><th>Compute time</th><th>Strict gate</th><th>3D</th><th>Issue</th></tr>'+
   entries.join("")+'</table><p><a href="comparison.json">Download details in JSON</a></p></html>';
 await writeFile(join(out,"index.html"),html);
 await writeFile(join(out,"comparison.json"),JSON.stringify({
   dataset,size,tileHaloPixels:halo,sgmPyramidLevels:pyramid,
   variants,reference:"Published S2P pipeline output, NOT independent ground truth",
   qualityGatesNotBypassed:true,comparisonOnly:true,comparisonComplete,
   commonSupportCount,betterAccuracy,betterCoverage,rows
 },null,2));
}
await writeDashboard(); // The page exists even if the first remote fetch fails.
let previousReferenceDownloadFailed=false;
for(const matcher of variants){
  const dir=join(out,matcher);
  await mkdir(dir,{recursive:true});
  // Never show stale validation or geometry from a previous run as fresh output.
  for(const name of ["report.json","heights-vs-s2p.csv","terrain.html"])
    await rm(join(dir,name),{force:true});
  console.log("Comparing "+matcher+" on "+dataset);
  const argv=["scripts/terrain-s2p-benchmark.mjs",
    "--dataset",dataset,"--size",String(size),
    "--matcher",matcher==="height-sweep"?"height-sweep":"sgm",
    "--tile-halo",String(matcher==="sgm-halo"?halo:0),
    "--sgm-pyramid-levels",String(matcher==="sgm-pyramid"?2:1),
    "--cache-dir",cache,"--out",dir,"--diagnostic-only",
    ...(previousReferenceDownloadFailed?["--skip-reference-download"]:[])
  ];
  const run=spawnSync(process.execPath,argv,{stdio:"inherit",timeout:600_000});
  const report=await readFile(join(dir,"report.json"),"utf8").then(JSON.parse).catch(()=>null);
  const validReference=Number.isFinite(report?.reference?.centeredRmseM);
  if(!validReference&&String(report?.referenceError??"").match(/S2P asset|TimeoutError|fetch failed|Reference check deliberately skipped/i))
    previousReferenceDownloadFailed=true;
  let pixels=null,parsingError=null;
  if(validReference&&run.status===0&&!run.error){
    try{
      const compared=await readFile(join(dir,"heights-vs-s2p.csv"),"utf8");
      pixels=compared.trim().split("\n").slice(1).map(line=>{
        const [idx,measured,refined,reference]=line.split(",");
        return {idx:Number(idx),height:measured===""?NaN:Number(measured),
          refinedHeight:refined===""?NaN:Number(refined),
          reference:reference===""?NaN:Number(reference)};
      });
      if(pixels.length!==report.totalPixels||pixels.some((p,i)=>p.idx!==i))
        throw Error("Per-pixel reference geometry differs");
      surfaces.set(matcher,pixels);
    }catch(error){parsingError=String(error);pixels=null;}
  }
  const reason=run.error?.message??(run.status!==0?"Benchmark child exited "+run.status:null)??
    parsingError??report?.referenceError??(!report?"No result report":"");
  const status=!report||run.status!==0||run.error||parsingError?"ERROR":
    !validReference?"REFERENCE UNAVAILABLE":report.referencePassed?"PASS":"FAIL";
  rows.push({
    matcher,status,reason,coverage:report?.coverage??null,
    centeredRmseM:validReference?report.reference.centeredRmseM:null,
    referenceMatched:validReference?report.reference.count:null,
    elapsedMs:report?.elapsedMs??null,
    passedStrictComparison:validReference?!!report.referencePassed:null,
    reconstructedPoints:report?.validPixels??null,totalPoints:report?.totalPixels??null,
    commonSupportCount:null,commonSupportCenteredRmseM:null,
    commonSupportMeanDifferenceM:null
  });
  await writeDashboard();
}
if(rows.length===variants.length&&surfaces.size===variants.length){
  const first=surfaces.get(variants[0]);
  const common=first.flatMap((_,i)=>
    variants.every(v=>Number.isFinite(surfaces.get(v)[i].height)&&
       Number.isFinite(surfaces.get(v)[i].reference))?[i]:[]);
  if(common.length>=10){
    commonSupportCount=common.length;comparisonComplete=true;
    for(const row of rows){
      const surface=surfaces.get(row.matcher);
      const errors=common.map(i=>surface[i].height-surface[i].reference);
      const mean=errors.reduce((a,b)=>a+b,0)/errors.length;
      row.commonSupportCount=errors.length;
      row.commonSupportMeanDifferenceM=mean;
      row.commonSupportCenteredRmseM=Math.sqrt(
        errors.reduce((sum,e)=>sum+(e-mean)**2,0)/errors.length);
    }
    betterAccuracy=rows[1].commonSupportCenteredRmseM<rows[0].commonSupportCenteredRmseM;
    betterCoverage=rows[1].coverage>rows[0].coverage;
  }
}
await writeDashboard();
console.table(rows.map(r=>({
  matcher:r.matcher,status:r.status,
  coverage: Number.isFinite(r.coverage)?(r.coverage*100).toFixed(1)+"%":"—",
  centeredRmseM:r.centeredRmseM??"—",
  commonSupportCenteredRmseM:r.commonSupportCenteredRmseM??"—"
})));
console.log("A/B dashboard: "+join(out,"index.html"));
if(!comparisonComplete){
  console.error("Reference comparison INCOMPLETE. Models and dashboard are retained; no quality PASS is inferred.");
  process.exitCode=1;
}
