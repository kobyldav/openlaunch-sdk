/** End-to-end live local HTTP tile test: actual ČÚZK height & image sources. */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {decodeCuzkOrthoPng} from "../dist/index.js";

const cache=resolve("test-results/terrain-prague-stream-ci");
await mkdir(cache,{recursive:true});
const child=spawn(process.execPath,[
  fileURLToPath(new URL("./terrain-prague-stream.mjs",import.meta.url)),
  "--port","0","--no-open","--cache",cache
],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
let consoleText="",stderr="";
child.stderr.on("data",c=>stderr+=c.toString());
try{
  const origin=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error("Tile server failed to start: "+stderr)),20000);
    const onData=chunk=>{
      consoleText+=chunk.toString();
      const match=consoleText.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if(match){clearTimeout(timeout);child.stdout.off("data",onData);
        resolve("http://127.0.0.1:"+match[1]);}
    };
    child.stdout.on("data",onData);
    child.once("error",err=>{clearTimeout(timeout);reject(err);});
    child.once("exit",code=>{clearTimeout(timeout);reject(Error("server exited "+code+": "+stderr));});
  });
  const resp=await fetch(origin+"/api/tiles/0/3/3.json",{signal:AbortSignal.timeout(110_000)});
  assert.equal(resp.status,200,"Real ČÚZK tile HTTP "+resp.status+" "+await resp.text().catch(()=>""));
  const tile=await resp.json();
  assert.equal(tile.status,"real-data");
  assert.equal(tile.z,0);
  assert.equal(tile.verticalDatum,"Bpv (Baltic 1957)");
  assert.match(tile.source,/DMP OK/);
  assert.match(tile.imagerySource,/ORTOFOTO_WM/);
  assert.ok(tile.validVertices>2000&&tile.validVertices<50000);
  assert.ok(tile.triangles>4000);
  assert.ok(tile.width*tile.height<=50000);
  assert.ok(tile.originMeters.every(Number.isFinite));
  const positions=Buffer.from(tile.positionsF32LE,"base64");
  const triangles=Buffer.from(tile.trianglesU16LE,"base64");
  assert.equal(positions.byteLength,tile.width*tile.height*3*4);
  assert.equal(triangles.byteLength,tile.triangles*3*2);
  const texture=await fetch(origin+tile.texture.file,{signal:AbortSignal.timeout(20000)});
  assert.equal(texture.status,200);
  const pngBytes=new Uint8Array(await texture.arrayBuffer());
  const decoded=await decodeCuzkOrthoPng(pngBytes);
  assert.equal(decoded.width,tile.texture.width);
  assert.equal(decoded.height,tile.texture.height);
  assert.equal(decoded.validPixels,tile.texture.validPixels);
  assert.ok(decoded.validPixels>10000);
  // Verify persisted files can be read by the server on repeat requests.
  const [cachedJson,cachedPng]=await Promise.all([
    readFile(cache+"/v1-0-3-3.json"),readFile(cache+"/v1-0-3-3.png")
  ]);
  assert.equal(JSON.parse(cachedJson.toString()).key,"0-3-3");
  assert.equal(cachedPng.byteLength,pngBytes.byteLength);
  const again=await fetch(origin+"/api/tiles/0/3/3.json");
  assert.equal(again.status,200);
  console.log("PASS real streamed Prague tile 0-3-3: "+
    tile.validVertices+" measured DMP OK vertices, "+tile.triangles+
    " triangles, "+decoded.width+"×"+decoded.height+
    " genuine ČÚZK RGB pixels, cached and re-served");
}finally{
  child.kill();
}
