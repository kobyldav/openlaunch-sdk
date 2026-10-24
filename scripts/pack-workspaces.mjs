import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const workspaces=["core","earth","raster","launches","orbit","math","engineering"];
let failed=false;
for(const name of workspaces){
  const pkg=JSON.parse(await readFile(new URL("../packages/"+name+"/package.json",import.meta.url),"utf8"));
  const p=spawnSync("npm",["pack","--dry-run","--json","--ignore-scripts","--workspace",pkg.name],{
    cwd:new URL("../",import.meta.url),encoding:"utf8",maxBuffer:4*1024*1024,
    shell:process.platform==="win32",
  });
  if(p.status!==0)throw new Error(pkg.name+" npm pack failed:\n"+p.stdout+"\n"+p.stderr);
  let item;
  try{item=JSON.parse(p.stdout)[0]}catch{throw new Error("Invalid npm pack --json output for "+pkg.name+": "+p.stdout);}
  const filenames=item.files.map(f=>f.path);
  if(item.name!==pkg.name||item.version!=="1.9.0"||!filenames.includes("dist/esm/index.js")||
     !filenames.includes("dist/cjs/index.js")||!filenames.includes("dist/types/index.d.ts")||
     filenames.some(f=>f.includes("node_modules/")||f.startsWith("src/"))){
    failed=true;
    console.error("Invalid packed structure",pkg.name,filenames.slice(0,30));
  }
  console.log(pkg.name,item.size+" compressed tarball bytes",item.unpackedSize+" unpacked bytes",filenames.length+" files");
}
if(failed)process.exitCode=1;
