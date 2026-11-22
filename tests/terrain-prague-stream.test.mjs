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
import {buildSeamMesh,SEAM_SKIRT_DEPTH_M,TERRAIN_SEAM_VERSION}
  from "../scripts/terrain-prague-stream-seams.mjs";

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
  assert.match(page,/ids\.every\(id=>cache\.has\(id\)\)/);
  assert.match(page,/let selection=\{coarse:/);
  assert.match(page,/OpenLaunchTilePlanner/);
  assert.match(page,/lerpFade\(/);
  assert.match(page,/uFade/);
  assert.match(page,/uPass/);
  assert.match(page,/\/api\/visibility\.js/);
  assert.match(page,/\/api\/inspect\.js/);
  assert.match(page,/id="inspect-mode"/);
  assert.match(page,/id="measurement"/);
  assert.match(page,/id="height-profile"/);
  assert.match(page,/id="export-profile"/);
  assert.match(page,/inspector\.pickMeasured\(/);
  assert.match(page,/inspector\.profile\(/);
  assert.match(page,/webglcontextlost/);
  assert.match(page,/id="buildings"/);
  assert.match(page,/id="building-count"/);
  assert.match(page,/\/api\/buildings\/0\//);
  assert.match(page,/buildingsEnabled/);
  assert.match(page,/makeBuildingGpu\(/);
  assert.match(page,/d\.roofTexture/);
  assert.match(page,/d\.uvsF32LE/);
  assert.match(page,/gl\.drawElements\(gl\.TRIANGLES,t\.wallCount/);
  assert.match(page,/gl\.drawElements\(gl\.TRIANGLES,t\.roofCount/);
  assert.match(page,/updateBuildings\(/);
  assert.match(page,/webglcontextrestored/);
  assert.match(page,/graphicsEpoch/);
  assert.match(page,/controllers=new Map/);
  assert.match(page,/controller\.abort\(\)/);
  assert.match(page,/signal:controller\.signal/);
  assert.match(page,/inspectorTiles\(/);
  assert.match(page,/elevationM===null/);
  assert.match(page,/d\.seam\?\.version!==2/);
  assert.match(page,/MAX_GPU_TILES=40/);
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
  const child=spawn(process.execPath,[script,"--port","0","--no-open","--offline","--cache",cache],
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
    const [config,root,notFound,invalid,visibility,inspection]=await Promise.all([
      fetch(origin+"/api/config"),fetch(origin+"/"),
      fetch(origin+"/api/tiles/nope"),fetch(origin+"/api/tiles/1/22/0.json"),
      fetch(origin+"/api/visibility.js"),fetch(origin+"/api/inspect.js")
    ]);
    assert.equal(config.status,200);
    const manifest=await config.json();
    assert.equal(manifest.levels[1].demResolutionM,2);
    assert.equal(manifest.offlineMode,true);
    assert.match(manifest.caveat,/no vertical facades/);
    assert.equal(root.status,200);
    assert.equal((await fetch(origin+"/api/buildings/0/99/0.json")).status,400,
      "Building API must reject out-of-bounds paths");
    assert.match(await root.text(),/OpenLaunch SDK.*Praha 3D/);
    assert.equal(notFound.status,404);
    assert.equal(invalid.status,400);
    const unavailable=await fetch(origin+"/api/tiles/0/3/3.json");
    assert.equal(unavailable.status,404,"Offline mode must never fetch missing ČÚZK tiles");
    assert.match(await unavailable.text(),/offline mode forbids source requests/);
    assert.equal(visibility.status,200);
    assert.match(visibility.headers.get("content-type")??"",/javascript/);
    assert.match(await visibility.text(),/OpenLaunchTilePlanner/);
    assert.equal(inspection.status,200);
    assert.match(inspection.headers.get("content-type")??"",/javascript/);
    assert.match(await inspection.text(),/OpenLaunchTerrainInspect/);
    // No /api/tiles/0/... valid request: the test must not fetch ČÚZK.
  } finally{
    child.kill();
    await rm(cache,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  }
});

test("camera-frustum planner does not request all 36 coarse tiles, and holds LOD thresholds",async()=>{
  const text=await readFile(new URL("../scripts/terrain-prague-stream-visibility.js",import.meta.url),"utf8");
  const context={window:{}};
  runInNewContext(text,context);
  const make=context.window.OpenLaunchTilePlanner?.createPlanner;
  assert.equal(typeof make,"function");
  const planner=make(pragueStreamManifest());
  const base={yaw:0,pitch:.78,panX:0,panNorth:0,vertical:1,aspect:1.6,enableDetail:true};
  const near=planner.choose({...base,distance:1200});
  assert.equal(near.detailActive,true);
  assert.ok(near.coarse.length>0&&near.coarse.length<36,
    "the view frustum removes truly invisible coarse tiles");
  assert.ok(near.finer.length<=8);
  assert.equal(near.finer.length%4,0,"each requested fine group is complete");
  const selected=new Set(near.coarse.map(t=>t.key));
  const opposite=planner.choose({...base,yaw:Math.PI,distance:1200});
  const inverted=new Set(opposite.coarse.map(t=>t.key));
  assert.notDeepEqual([...selected].sort(),[...inverted].sort(),
    "looking in the opposite direction must change requested tiles");
  assert.equal(planner.choose({...base,distance:1600}).detailActive,true,
    "hysteresis keeps fine mode when zooming out slightly");
  assert.equal(planner.choose({...base,distance:1750}).detailActive,false);
  assert.equal(planner.choose({...base,distance:1400}).detailActive,false,
    "fine mode must not immediately re-enter near its exit threshold");
  assert.equal(planner.choose({...base,distance:1240}).detailActive,true);
  assert.equal(planner.choose({...base,distance:200,enableDetail:false}).detailActive,false);
  assert.throws(()=>planner.choose({...base,aspect:0,distance:200}),/Invalid camera/);
});
function flatMeasuredTile(spec,width=5,height=5,{invalidCorner=false}={}){
  const sw=mercatorFromLonLat(spec.west,spec.south),ne=mercatorFromLonLat(spec.east,spec.north);
  const grid={crs:"EPSG:3857",transform:[sw[0],(ne[0]-sw[0])/width,0,
    ne[1],0,-(ne[1]-sw[1])/height]};
  const origin=tileOriginOffset(grid);
  const scale=Math.cos(PRAGUE_STREAM_REGION.centerLatitudeDeg*Math.PI/180);
  const positions=new Float32Array(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    positions[i*3]=x*grid.transform[1]*scale;
    positions[i*3+1]=y*grid.transform[5]*scale;
    positions[i*3+2]=invalidCorner&&i===0?NaN:210;
  }
  const triangles=[];
  const good=i=>Number.isFinite(positions[i*3+2]);
  for(let y=0;y<height-1;y++)for(let x=0;x<width-1;x++){
    const a=y*width+x,b=a+1,c=a+width,d=c+1;
    if(good(a)&&good(b)&&good(c))triangles.push(a,b,c);
    if(good(b)&&good(d)&&good(c))triangles.push(b,d,c);
  }
  return {mesh:{positions,triangles:new Uint32Array(triangles),
    validVertices:positions.length/3-(invalidCorner?1:0)},grid,origin};
}
test("visual seam aprons meet exact common tile bounds while preserving measured heights",()=>{
  const left=tileSpec(0,0,0),right=tileSpec(0,1,0);
  const l=flatMeasuredTile(left),r=flatMeasuredTile(right);
  const a=buildSeamMesh(l.mesh,5,5,[left.west,left.south,left.east,left.north],l.origin);
  const b=buildSeamMesh(r.mesh,5,5,[right.west,right.south,right.east,right.north],r.origin);
  for(const [result,input] of [[a,l],[b,r]]){
    assert.equal(result.measuredVertices,25);
    assert.equal(result.measuredTriangles,32);
    assert.ok(result.apronTriangles>0&&result.skirtTriangles>0);
    assert.ok(result.renderVertices>25&&result.renderVertices<65536);
    assert.ok(result.triangles.every(id=>id<result.renderVertices));
    assert.equal(result.positions.length,result.renderVertices*3);
    assert.equal(result.uvs.length,result.renderVertices*2);
    assert.match(result.provenance,/visual-only/);
    for(let i=0;i<input.mesh.positions.length;i++)
      assert.equal(result.positions[i],input.mesh.positions[i],
        "source heights/positions remain untouched");
    for(let i=25;i<result.renderVertices;i++){
      const z=result.positions[i*3+2];
      assert.ok(z===210||z===210-SEAM_SKIRT_DEPTH_M,
        "seam heights only repeat real perimeter measurement or vertical skirt");
    }
  }
  const worldEast=mercatorFromLonLat(left.east,left.north)[0];
  const worldCentre=mercatorFromLonLat((PRAGUE_STREAM_REGION.west+PRAGUE_STREAM_REGION.east)/2,
    (PRAGUE_STREAM_REGION.south+PRAGUE_STREAM_REGION.north)/2)[0];
  const xExpected=(worldEast-worldCentre)*
    Math.cos(PRAGUE_STREAM_REGION.centerLatitudeDeg*Math.PI/180);
  const verticesAtBorder=(result,origin)=>Array.from(result.positions)
    .filter((_,i)=>i%3===0).map(x=>x+origin[0])
    .filter(x=>Math.abs(x-xExpected)<.005);
  assert.ok(verticesAtBorder(a,l.origin).length>=10);
  assert.ok(verticesAtBorder(b,r.origin).length>=10);
  assert.ok(Math.abs(left.east-right.west)<1e-12);
});
test("visual seam skirts do not fabricate missing DEM corner elevations",()=>{
  const spec=tileSpec(1,0,0);
  const input=flatMeasuredTile(spec,5,5,{invalidCorner:true});
  const result=buildSeamMesh(input.mesh,5,5,
    [spec.west,spec.south,spec.east,spec.north],input.origin);
  assert.ok(Number.isNaN(result.positions[2]));
  assert.ok(result.apronTriangles>0);
  // No appended vertex may contain NaN or infinite coordinates.
  for(const value of result.positions.subarray(5*5*3))assert.ok(Number.isFinite(value));
  assert.equal(TERRAIN_SEAM_VERSION,2);
  assert.throws(()=>buildSeamMesh(input.mesh,5,5,[0,0,0,0],input.origin,
    {skirtDepthM:100}),/depth/);
});
