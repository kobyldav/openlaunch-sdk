import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp,readFile,writeFile,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
function run(script,args,env=process.env){
 return spawnSync(process.execPath,["scripts/"+script,...args],{cwd:root,encoding:"utf8",timeout:25000,maxBuffer:2*1024*1024,env});
}
test("Old Fedora diagnosis emits numeric failed count, not list of failed examples",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"openlaunch-live-diagnosis-"));
 try{
  await writeFile(join(dir,"summary-live.json"),JSON.stringify({
   results:[
    {path:"00-getting-started/01-next-launch.ts",status:"FAIL",log:"ll2.log",timedOut:true},
    {path:"17-raster/01-real-cog-window.ts",status:"FAIL",log:"raster.log",timedOut:false},
    {path:"03-celestrak/01-iss-by-catalog.ts",status:"PASS"}
   ]
  }));
  await writeFile(join(dir,"ll2.log"),"");
  await writeFile(join(dir,"raster.log"),"AssertionError: invalid pixels");
  const result=run("diagnose-live-results.mjs",["--dir="+dir],{...process.env,FORCE_COLOR:"1",NO_COLOR:undefined,NODE_DISABLE_COLORS:undefined});
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,/FAIL: 2(?:\n|$)/);
  assert.doesNotMatch(result.stdout,/\x1b\[[0-9;]*m/,"diagnostics must emit plain machine-readable counts even with FORCE_COLOR=1");
  assert.doesNotMatch(result.stdout,/FAIL: \[/);
  const output=JSON.parse(await readFile(join(dir,"diagnosis-live.json"),"utf8"));
  assert.equal(output.failed,2);
  assert.equal(output.failedCount,2);
  assert.equal(output.timeoutByHarness,1);
  assert.equal(output.failedExamples.length,2);
  assert.equal(output.causes.harness_deadline_exceeded,1);
  assert.equal(output.causes.sdk_or_example_exception,1);
  assert.ok(!("results" in output));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("Cookbook rejects unknown, non-catalog and cross-mode --only paths before network",()=>{
 for(const args of [
  ["--mode=live","--only=missing-example.ts"],
  ["--mode=offline","--only=00-getting-started/01-next-launch.ts"],
  ["--mode=live","--not-a-real-option"]
 ]){
  const runResult=run("verify-cookbook.mjs",args);
  assert.equal(runResult.status,2,runResult.stdout+"\n"+runResult.stderr);
 }
});
test("Only one known offline example executes and persists a complete report",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"openlaunch-selected-example-"));
 try{
  const path="20-provider-replay/05-layer-registry-contract.ts";
  const output=run("verify-cookbook.mjs",["--mode=offline","--only="+path,"--output="+dir]);
  assert.equal(output.status,0,output.stderr+"\n"+output.stdout);
  assert.match(output.stdout,/COOKBOOK: 1\/1 PASS/);
  const summary=JSON.parse(await readFile(join(dir,"summary-offline.json"),"utf8"));
  assert.equal(summary.run,1);
  assert.equal(summary.passed,1);
  assert.deepEqual(summary.results.map(x=>x.path),[path]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
