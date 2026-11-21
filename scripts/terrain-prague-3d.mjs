import {mkdir,readFile,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {deflateSync} from "node:zlib";
import {bbox} from "../dist/geo/types.js";
import {OpenLaunch,sampleRealTerrain,profileRealTerrain} from "../dist/index.js";

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
  const a=[
    "# OpenLaunch actual measured DSM mesh with native Sentinel-2 image texture",
    "# OBJ axes: X=east, Y=elevation above "+map.metadata.verticalDatum+", Z=north (metres)",
    "# Elevation source: "+map.metadata.demSource,
    "# Attribution: "+(map.metadata.demAttribution??map.metadata.demSource),
    "mtllib terrain.mtl",
    "o prague_real_terrain"
  ];
  const p=map.mesh.positions,ids=new Uint32Array(p.length/3);
  let vertex=0;
  const width=map.elevation.width,height=map.elevation.height;
  for(let i=0;i<ids.length;i++) {
    const x=p[3*i],north=p[3*i+1],elevation=p[3*i+2];
    if(![x,north,elevation].every(Number.isFinite))continue;
    ids[i]=++vertex;
    a.push("v "+x+" "+elevation+" "+north);
  }
  for(let i=0;i<ids.length;i++)if(ids[i]) {
    const row=Math.floor(i/width),col=i%width;
    // OBJ maps v=0 at the bottom; texture PNG row zero is north.
    a.push("vt "+((col+.5)/width)+" "+(1-(row+.5)/height));
  }
  a.push("usemtl satellite_rgb");
  const faces=map.mesh.triangles;
  for(let i=0;i<faces.length;i+=3) {
    const v=[ids[faces[i]],ids[faces[i+1]],ids[faces[i+2]]];
    if(v.every(Boolean))a.push("f "+v.map(n=>n+"/"+n).join(" "));
  }
  return a.join("\n")+"\n";
}

// Export real RGBA texture as an ordinary lossless PNG using Node's built-in zlib.
const crcTable=Uint32Array.from({length:256},(_,i)=>{
  let c=i;
  for(let k=0;k<8;k++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(buf) {
  let c=0xffffffff;
  for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function pngChunk(name,data) {
  const out=Buffer.alloc(12+data.length);
  out.writeUInt32BE(data.length,0);
  out.write(name,4,4,"ascii");
  data.copy(out,8);
  out.writeUInt32BE(crc32(out.subarray(4,8+data.length)),8+data.length);
  return out;
}
function rgbaPng(texture) {
  const {width,height,rgba}=texture;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    width>1024||height>1024||rgba.length!==width*height*4)throw Error("Invalid PNG texture dimensions");
  const raw=Buffer.alloc(height*(1+width*4));
  for(let row=0;row<height;row++) {
    const offset=row*(1+width*4);
    raw[offset]=0; // PNG filter None.
    raw.set(rgba.subarray(row*width*4,(row+1)*width*4),offset+1);
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
  ihdr[8]=8;ihdr[9]=6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR",ihdr),
    pngChunk("IDAT",deflateSync(raw,{level:6})),
    pngChunk("IEND",Buffer.alloc(0))
  ]);
}

try {
  const elevationProvider=option("dem","copernicus-glo30");
  console.log("Downloading real Sentinel-2 + "+elevationProvider+" for:",coords);
  const map=await new OpenLaunch().terrain.load({
    area:bbox(...coords),startDate:option("from","2025-06-01"),
    endDate:option("to","2025-09-30"),maxCloudPercent:numeric("max-cloud",35),
    resolutionM:numeric("resolution",elevationProvider==="cuzk-dmpok"?2:30),
    elevationProvider
  });
  const {elevation,mesh,vertexRgb,rgbValid,imageryTexture,metadata}=map;
  const [west,south,east,north]=coords;
  const centerSample=sampleRealTerrain(map,(west+east)/2,(south+north)/2);
  if(!centerSample)throw new Error("The loaded Prague DEM has no valid center elevation for measurement");
  const demoProfile=profileRealTerrain(map,
    [west+(east-west)*.2,(south+north)/2],
    [west+(east-west)*.8,(south+north)/2],
    {samples:32});
  if(demoProfile.validSamples<24)throw new Error("The loaded Prague DEM has gaps in the central measured profile");
  const report={
    status:"real-data",kind:map.kind,metadata,
    inspectionDemo:{
      center: centerSample,
      eastWestProfile:{
        sampleCount:demoProfile.samples.length,validSamples:demoProfile.validSamples,
        horizontalDistanceM:demoProfile.horizontalDistanceM,
        surfaceDistanceM:demoProfile.surfaceDistanceM,
        ascentM:demoProfile.ascentM,descentM:demoProfile.descentM,
        minElevationM:demoProfile.minElevationM,maxElevationM:demoProfile.maxElevationM,
        verticalDatum:demoProfile.verticalDatum
      }
    },
    outputGrid:{width:elevation.width,height:elevation.height,crs:elevation.crs,
      transform:elevation.transform},
    mesh:{vertices:mesh.validVertices,triangles:mesh.triangles.length/3,
      localCoordinateAxes:"east/north/"+metadata.verticalDatum+" metres"},
    texture:{width:imageryTexture.width,height:imageryTexture.height,
      groundResolutionM:imageryTexture.groundResolutionM,validPixels:imageryTexture.validPixels,
      asset:"terrain-texture.png",format:"8-bit RGBA PNG"},
    imageryPixelInterpretation:"native Sentinel-2 RGB texture independently aligned to the DSM",
    modelInterpretation:"2.5D "+metadata.demSource+", not building facade reconstruction"
  };
  const json={
    width:elevation.width,height:elevation.height,
    positions:Array.from(mesh.positions).map(x=>Number.isFinite(x)?x:null),
    triangles:Array.from(mesh.triangles),rgb:Array.from(vertexRgb),
    rgbValid:Array.from(rgbValid),
    texture:{width:imageryTexture.width,height:imageryTexture.height,rgba:Array.from(imageryTexture.rgba)},
    report
  };
  const template=await readFile(new URL("./terrain-prague-viewer.html",import.meta.url),"utf8");
  const embedded=JSON.stringify(json).replaceAll("<","\\u003c")
    .replaceAll("\u2028","\\u2028").replaceAll("\u2029","\\u2029");
  await writeFile(join(out,"index.html"),template.replace("__MODEL_DATA__",embedded));
  await writeFile(join(out,"terrain.obj"),objForTerrain(map));
  await writeFile(join(out,"terrain.mtl"),"newmtl satellite_rgb\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nd 1\nillum 1\nmap_Kd terrain-texture.png\n");
  await writeFile(join(out,"terrain-texture.png"),rgbaPng(imageryTexture));
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
