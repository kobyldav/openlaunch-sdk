#!/usr/bin/env node
/**
 * Fedora validation orchestrator for the whole OpenLaunch SDK.
 * Runs independent checks and leaves a durable per-stage log and JSON report.
 * Live provider requests and optional OpenJPEG WASM are strictly opt-in.
 */
import {spawn,spawnSync} from "node:child_process";
import {readFile,readdir,mkdir,writeFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
process.chdir(root);
const args=new Set(process.argv.slice(2));
const help=args.has("--help")||args.has("-h");
const known=new Set(["--help","-h","--offline","--live","--wasm","--all",
 "--skip-install","--live-cookbook","--list"]);
const invalid=[...args].filter(x=>!known.has(x));
if(invalid.length){console.error("Unknown flags: "+invalid.join(", "));process.exit(2);}
if(help){
 console.log(`Fedora all-in-one SDK verification

 bash scripts/fedora-full-test.sh                   Offline: all tests + all offline examples
 bash scripts/fedora-full-test.sh --all              Offline + limited provider live probes + REAL OpenJPEG/WASM
 bash scripts/fedora-full-test.sh --live             Offline + controlled live API probes
 bash scripts/fedora-full-test.sh --wasm             Offline + optional real OpenJPEG/WASM tests
 bash scripts/fedora-full-test.sh --live-cookbook    Offline + all 65 network cookbook examples (rate-limit risk)
 bash scripts/fedora-full-test.sh --skip-install    Reuse current node_modules
 bash scripts/fedora-full-test.sh --list             List planned checks only

Every stage logs to test-results/fedora-<date>/; nothing is pushed/deployed.
The only automatic network needed for offline mode is npm ci package installation.`);
 process.exit(0);
}
const live=args.has("--live")||args.has("--all");
const wasm=args.has("--wasm")||args.has("--all");
const liveCookbook=args.has("--live-cookbook");
const skipInstall=args.has("--skip-install");
const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const logDir=join(root,"test-results","fedora-"+stamp);
const planned=[];
function add(group,label,command,params,timeoutMs=120000,env={}){
 planned.push({group,label,command,params,timeoutMs,env});
}
const npm=process.platform==="win32"?"npm.cmd":"npm";
function npmRun(label,script,group="build",timeout=180000){
 add(group,label,npm,["run",script],timeout);
}
function nodeRun(label,file,group="offline-demos",timeout=45000){
 add(group,label,process.execPath,[file],timeout);
}
function redact(value){
 let text=String(value??"");
 for(const [k,v] of Object.entries(process.env)){
   if(/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k)&&typeof v==="string"&&v.length>=8)
     text=text.split(v).join("[REDACTED]");
 }
 return text.replace(/([?&](?:token|sig|signature|key|api_key|client_secret)=)[^\s&#]+/gi,"$1[REDACTED]");
}
const details=(await readFile(join(root,"package.json"),"utf8"));
const pkg=JSON.parse(details);
const cmds=[...pkg.scripts.test.matchAll(/node\s+scripts\/([\w.-]+\.(?:mjs|cjs))/g)].map(m=>"scripts/"+m[1]);
const seen=new Set();
const demoScripts=cmds.filter(x=>!seen.has(x)&&seen.add(x));
const allTests=(await readdir(join(root,"tests"))).filter(x=>x.endsWith(".test.mjs")).sort().map(x=>"tests/"+x);
const nodeMajor=Number(process.versions.node.split(".")[0]);
const gitBranch=spawnSync("git",["branch","--show-current"],{cwd:root,encoding:"utf8"}).stdout?.trim()||"unknown";
const gitCommit=spawnSync("git",["rev-parse","--short","HEAD"],{cwd:root,encoding:"utf8"}).stdout?.trim()||"unknown";
console.log("OpenLaunch SDK",pkg.version,"— Fedora test suite");
console.log("Node",process.version,"| Git",gitBranch,"@",gitCommit);
console.log("Offline demo commands:",demoScripts.length,"| JS test files:",allTests.length);
console.log("Mode:",live||wasm||liveCookbook?"offline + opt-in checks":"offline; no live provider queries");
if(nodeMajor<18){
 console.error("FAIL: Node.js >=18 is required. Install Node 22 LTS for best compatibility.");
 process.exit(2);
}
if(!skipInstall)add("setup","npm ci: deterministic dependency install",npm,
 ["ci","--no-audit","--no-fund"],300000);
npmRun("TypeScript source typecheck","typecheck","static",90000);
npmRun("All TypeScript cookbook examples typecheck","examples:check","static",90000);
npmRun("Build ESM/CJS + seven workspaces","build","build",180000);
add("audit","Public API export/parity and example gap inventory",process.execPath,
 ["scripts/api-surface-audit.mjs","--output="+join(logDir,"api-surface")],120000);
add("unit","All SDK regression tests",process.execPath,
 [...(nodeMajor>=20?["--experimental-test-coverage"]:[]),"--test",...allTests],240000);
add("cookbook","Execute ALL catalogue-labelled offline TypeScript examples",process.execPath,
 ["scripts/verify-cookbook.mjs","--mode=offline","--output="+join(logDir,"cookbook")],180000);
for(const path of demoScripts)nodeRun(path,path,"offline-demos",90000);
npmRun("Seven workspace typecheck and package tests","test:packages","packaging",180000);
npmRun("Dry-run package structure for 7 workspaces","pack:check:packages","packaging",180000);
npmRun("Consumer installation smoke from packed tarballs","test:packed","packaging",180000);
add("packaging","Root package dry-run",npm,["pack","--dry-run","--ignore-scripts"],120000);
if(live){
 nodeRun("Live Launch Library + CelesTrak sample","scripts/live-smoke.mjs","live",90000);
 add("live","Live Copernicus / Planetary Computer / weather sample",
  process.execPath,["scripts/earth-live-smoke.mjs"],120000,{OPENLAUNCH_LIVE_STRICT:"1"});
 nodeRun("Live orbit/ISS traffic sample","scripts/orbit-traffic-demo.mjs","live",120000);
}
if(liveCookbook){
 add("live","Run all 60 network-labelled cookbook examples (may be rate limited)",
  process.execPath,["scripts/verify-cookbook.mjs","--mode=live",
  "--pause-ms=3000","--output="+join(logDir,"cookbook-live")],900000);
}
if(wasm&&nodeMajor>=20){
 // The WASM codec is never installed as a default runtime dependency.
 add("wasm","Install pinned optional OpenJPEG WASM test codec",npm,
  ["install","--no-save","--package-lock=false","--ignore-scripts",
   "--no-audit","--no-fund","@cornerstonejs/codec-openjpeg@1.3.6"],180000);
 nodeRun("REAL OpenJPEG original 3x2 JP2 pixels","scripts/jp2-openjpeg-real-smoke.mjs","wasm",120000);
 nodeRun("REAL OpenJPEG reduced 32x32 -> 8x8 JP2 pixels","scripts/jp2-reduced-real-smoke.mjs","wasm",120000);
}
if(args.has("--list")){
 for(let i=0;i<planned.length;i++)console.log(String(i+1).padStart(2)+"  "+
   planned[i].group.padEnd(14)+" "+planned[i].label);
 if(wasm&&nodeMajor<20)console.log("SKIP real OpenJPEG/WASM: Node 20+ required");
 process.exit(0);
}
await mkdir(logDir,{recursive:true});
const results=[];
async function execute(step,index){
 const start=Date.now();
 const safe=step.label.replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,80);
 const logfile=String(index+1).padStart(2,"0")+"-"+safe+".log";
 console.log("\n["+String(index+1)+"/"+planned.length+"] "+step.label);
 const run=await new Promise(done=>{
  const chunks=[];let bytes=0,timedOut=false,settled=false;
  const child=spawn(step.command,step.params,{
   cwd:root,env:{...process.env,...step.env},stdio:["ignore","pipe","pipe"]
  });
  const save=(d)=>{
   if(bytes<10*1024*1024){bytes+=d.length;chunks.push(d);}
  };
  child.stdout.on("data",save);child.stderr.on("data",save);
  const timer=setTimeout(()=>{timedOut=true;child.kill("SIGKILL");},step.timeoutMs);
  function end(exitCode){
   if(settled)return;
   settled=true;clearTimeout(timer);
   done({exitCode,timedOut,content:redact(Buffer.concat(chunks).toString("utf8"))});
  }
  child.on("error",e=>{save(Buffer.from(String(e)));end(-1);});
  child.on("close",code=>end(code??-1));
 });
 await writeFile(join(logDir,logfile),run.content);
 const status=run.exitCode===0&&!run.timedOut?"PASS":"FAIL";
 const result={status,group:step.group,label:step.label,
  durationMs:Date.now()-start,exitCode:run.exitCode,timedOut:run.timedOut,log:logfile};
 results.push(result);
 console.log(status+" ["+(result.durationMs/1000).toFixed(1)+"s] "+step.label);
 if(status==="FAIL"){
  const tail=run.content.trim().split("\n").slice(-8).join("\n");
  console.log("  "+tail.replace(/\n/g,"\n  ").slice(0,1200));
 }
 return status==="PASS";
}
let installOk=true,buildOk=true;
for(let i=0;i<planned.length;i++){
 const step=planned[i];
 if(!installOk&&step.group!=="setup"){
  results.push({status:"SKIP",group:step.group,label:step.label,reason:"npm ci failed"});
  console.log("SKIP "+step.label+" (npm ci failed)");
  continue;
 }
 // Build can fail yet static checks are useful. Binary tests cannot run without it.
 const requiresBuild=["audit","unit","cookbook","offline-demos","packaging","wasm","live"].includes(step.group);
 if(requiresBuild&&!buildOk){
  results.push({status:"SKIP",group:step.group,label:step.label,reason:"SDK build failed"});
  console.log("SKIP "+step.label+" (SDK build failed)");
  continue;
 }
 const ok=await execute(step,i);
 if(step.group==="setup"&&!ok)installOk=false;
 if(step.label==="Build ESM/CJS + seven workspaces"&&!ok)buildOk=false;
}
if(wasm&&nodeMajor<20){
 results.push({status:"SKIP",group:"wasm",label:"Real OpenJPEG/WASM",reason:"Node 20+ required"});
}
if(!live)results.push({status:"SKIP",group:"live",label:"Live provider probes",reason:"Use --live or --all"});
if(!wasm)results.push({status:"SKIP",group:"wasm",label:"Real OpenJPEG/WASM",reason:"Use --wasm or --all"});
if(!liveCookbook)results.push({status:"SKIP",group:"live",label:"All online TypeScript examples",
 reason:"Use --live-cookbook; up to 60 live examples may be rate limited"});
const summary={sdkVersion:pkg.version,node:process.version,gitBranch,gitCommit,
 startMode:{live,wasm,liveCookbook,skipInstall},
 totals:{pass:results.filter(x=>x.status==="PASS").length,
 fail:results.filter(x=>x.status==="FAIL").length,
 skip:results.filter(x=>x.status==="SKIP").length},
 results};
await writeFile(join(logDir,"summary.json"),JSON.stringify(summary,null,2)+"\n");
await writeFile(join(logDir,"summary.txt"),[
 "OpenLaunch Fedora verification",pkg.version,gitBranch+" "+gitCommit,
 "PASS: "+summary.totals.pass,"FAIL: "+summary.totals.fail,"SKIP: "+summary.totals.skip,
 ...results.map(x=>x.status.padEnd(4)+" "+x.label+" "+(x.log??x.reason??"")),
].join("\n")+"\n");
console.log("\n=== OPENLAUNCH FEDORA FULL REPORT ===");
console.log("PASS:",summary.totals.pass,"FAIL:",summary.totals.fail,"SKIP:",summary.totals.skip);
console.log("Logs:",logDir);
console.log("Summary:",join(logDir,"summary.txt"));
console.log("Full JSON:",join(logDir,"summary.json"));
if(summary.totals.fail)process.exitCode=1;
