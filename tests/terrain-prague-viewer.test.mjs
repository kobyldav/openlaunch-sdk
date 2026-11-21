import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script,runInNewContext} from "node:vm";

test("embedded Prague WebGL viewer parses as standalone JavaScript",async()=>{
  const page=await readFile(new URL("../scripts/terrain-prague-viewer.html",import.meta.url),"utf8");
  assert.ok(page.includes("const D=__MODEL_DATA__;"),"single offline payload marker");
  const code=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(code);
  const parsed=code.replace("const D=__MODEL_DATA__;", "const D={};");
  assert.doesNotThrow(()=>new Script(parsed));
  assert.match(page,/texture2D\(uTexture,vUv\)/);
  assert.match(page,/gl\.drawElements\(gl\.TRIANGLES/);
  assert.match(page,/startFallback/);
  assert.match(page,/terrain-texture\.png/);
  assert.match(page,/terrain\.mtl/);
  assert.match(page,/id="measure"/);
  assert.match(page,/id="overlay"/);
  assert.match(page,/id="profile"/);
  assert.match(page,/pickTerrain\(/);
  assert.match(page,/gridAtMercator\(/);
  assert.match(page,/drawMeasureOverlay\(/);
  assert.match(page,/download-profile/);
  assert.match(page,/download-geojson/);
  assert.match(page,/verticalDatum:m\.verticalDatum/);
});


test("WebGL 1 shared shader uniforms and varyings must use identical float precision",async()=>{
  const page=await readFile(new URL("../scripts/terrain-prague-viewer.html",import.meta.url),"utf8");
  // Evaluate the actual shader string arrays, not a hand-copied GLSL fixture.
  const arrays=page.match(/const vertexSrc=\[[\s\S]*?\]\.join\("\\n"\);\s*const fragmentSrc=\[[\s\S]*?\]\.join\("\\n"\);/)?.[0];
  assert.ok(arrays,"both compiled shader strings must be extractable");
  const {vertexSrc,fragmentSrc}=runInNewContext(arrays+"\n({vertexSrc,fragmentSrc})");
  const declarations=source=>{
    const defaultFloat=/\bprecision\s+(lowp|mediump|highp)\s+float\s*;/.exec(source)?.[1]??"highp"; // GLSL ES vertex default is highp
    const entries=new Map();
    for(const match of source.matchAll(/\b(uniform|varying)\s+(?:(lowp|mediump|highp)\s+)?(float|vec[234])\s+([^;]+);/g)){
      const [_,kind,qualifier,type,names]=match;
      for(const name of names.split(",")){
        const id=name.trim();
        if(entries.has(id))throw Error("Duplicate shader interface "+id);
        entries.set(id,{kind,type,precision:qualifier??defaultFloat});
      }
    }
    return entries;
  };
  const vertex=declarations(vertexSrc),fragment=declarations(fragmentSrc);
  for(const [name,attr] of fragment){
    const peer=vertex.get(name);
    if(!peer)continue; // uMax and texture sampler only occur in the fragment stage
    assert.deepEqual(peer,attr,"WebGL 1 precision mismatch across shader stages: "+name);
  }
  assert.equal(vertex.get("uMin")?.precision,"mediump");
  assert.equal(fragment.get("uMin")?.precision,"mediump");
  assert.equal(vertex.get("vElevation")?.precision,fragment.get("vElevation")?.precision);
  assert.equal(vertex.get("vUv")?.precision,fragment.get("vUv")?.precision);
});
