/** Link the viewer's exact shader source in real headless WebGL1 on Windows CI. */
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {runInNewContext} from "node:vm";
import {spawnSync} from "node:child_process";

const viewer=await readFile(process.argv[2]??new URL("./terrain-prague-viewer.html",import.meta.url),"utf8");
const block=viewer.match(/const vertexSrc=\[[\s\S]*?\]\.join\("\\n"\);\s*const fragmentSrc=\[[\s\S]*?\]\.join\("\\n"\);/)?.[0];
assert.ok(block,"Cannot extract actual GLSL strings from terrain viewer");
const {vertexSrc,fragmentSrc}=runInNewContext(block+"\n({vertexSrc,fragmentSrc})");
const candidatePaths=[
  join(process.env["ProgramFiles(x86)"]??"C:\\Program Files (x86)","Microsoft","Edge","Application","msedge.exe"),
  join(process.env.ProgramFiles??"C:\\Program Files","Microsoft","Edge","Application","msedge.exe"),
  join(process.env.ProgramFiles??"C:\\Program Files","Google","Chrome","Application","chrome.exe")
];
const browser=candidatePaths.find(existsSync);
if(!browser)throw new Error("Windows CI must provide Microsoft Edge or Chrome to verify GLSL linking");
const tmp=await mkdtemp(join(tmpdir(),"openlaunch-glsl-"));
try{
  const html=[
    '<!doctype html><html><meta charset="utf-8"><body>WEBGL_LINK_PENDING<script>',
    'try {',
    'const vertexSource='+JSON.stringify(vertexSrc)+';',
    'const fragmentSource='+JSON.stringify(fragmentSrc)+';',
    'const gl=document.createElement("canvas").getContext("webgl",{alpha:false});',
    'if(!gl)throw new Error("Headless browser did not provide WebGL1 context");',
    'const compile=(kind,source)=>{',
    ' const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);',
    ' if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));',
    ' return shader;',
    '};',
    'const program=gl.createProgram();',
    'gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));',
    'gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));',
    'gl.linkProgram(program);',
    'if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));',
    'document.body.textContent="WEBGL_LINK_OK";',
    '}catch(e){document.body.textContent="WEBGL_LINK_FAILED "+String(e);}',
    '</script></body></html>'
  ].join("\n");
  const file=join(tmp,"shader.html");
  await writeFile(file,html,"utf8");
  const result=spawnSync(browser,[
    "--headless=new","--disable-extensions","--disable-background-networking",
    "--no-first-run","--no-default-browser-check","--disable-gpu-sandbox",
    "--enable-webgl","--ignore-gpu-blocklist","--enable-unsafe-swiftshader",
    "--use-angle=swiftshader","--virtual-time-budget=5000",
    "--user-data-dir="+join(tmp,"profile"),"--dump-dom",pathToFileURL(file).href
  ],{encoding:"utf8",timeout:45_000,maxBuffer:512*1024,windowsHide:true});
  if(result.error)throw result.error;
  assert.equal(result.status,0,"Headless browser failed: "+String(result.stderr).slice(-1600));
  const output=String(result.stdout??"");
  assert.match(output,/<body>\s*WEBGL_LINK_OK\s*</,
    "GLSL did not link in actual WebGL1:\n"+
    (output.match(/<body>([\s\S]*?)<\/body>/)?.[1]??"no browser DOM").slice(0,1200)+
    "\n"+String(result.stderr).slice(-1000));
  console.log("PASS WebGL1 shader link in "+browser);
}finally{
  await rm(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
