#!/usr/bin/env node
/** Diagnose existing Fedora live logs WITHOUT making any network requests. */
import {readFile,writeFile} from "node:fs/promises";
import {resolve,join,sep} from "node:path";
import {aggregateDiagnosis,classifyFailure} from "./live-diagnostics.mjs";
const args=process.argv.slice(2);
if(args.length!==1||!args[0].startsWith("--dir=")||args[0].slice(6).length===0){
 console.error("Usage: node scripts/diagnose-live-results.mjs --dir=test-results/live-manual");
 process.exit(2);
}
const dir=resolve(args[0].slice(6));
let report,kind;
for(const name of ["summary-live.json","progress-live.json"]){
 try{report=JSON.parse(await readFile(join(dir,name),"utf8"));kind=name;break;}
 catch(err){if(err.code!=="ENOENT")throw err;}
}
if(!report||!Array.isArray(report.results)){
 console.error("No valid summary-live.json or progress-live.json in directory:",dir);
 process.exit(2);
}
const entries=[];
for(const item of report.results){
 if(!item||!["FAIL","PASS","SKIP"].includes(item.status))continue;
 const path=String(item.path??"");
 let log="";
 if(item.status==="FAIL"&&typeof item.log==="string"){
  const p=resolve(dir,item.log);
  // Never permit a hostile report entry to load an arbitrary file.
  if(!p.startsWith(dir+sep))throw Error("Report log path escapes the selected directory");
  try{log=await readFile(p,"utf8");}
  catch(err){if(err.code!=="ENOENT")throw err;}
 }
 entries.push({...item,path,
  diagnosis:item.status==="FAIL"?classifyFailure({path,log,timedOut:item.timedOut===true}):null});
}
const summary=aggregateDiagnosis(entries);
const {failed:failedExamples,...aggregates}=summary;
const timeoutByHarness=entries.filter(x=>x.status==="FAIL"&&x.timedOut===true).length;
const output={
 source:kind,
 status:report.status??"finished_or_legacy",
 completed:entries.length,
 passed:entries.filter(x=>x.status==="PASS").length,
 ...aggregates,
 failed:summary.failedCount,
 failedExamples,
 timeoutByHarness,
 notes:[
 "A signature is not proof of the upstream root cause.",
 "harness_deadline_exceeded confirms only the cookbook process was killed, not the upstream reason for stalling.",
 "403 may be an expired quota, missing key, or permissions: review the individual log.",
 "No keys, request URLs, or provider response bodies are included."
 ]
};
await writeFile(join(dir,"diagnosis-live.json"),JSON.stringify(output,null,2)+"\n");
console.log("LIVE DIAGNOSIS, no network requests");
console.log("Analyzed:",output.completed,"PASS:",output.passed,"FAIL:",output.failed);
console.log("Terminated by cookbook deadline:",output.timeoutByHarness);
for(const [category,total] of Object.entries(summary.causes))
 console.log("  "+category+": "+total);
console.log("Providers:",JSON.stringify(Object.fromEntries(Object.entries(summary.providers).map(([k,v])=>[k,v.failed]))));
console.log("Saved:",join(dir,"diagnosis-live.json"));
if(output.failed)process.exitCode=1;
