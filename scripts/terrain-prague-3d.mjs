import {mkdir,readFile,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {bbox} from "../dist/geo/types.js";
import {OpenLaunch} from "../dist/index.js";

const args=process.argv.slice(2);
function option(name,defaultValue) {
  const i=args.indexOf("--"+name);
  if(i<0)return defaultValue;
  if(i+1>=args.length||args[i+1].startsWith("--"))throw new Error("Missing --"+name);
  return args[i+1];
}
function numeric(name,defaultValue) {
  const value=Number(option(name,String(defaultValue)));
  if(!Number.isFinite(value))throw new Error("Invalid --"+name);
  return value;
}
const at=args.indexOf("--bounds");
const coords=at>=0?args.slice(at+1,at+5).map(Number):[14.411,50.083,14.430,50.094];
if(coords.length!==4||coords.some(x=>!Number.isFinite(x)))throw new Error("Expected --bounds WEST SOUTH EAST NORTH");
const out=resolve(option("out","test-results/terrain-prague-3d"));
await mkdir(out,{recursive:true});
const safe=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
function objForTerrain(map) {
  const a=["# OpenLaunch real Copernicus DEM GLO-30 mesh; X=east Y=EGM2008 height Z=north, metres"];
  const p=map.mesh.positions,ids=new Uint32Array(p.length/3);
  let vertex=0;
  for(let i=0;i<ids.length;i++) {
    const x=p[3*i],y=p[3*i+1],z=p[3*i+2];
    if(![x,y,z].every(Number.isFinite))continue;
    ids[i]=++vertex;
    a.push("v "+x+" "+z+" "+y);
  }
  const faces=map.mesh.triangles;
  for(let i=0;i<faces.length;i+=3) {
    const v=[ids[faces[i]],ids[faces[i+1]],ids[faces[i+2]]];
    if(v.every(Boolean))a.push("f "+v.join(" "));
  }
  return a.join("\n")+"\n";
}
try {
  console.log("Downloading actual Sentinel-2 + Copernicus DEM GLO-30 for:",coords);
  const map=await new OpenLaunch().terrain.load({
    area:bbox(...coords),startDate:option("from","2025-06-01"),
    endDate:option("to","2025-09-30"),maxCloudPercent:numeric("max-cloud",35),
    resolutionM:numeric("resolution",30)
  });
  const {elevation,mesh,vertexRgb,rgbValid,metadata}=map;
  const report={
    status:"real-data",kind:map.kind,metadata,
    outputGrid:{width:elevation.width,height:elevation.height,crs:elevation.crs,
      transform:elevation.transform},
    mesh:{vertices:mesh.validVertices,triangles:mesh.triangles.length/3,
      localCoordinateAxes:"east/north/EGM2008 metres"},
    imageryPixelInterpretation:"actual Sentinel-2 RGB bands, stretched and sampled on DSM",
    modelInterpretation:"2.5D DSM, not building facade reconstruction"
  };
  const json={
    width:elevation.width,height:elevation.height,
    positions:Array.from(mesh.positions).map(x=>Number.isFinite(x)?x:null),
    triangles:Array.from(mesh.triangles),rgb:Array.from(vertexRgb),
    rgbValid:Array.from(rgbValid),report
  };
  const template=await readFile(new URL("./terrain-prague-viewer.html",import.meta.url),"utf8");
  const embedded=JSON.stringify(json).replaceAll("<","\\u003c")
    .replaceAll("\u2028","\\u2028").replaceAll("\u2029","\\u2029");
  await writeFile(join(out,"index.html"),template.replace("__MODEL_DATA__",embedded));
  await writeFile(join(out,"terrain.obj"),objForTerrain(map));
  await writeFile(join(out,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  console.log("Open: "+join(out,"index.html"));
} catch(error) {
  const reason=String(error);
  await writeFile(join(out,"report.json"),JSON.stringify({status:"error",reason},null,2));
  await writeFile(join(out,"index.html"),'<!doctype html><meta charset="utf-8"><title>Real 3D unavailable</title><body style="font:16px system-ui;background:#122334;color:white;padding:24px"><h1>Real 3D unavailable</h1><pre style="white-space:pre-wrap">'+safe(reason)+'</pre><p>No synthetic or fake terrain was substituted.</p></body>');
  console.error("Real 3D source error: "+reason);
  process.exitCode=1;
}
