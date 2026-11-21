import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {Script,runInNewContext} from "node:vm";
import {
  PRAGUE_STREAM_REGION,mercatorFromLonLat,tileSpec,tileOriginOffset,pragueStreamManifest
} from "../scripts/terrain-prague-stream-grid.mjs";

test("streamed Prague geography is 4km-wide, bounded, and exactly tessellated",()=>{
  const manifest=pragueStreamManifest();
  assert.equal(manifest.status,"real-remote-data");
  assert.equal(manifest.levels.length,2);
  assert.deepEqual(manifest.levels.map(x=>x.cols),[6,12]);
  assert.deepEqual(manifest.levels.map(x=>x.demResolutionM),[12,2]);
  assert.deepEqual(manifest.levels.map(x=>x.textureResolutionM),[2,.5]);
  for(const z of [0,1]){
    const cols=manifest.levels[z].cols,rows=manifest.levels[z].rows;
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const t=tileSpec(z,x,y);
      assert.ok(t.west>=PRAGUE_STREAM_REGION.west&&t.east<=PRAGUE_STREAM_REGION.east);
      assert.ok(t.south>=PRAGUE_STREAM_REGION.south&&t.north<=PRAGUE_STREAM_REGION.north);
      assert.ok((t.east-t.west)<.01&&(t.north-t.south)<.01);
      if(x<cols-1)assert.ok(Math.abs(t.east-tileSpec(z,x+1,y).west)<1e-12);
      if(y<rows-1)assert.ok(Math.abs(t.south-tileSpec(z,x,y+1).north)<1e-12);
      if(z===0){
        const fine=tileSpec(1,x*2,y*2),corner=tileSpec(1,x*2+1,y*2+1);
        assert.ok(Math.abs(fine.west-t.west)<1e-12);
        assert.ok(Math.abs(corner.east-t.east)<1e-12);
        assert.ok(Math.abs(fine.north-t.north)<1e-12);
        assert.ok(Math.abs(corner.south-t.south)<1e-12);
      }
    }
  }
  assert.throws(()=>tileSpec(2,0,0),/level/);
  assert.throws(()=>tileSpec(1,12,0),/outside/);
  assert.throws(()=>tileSpec(0,0,-1),/outside/);
  assert.throws(()=>tileSpec(0,0.4,0),/outside/);
});
test("each tile origin is converted into one consistent metre-space center",()=>{
  const manifest=pragueStreamManifest();
  const [cx,cy]=mercatorFromLonLat(...manifest.center);
  const grid={crs:"EPSG:3857",transform:[cx-150,3,0,cy+90,0,-3]};
  const [x,north]=tileOriginOffset(grid);
  const factor=Math.cos(manifest.centerLatitudeDeg*Math.PI/180);
  assert.ok(Math.abs(x-(-150+1.5)*factor)<1e-5);
  assert.ok(Math.abs(north-(90-1.5)*factor)<1e-5);
  assert.throws(()=>tileOriginOffset({...grid,crs:"EPSG:4326"}),/EPSG:3857/);
  assert.throws(()=>mercatorFromLonLat(14,92),/Invalid/);
});
test("new streamed WebGL viewer has real tile requests, LOD swap and finite GPU cache",async()=>{
  const page=await readFile(new URL("../scripts/terrain-prague-stream-viewer.html",import.meta.url),"utf8");
  assert.match(page,/\/api\/config/);
  assert.match(page,/\/api\/tiles\//);
  assert.match(page,/children\.every\(k=>cache\.has\(k\.key\)\)/);
  assert.match(page,/MAX_GPU_TILES=32/);
  assert.match(page,/gl\.deleteBuffer/);
  assert.match(page,/gl\.deleteTexture/);
  assert.match(page,/DMP OK.*Ortofoto ČR/);
  assert.match(page,/30_000/);
  const src=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(src);
  assert.doesNotThrow(()=>new Script(src));
  const shaders=page.match(/const vertexSrc=\[[\s\S]*?\]\.join\("\\n"\);\s*const fragmentSrc=\[[\s\S]*?\]\.join\("\\n"\);/)?.[0];
  assert.ok(shaders,"verify the exact GLSL used by the streaming viewer");
  const {vertexSrc,fragmentSrc}=runInNewContext(shaders+"\n({vertexSrc,fragmentSrc})");
  for(const token of ["varying mediump vec2 vUv","varying mediump float vElevation"]){
    assert.ok(vertexSrc.includes(token)&&fragmentSrc.includes(token),"cross-shader precision matches: "+token);
  }
});
test("local streaming server starts without any terrain download, accepts only valid paths",async()=>{
  const cache=await mkdtemp(join(tmpdir(),"openlaunch-terrain-stream-test-"));
  const script=fileURLToPath(new URL("../scripts/terrain-prague-stream.mjs",import.meta.url));
  const child=spawn(process.execPath,[script,"--port","0","--no-open","--cache",cache],
    {stdio:["ignore","pipe","pipe"],windowsHide:true});
  let stdout="",stderr="";
  child.stderr.on("data",buf=>{stderr+=buf.toString();});
  try{
    const origin=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error("Stream server startup timeout "+stderr)),20000);
      const onData=chunk=>{
        stdout+=chunk.toString();
        const m=stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
        if(m){clearTimeout(timeout);child.stdout.off("data",onData);resolve("http://127.0.0.1:"+m[1]);}
      };
      child.stdout.on("data",onData);
      child.once("error",e=>{clearTimeout(timeout);reject(e);});
      child.once("exit",code=>{clearTimeout(timeout);reject(Error("Server exited "+code+": "+stderr));});
    });
    const [config,root,notFound,invalid]=await Promise.all([
      fetch(origin+"/api/config"),fetch(origin+"/"),
      fetch(origin+"/api/tiles/nope"),fetch(origin+"/api/tiles/1/22/0.json")
    ]);
    assert.equal(config.status,200);
    const manifest=await config.json();
    assert.equal(manifest.levels[1].demResolutionM,2);
    assert.match(manifest.caveat,/no vertical facades/);
    assert.equal(root.status,200);
    assert.match(await root.text(),/OpenLaunch SDK.*Praha 3D/);
    assert.equal(notFound.status,404);
    assert.equal(invalid.status,400);
    // No /api/tiles/0/... valid request: the test must not fetch ČÚZK.
  } finally{
    child.kill();
    await rm(cache,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  }
});
