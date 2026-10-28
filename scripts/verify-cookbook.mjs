#!/usr/bin/env node
/**
 * Reproducible OpenLaunch example catalogue runner.
 *
 * Runs every offline TypeScript example as real ESM JavaScript using the
 * repository's already-installed TypeScript compiler. No tsx, npx, or
 * dynamic package install is required. Network-labelled examples are
 * *never* executed in offline mode.
 *
 * CLI: node scripts/verify-cookbook.mjs --mode=offline [--output=...]
 *      node scripts/verify-cookbook.mjs --mode=live [--output=...]
 *      node scripts/verify-cookbook.mjs --mode=list
 */
import {readFile,readdir,mkdir,mkdtemp,writeFile,rename,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,dirname,resolve,relative,sep} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {spawn} from "node:child_process";
import ts from "typescript";

const root=fileURLToPath(new URL("../",import.meta.url));
const args=process.argv.slice(2);
const getOpt=(prefix)=>args.find(a=>a.startsWith(prefix))?.slice(prefix.length);
const mode=getOpt("--mode=")??"offline";
const output=getOpt("--output=");
const timeoutMs=Number(getOpt("--timeout-ms=")??(mode==="live"?"30000":"15000"));
const pauseMs=Number(getOpt("--pause-ms=")??(mode==="live"?"3000":"0"));
if(!["offline","live","list"].includes(mode)||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||
 timeoutMs>120000||!Number.isSafeInteger(pauseMs)||pauseMs<0||pauseMs>30000){
 console.error("Usage: --mode=offline|live|list [--timeout-ms=15000] [--pause-ms=3000] [--output=directory]");
 process.exit(2);
}
// Log output may be shared for debugging. Redact provider secrets before saving.
function redactLog(value){
 let result=String(value??"");
 for(const [key,secret] of Object.entries(process.env)){
  if(/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(key) &&
     typeof secret==="string" && secret.length>=8)
    result=result.split(secret).join("[REDACTED]");
 }
 return result.replace(/([?&](?:api_key|token|sig|signature|key|client_secret|access_token)=)[^\s&#]+/gi,
   "$1[REDACTED]").replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi,"$1[REDACTED]");
}
const catalog=JSON.parse(await readFile(join(root,"examples/catalog.json"),"utf8"));
if(!Array.isArray(catalog.examples))throw new Error("Invalid examples/catalog.json");
const paths=new Set(),seen=new Set();
async function collect(dir){
 for(const ent of await readdir(dir,{withFileTypes:true})){
  const p=join(dir,ent.name);
  if(ent.isDirectory())await collect(p);
  else if(ent.isFile()&&p.endsWith(".ts"))
   paths.add(relative(join(root,"examples"),p).split(sep).join("/"));
 }
}
await collect(join(root,"examples"));
for(const item of catalog.examples){
 if(typeof item.path!=="string"||typeof item.network!=="boolean"||
   seen.has(item.path)||!paths.has(item.path))
  throw new Error("Catalog contains duplicate/missing/malformed example: "+item.path);
 seen.add(item.path);
}
const uncovered=[...paths].filter(p=>!seen.has(p));
if(uncovered.length)throw new Error("Uncatalogued TypeScript examples: "+uncovered.join(", "));
const offline=catalog.examples.filter(x=>!x.network);
const live=catalog.examples.filter(x=>x.network);
console.log("OpenLaunch cookbook coverage: "+catalog.examples.length+
  " typed examples, "+offline.length+" offline, "+live.length+" online");
if(mode==="list"){
 const counts={};
 for(const item of catalog.examples){
  counts[item.category]??={offline:0,live:0};
  counts[item.category][item.network?"live":"offline"]++;
 }
 console.table(counts);
 process.exit(0);
}
const selected=mode==="offline"?offline:live;
const temp=await mkdtemp(join(tmpdir(),"openlaunch-cookbook-"));
const examples=join(root,"examples"),tempExamples=join(temp,"examples");
const reportDir=output?resolve(output):join(root,"test-results","cookbook");
await mkdir(reportDir,{recursive:true});
function mappedImport(spec,original){
 if(!spec.startsWith("."))return spec;
 const target=resolve(dirname(original),spec);
 const sourcePrefix=join(root,"src")+sep;
 const examplesPrefix=examples+sep;
 if(target.startsWith(sourcePrefix)){
  // SDK examples import ../../src/*.js: tested against the actual compiled SDK.
  const out=join(root,"dist",relative(join(root,"src"),target));
  const js=out.endsWith(".js")?out:out+".js";
  return pathToFileURL(js).href;
 }
 if(target.startsWith(examplesPrefix)){
  const inside=relative(examples,target).replace(/\.(?:js|ts)$/,".mjs");
  return pathToFileURL(join(tempExamples,inside)).href;
 }
 throw new Error("Untrusted relative import in "+relative(root,original)+": "+spec);
}
try{
 // Transpile all local helpers, including network-labelled ones, without executing them.
 // Type checking of EVERY example happens separately in npm run examples:check.
 for(const rel of [...paths].sort()){
  const original=join(examples,rel);
  const code=await readFile(original,"utf8");
  const transpiled=ts.transpileModule(code,{
   fileName:original,
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
   reportDiagnostics:true
  });
  const errors=(transpiled.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length)throw new Error(rel+": "+errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")).join("; "));
  // ESM imports are rewritten only at import/export syntax, not in strings/comments.
  const transformed=transpiled.outputText.replace(
   /((?:\bfrom\s*|\bimport\s*\(|\bimport\s*))(["'])([^"']+)\2/g,
   (match,prefix,q,spec)=>prefix+q+mappedImport(spec,original)+q
  );
  const dest=join(tempExamples,rel.replace(/\.ts$/,".mjs"));
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,transformed);
 }
 const wrapper=join(temp,"entry.mjs");
 const summaries=[];
 const progressFile=join(reportDir,"progress-"+mode+".json");
 let current=null;
 async function saveProgress(status){
  const snapshot={mode,status,updatedAt:new Date().toISOString(),
   total:selected.length,completed:summaries.length,
   passed:summaries.filter(x=>x.status==="PASS").length,
   failed:summaries.filter(x=>x.status==="FAIL").length,
   current,results:summaries};
  await writeFile(progressFile+".tmp",JSON.stringify(snapshot,null,2)+"\n");
  await rename(progressFile+".tmp",progressFile);
 }
 await saveProgress("running");
 const env={...process.env,OPENLAUNCH_EXAMPLE_RUN_MODE:mode};
 for(let i=0;i<selected.length;i++){
  const example=selected[i];
  const entry=pathToFileURL(join(tempExamples,example.path.replace(/\.ts$/,".mjs"))).href;
  await writeFile(wrapper,
    (mode==="offline"?`globalThis.fetch=()=>{throw new Error("Offline example attempted network access");};\n`:"")+
    `await import(${JSON.stringify(entry)});\n`);
  current=example.path;
  await saveProgress("running");
  console.log("["+String(i+1).padStart(3)+"/"+selected.length+"] RUN "+example.path);
  const start=Date.now();
  const run=await new Promise((done)=>{
   const child=spawn(process.execPath,[wrapper],{cwd:root,env,stdio:["ignore","pipe","pipe"]});
   const chunks=[];let timedOut=false,finished=false,bytes=0;
   const push=d=>{if(bytes<2*1024*1024){chunks.push(d);bytes+=d.length;}};
   child.stdout.on("data",push);child.stderr.on("data",push);
   const timer=setTimeout(()=>{timedOut=true;child.kill("SIGKILL");},timeoutMs);
   child.on("error",e=>{push(Buffer.from(String(e)));if(!finished){finished=true;clearTimeout(timer);done({exitCode:-1,timedOut,log:Buffer.concat(chunks).toString("utf8")});}});
   child.on("close",code=>{if(!finished){finished=true;clearTimeout(timer);done({exitCode:code??-1,timedOut,log:Buffer.concat(chunks).toString("utf8")});}});
  });
  const ok=run.exitCode===0&&!run.timedOut;
  const logName=example.path.replace(/[^a-zA-Z0-9._/-]/g,"_").replace(/\//g,"__").replace(/\.ts$/,".log");
  await writeFile(join(reportDir,logName),redactLog(run.log));
  summaries.push({path:example.path,category:example.category,network:example.network,
    status:ok?"PASS":"FAIL",durationMs:Date.now()-start,log:logName,
    exitCode:run.exitCode,timedOut:run.timedOut});
  current=null;
  await saveProgress("running");
  console.log("["+String(i+1).padStart(3)+"/"+selected.length+"] "+
    (ok?"PASS":"FAIL")+" "+example.path);
  if(mode==="live"&&pauseMs&&i+1<selected.length)
   await new Promise(r=>setTimeout(r,pauseMs));
 }
 const total=summaries.length,passed=summaries.filter(x=>x.status==="PASS").length;
 const report={mode,catalogTotal:catalog.examples.length,offlineTotal:offline.length,
  liveTotal:live.length,run:total,passed,failed:total-passed,
  results:summaries};
 await writeFile(join(reportDir,"summary-"+mode+".json"),JSON.stringify(report,null,2)+"\n");
 await saveProgress("finished");
 console.log("COOKBOOK: "+passed+"/"+total+" PASS; "+(total-passed)+" FAIL. Logs: "+reportDir);
 if(passed!==total)process.exitCode=1;
}finally{
 await rm(temp,{recursive:true,force:true});
}
