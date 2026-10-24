import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {join} from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
function run(args){
  return spawnSync(process.execPath,["scripts/fedora-suite.mjs",...args],
    {cwd:root,encoding:"utf8",timeout:10_000,maxBuffer:2*1024*1024});
}
test("Fedora one-command suite can list all planned offline coverage without installs",()=>{
 const result=run(["--list"]);
 assert.equal(result.status,0,result.stderr+"\n"+result.stdout);
 for(const phrase of [
  "All TypeScript cookbook examples typecheck",
  "Execute ALL catalogue-labelled offline TypeScript examples",
  "All SDK regression tests",
  "Seven workspace typecheck and package tests",
  "Dry-run package structure for 7 workspaces",
  "Consumer installation smoke from packed tarballs",
  "Root package dry-run",
  "offline; no live provider queries",
 ]){
  assert.ok(result.stdout.includes(phrase),"Missing Fedora stage: "+phrase);
 }
});
test("Fedora suite --all plans optional real OpenJPEG and bounded live checks",()=>{
 const result=run(["--list","--all","--skip-install"]);
 assert.equal(result.status,0,result.stderr);
 if(Number(process.versions.node.split(".")[0])>=20){
  assert.match(result.stdout,/REAL OpenJPEG original/);
  assert.match(result.stdout,/REAL OpenJPEG reduced/);
 }else{
  assert.match(result.stdout,/SKIP real OpenJPEG\/WASM: Node 20\+ required/);
 }
 assert.match(result.stdout,/Live Copernicus/);
 assert.doesNotMatch(result.stdout,/npm ci: deterministic dependency install/);
});
test("Fedora suite rejects unknown flags instead of performing an accidental install",()=>{
 const result=run(["--unsafe-random-option"]);
 assert.equal(result.status,2);
 assert.match(result.stderr,/Unknown flags/);
});
test("Fedora launcher is a Bash script with no forced installs or global destructive changes",async()=>{
 const source=await readFile(join(root,"scripts/fedora-full-test.sh"),"utf8");
 assert.ok(source.startsWith("#!/usr/bin/env bash"));
 assert.match(source,/exec node scripts\/fedora-suite\.mjs/);
 assert.doesNotMatch(source,/sudo |git reset --hard|rm -rf|curl .*\| *bash/);
 if(process.platform!=="win32"){
  const result=spawnSync("bash",["-n","scripts/fedora-full-test.sh"],
   {cwd:root,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
 }
});
