import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo=fileURLToPath(new URL("../",import.meta.url));
const tmp=await mkdtemp(join(tmpdir(),"openlaunch-packed-"));
const names=["core","earth","raster","launches"];
const tests={
 earth:{symbol:"EarthCatalogClient",absent:["satellite.js","@openlaunch/orbit","@openlaunch/engineering"]},
 raster:{symbol:"readCogWindowUrl",absent:["satellite.js","@openlaunch/orbit","@openlaunch/engineering"]},
 launches:{symbol:"LaunchDataClient",absent:["satellite.js","@openlaunch/orbit","@openlaunch/engineering"]},
};
function npm(args,cwd){
  const p=spawnSync("npm",args,{
    cwd,encoding:"utf8",maxBuffer:4*1024*1024,
    shell:process.platform==="win32",
  });
  if(p.status!==0)throw new Error("npm "+args.join(" ")+" failed:\n"+p.stdout+"\n"+p.stderr);
  return p.stdout;
}
try{
  const archives={};
  for(const name of names){
    const result=JSON.parse(npm(["pack","--json","--ignore-scripts","--workspace","@openlaunch/"+name,"--pack-destination",tmp],repo));
    archives[name]=join(tmp,result[0].filename);
  }
  for(const [name,test] of Object.entries(tests)){
    const consumer=join(tmp,"consumer-"+name);
    await mkdir(consumer);
    await writeFile(join(consumer,"package.json"),JSON.stringify({name:"consumer-"+name,private:true,type:"module"}));
    npm(["install","--offline","--ignore-scripts","--no-audit","--no-fund","--package-lock=false",archives.core,archives[name]],consumer);
    const code=`import { ${test.symbol} } from "@openlaunch/${name}"; if(typeof ${test.symbol}!=="function")throw new Error("Missing export");`;
    const run=spawnSync(process.execPath,["--input-type=module","-e",code],{cwd:consumer,encoding:"utf8"});
    if(run.status!==0)throw new Error("Independent ESM install failed for "+name+": "+run.stderr);
    const cjs=`if(typeof require("@openlaunch/${name}").${test.symbol}!=="function")throw new Error("Missing CJS export");`;
    const runCjs=spawnSync(process.execPath,["-e",cjs],{cwd:consumer,encoding:"utf8"});
    if(runCjs.status!==0)throw new Error("Independent CJS install failed for "+name+": "+runCjs.stderr);
    const ls=JSON.parse(npm(["ls","--all","--json","--omit=dev"],consumer));
    const namesInstalled=Object.keys(ls.dependencies??{});
    for(const bad of test.absent)if(namesInstalled.includes(bad))throw new Error(name+" consumer unexpectedly installed "+bad);
    if(namesInstalled.includes("openlaunch-sdk"))throw new Error(name+" consumer requires monolithic openlaunch-sdk");
    console.log(`PASS isolated npm install @openlaunch/${name}: ESM/CJS loaded; installed=${namesInstalled.join(",")}`);
  }
}finally{
  await rm(tmp,{recursive:true,force:true});
}
