import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script} from "node:vm";

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
});
