import {mkdir,readFile,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {resolve,join} from "node:path";
// Honest two-method A/B on the SAME original images, RPCs, output grid,
// image-only height pilot and post-reconstruction S2P comparison DSM.
const args=process.argv.slice(2);
const opt=(name,fallback)=>{const i=args.indexOf("--"+name);return i<0?fallback:args[i+1];};
const dataset=opt("dataset","s2p-triplet"),out=resolve(opt("out","test-results/terrain-sgm"));
const size=Number(opt("size","48"));
if(!Number.isInteger(size)||size<16||size>256)throw Error("size must be 16..256");
if(!["s2p-triplet","s2p-pair"].includes(dataset))throw Error("Unknown dataset");
await mkdir(out,{recursive:true});
const halo=Number(opt("tile-halo","0"));
if(!Number.isInteger(halo)||halo<0||halo>32)throw Error("Invalid --tile-halo");
const rows=[];
const variants=halo>0&&size>64?["height-sweep","sgm","sgm-halo"]:["height-sweep","sgm"];
for(const matcher of variants){
  const dir=join(out,matcher);
  console.log("Comparing "+matcher+" on "+dataset);
  const r=spawnSync(process.execPath,["scripts/terrain-s2p-benchmark.mjs",
    "--dataset",dataset,"--size",String(size),"--matcher",matcher==="sgm-halo"?"sgm":matcher,"--tile-halo",String(matcher==="sgm-halo"?halo:0),"--out",dir,"--diagnostic-only"],{
    stdio:"inherit",timeout:600_000
  });
  const report=await readFile(join(dir,"report.json"),"utf8").then(JSON.parse).catch(()=>null);
  if(r.error||r.status!==0||!report?.reference||!Number.isFinite(report.reference.centeredRmseM))
    throw Error(matcher+" did not produce an independently checkable diagnostic: "+
      (r.error?.message??r.status));
  rows.push({matcher,coverage:report.coverage,
    centeredRmseM:report.reference.centeredRmseM,
    referenceMatched:report.reference.count,elapsedMs:report.elapsedMs,
    passedStrictComparison:report.referencePassed,
    reconstructedPoints:report.validPixels,totalPoints:report.totalPixels});
}
const [base,sgm]=rows;
const betterAccuracy=sgm.centeredRmseM<base.centeredRmseM;
const betterCoverage=sgm.coverage>base.coverage;
const comparison={dataset,size,tileHaloPixels:halo,reference:"Published S2P pipeline output, NOT independent ground truth",
  qualityGatesNotBypassed:true,comparisonOnly:true,betterAccuracy,betterCoverage,rows};
await writeFile(join(out,"comparison.json"),JSON.stringify(comparison,null,2));
const esc=v=>String(v).replaceAll("&","&amp;").replaceAll("<","&lt;");
await writeFile(join(out,"index.html"),
  '<!doctype html><meta charset="utf-8"><title>OpenLaunch SGM comparison</title>'+
  '<style>body{background:#101b28;color:#eef4fa;font:16px system-ui;margin:28px}th,td{text-align:left;padding:14px;border-bottom:1px solid #455}a{color:#8ac7ff}</style>'+
  '<h1>OpenLaunch | SGM vs height-sweep</h1>'+
  '<p>Both algorithms use identical calibrated real sensor imagery. S2P reference is opened only AFTER reconstruction. Centered RMSE does not measure absolute height accuracy.</p>'+
  '<table><tr><th>Method</th><th>Coverage</th><th>Centered RMSE</th><th>Time</th><th>Strict gate</th><th>3D</th></tr>'+
  rows.map(r=>'<tr><td>'+esc(r.matcher)+'</td><td>'+(r.coverage*100).toFixed(1)+'%</td><td>'+
  r.centeredRmseM.toFixed(2)+' m</td><td>'+(r.elapsedMs/1000).toFixed(1)+' s</td><td>'+
  (r.passedStrictComparison?"PASS":"FAIL")+'</td><td><a href="'+r.matcher+'/terrain.html">View</a></td></tr>').join("")+
  '</table><p><a href="comparison.json">Raw JSON comparison</a></p>');
console.table(rows);
console.log("A/B dashboard: "+join(out,"index.html"));
