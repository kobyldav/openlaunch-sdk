import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {inflateSync} from "node:zlib";

const out=resolve(process.argv[2]??"test-results/terrain-prague-3d");
const [index,obj,mtl,png,report]=await Promise.all([
  readFile(join(out,"index.html"),"utf8"),
  readFile(join(out,"terrain.obj"),"utf8"),
  readFile(join(out,"terrain.mtl"),"utf8"),
  readFile(join(out,"terrain-texture.png")),
  readFile(join(out,"report.json"),"utf8").then(JSON.parse)
]);
assert.equal(report.status,"real-data");
assert.ok(["satellite-rgb-on-copernicus-dsm","satellite-rgb-on-cuzk-dmpok"].includes(report.kind));
assert.ok(index.includes("texture2D(uTexture,vUv)"),"HTML must implement true texture sampling");
assert.ok(index.includes("terrain-texture.png"),"viewer must link to texture");
assert.ok(index.includes('id="measure"')&&index.includes("pickTerrain("),
  "viewer must support interactive georeferenced terrain picking");
assert.ok(index.includes('id="profile"')&&index.includes("gridAtMercator("),
  "viewer must support DEM-interpolated elevation profiles");
assert.ok(index.includes("download-profile")&&index.includes("download-geojson"),
  "viewer must provide CSV and GeoJSON profile exports");
assert.ok(report.inspectionDemo?.center?.elevationM>=report.metadata.heightMinM &&
  report.inspectionDemo.center.elevationM<=report.metadata.heightMaxM,
  "real DEM center height must lie within actual observed heights");
assert.equal(report.inspectionDemo?.eastWestProfile?.sampleCount,32);
assert.ok(report.inspectionDemo?.eastWestProfile?.validSamples>=24);
assert.match(obj,/^mtllib terrain.mtl$/m);
assert.match(obj,/^usemtl satellite_rgb$/m);
assert.match(mtl,/^map_Kd terrain-texture.png$/m);
const count=(text,prefix)=>text.split("\n").filter(x=>x.startsWith(prefix)).length;
assert.equal(count(obj,"v "),report.mesh.vertices,"OBJ position count");
assert.equal(count(obj,"vt "),report.mesh.vertices,"OBJ UV count");
assert.equal(count(obj,"f "),report.mesh.triangles,"OBJ textured triangle count");
assert.match(obj,/^f \d+\/\d+ \d+\/\d+ \d+\/\d+$/m);
assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a","PNG magic");
let cursor=8,seenIHDR=false,seenIEND=false,idat=[];
while(cursor<png.length){
  const length=png.readUInt32BE(cursor),start=cursor+8,end=start+length;
  assert.ok(end+4<=png.length,"complete PNG chunk");
  const type=png.toString("ascii",cursor+4,cursor+8);
  if(type==="IHDR"){
    seenIHDR=true;
    assert.equal(png.readUInt32BE(start),report.texture.width);
    assert.equal(png.readUInt32BE(start+4),report.texture.height);
    assert.equal(png[start+8],8,"PNG bit depth");
    assert.equal(png[start+9],6,"PNG RGBA colour type");
  }
  if(type==="IDAT")idat.push(png.subarray(start,end));
  if(type==="IEND")seenIEND=true;
  cursor=end+4;
}
assert.ok(seenIHDR&&seenIEND&&idat.length);
const raw=inflateSync(Buffer.concat(idat));
const {width,height,validPixels}=report.texture;
assert.equal(raw.length,height*(width*4+1));
let actual=0;
for(let y=0;y<height;y++) {
  const row=y*(width*4+1);
  assert.equal(raw[row],0,"PNG row is unfiltered RGBA");
  for(let x=0;x<width;x++)if(raw[row+1+x*4+3]===255)actual++;
}
assert.equal(actual,validPixels,"PNG RGB validity agrees with SDK report");
if(report.metadata.elevationProvider==="cuzk-dmpok"){
  assert.equal(report.kind,"satellite-rgb-on-cuzk-dmpok");
  assert.equal(report.metadata.verticalDatum,"Bpv (Baltic 1957)");
  assert.equal(report.metadata.demNativeResolutionM,0.5);
  assert.ok(report.metadata.groundResolutionM<=5);
  assert.ok(report.mesh.vertices>validPixels,"fine surface geometry resolves more cells than 10m RGB");
}else{
  assert.ok(validPixels>report.mesh.vertices,"legacy native RGB texture should preserve more pixels than coarse DEM");
}
console.log("PASS real terrain package: "+report.mesh.vertices+
  " vertices, "+report.mesh.triangles+" faces, "+width+"x"+height+
  " PNG, "+actual+" observed RGB pixels, OBJ UVs and MTL");
