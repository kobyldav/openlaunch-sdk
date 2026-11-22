/** Stage 20: three REAL zero-source 4x4 passes, three fresh Node servers.
 * Deterministic tests for honest missing data, bounded streaming, elapsed
 * measurement and process RSS; NOT a fabricated 4x4 Sentinel source result.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
test("Stage 20: offline 16-tile benchmark counts every failure and repeats consistently across process restarts",
 {timeout:95000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),"openlaunch-4x4-audit-"));
 const output=join(dir,"actual-process-audit.json");
 try{
  const cli=fileURLToPath(new URL("../scripts/terrain-prague-region-benchmark.mjs",import.meta.url));
  const child=spawn(process.execPath,[cli,
   "--cache",dir,"--output",output,"--repeat","3",
   "--x","1","--y","1","--cols","4","--rows","4",
   "--timeout-ms","40000"
  ],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
  const chunks=[],errors=[];
  child.stdout.on("data",x=>chunks.push(x.toString()));
  child.stderr.on("data",x=>errors.push(x.toString()));
  const exitCode=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{child.kill();reject(Error("Four-by-four benchmark hung: "+errors.join("").slice(-1000)));},80000);
   child.once("error",e=>{clearTimeout(timeout);reject(e);});
   child.once("exit",code=>{clearTimeout(timeout);resolve(code);});
  });
  assert.equal(exitCode,0,errors.join("").slice(-1600));
  const report=JSON.parse(await readFile(output,"utf8"));
  assert.equal(report.status,"completed-source-faithful");
  assert.equal(report.mode,"offline-original-cache-only");
  assert.equal(report.runs.length,3);
  assert.equal(report.scientificResultsIdenticalAcrossRestarts,true);
  assert.equal(report.completion,"partial-or-zero-original-observations");
  assert.equal(new Set(report.runs.map(r=>r.scientificFingerprint)).size,1);
  for(const run of report.runs){
   assert.equal(run.coverage.requestedTiles,16);
   assert.equal(run.coverage.analyzedTiles,0);
   assert.equal(run.coverage.commonValidPixels,0);
   assert.equal(run.coverage.fractionMeasuredTiles,0);
   assert.equal(run.coverage.regionFullyAnalyzed,false);
   assert.equal(run.coverage.wholeRegionSclCoveragePercent,null);
   assert.equal(run.metrics.outcome,"no-observed-tiles");
   assert.equal(run.metrics.measuredTileCount,16);
   assert.equal(run.metrics.rasterCacheHits,0);
   assert.equal(run.metrics.rasterCacheMisses,0);
   assert.equal(run.metrics.rasterCacheUnavailable,16);
   assert.equal(run.metrics.catalogCacheHitYears,0);
   assert.equal(run.metrics.tiles.length,16);
   assert.ok(run.metrics.tiles.every(t=>t.sourceCache==="unavailable"));
   assert.ok(run.metrics.peakRssMiB>0);
   assert.ok(run.metrics.peakHeapUsedMiB>0);
   assert.ok(run.metrics.elapsedMs>=0);
   assert.ok(run.fullRequestWallMs>=run.metrics.elapsedMs);
  }
  assert.match(chunks.join(""),/PASS Stage 20 measured 4×4/);
 }finally{
  await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:120});
 }
});
