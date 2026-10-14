import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo=fileURLToPath(new URL("../",import.meta.url));
const tmp=await mkdtemp(join(tmpdir(),"openlaunch-packed-"));
const names=["core","earth","raster","launches","orbit","math","engineering"];
const tests={
 earth:{symbol:"EarthCatalogClient",absent:["satellite.js","@openlaunch/orbit","@openlaunch/engineering"]},
 raster:{symbol:"readCogWindowUrl",absent:["satellite.js","@openlaunch/orbit","@openlaunch/engineering"]},
 launches:{symbol:"LaunchDataClient",absent:["satellite.js","@openlaunch/orbit","@openlaunch/engineering"]},
 orbit:{symbol:"Sgp4Satellite",absent:["@openlaunch/engineering"]},
 engineering:{symbol:"simulateLaunch",absent:[]},
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
  // Pack the already-installed upstream library locally for fully offline
  // orbit/engineering consumer tests. Scoped earth/raster/launches never
  // receive or install this tarball.
  const satellite=JSON.parse(npm(["pack","--json","--ignore-scripts",join(repo,"node_modules","satellite.js"),"--pack-destination",tmp],repo));
  const satelliteArchive=join(tmp,satellite[0].filename);
  for(const [name,test] of Object.entries(tests)){
    const consumer=join(tmp,"consumer-"+name);
    await mkdir(consumer);
    await writeFile(join(consumer,"package.json"),JSON.stringify({name:"consumer-"+name,private:true,type:"module"}));
    const installs=[archives.core];
    if(name==="orbit" || name==="engineering")installs.push(satelliteArchive,archives.orbit);
    if(name==="engineering")installs.push(archives.math);
    if(name!=="orbit")installs.push(archives[name]);
    npm(["install","--offline","--ignore-scripts","--no-audit","--no-fund","--package-lock=false",...installs],consumer);
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
    if((name==="orbit"||name==="engineering") && !namesInstalled.includes("satellite.js"))
      throw new Error(name+" consumer missing required orbit dependency satellite.js");
    console.log(`PASS isolated npm install @openlaunch/${name}: ESM/CJS loaded; installed=${namesInstalled.join(",")}`);
  }
}finally{
  await rm(tmp,{recursive:true,force:true});
}
