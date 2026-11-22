/** Live-source optional check for Prague building LOD1.
 * Consumes the same genuine ČÚZK DSM cache as the earlier streaming tile test.
 * Downloads one bounded Overpass footprint set and one ČÚZK DMR 5G F32 image.
 * Never turns service failure into fictional building heights.
 */
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve,join} from "node:path";
import {tileSpec} from "./terrain-prague-stream-grid.mjs";
import {fetchOsmFootprints,fetchGroundDmr,buildBuildings,
  BUILDING_LAYER_VERSION} from "./terrain-prague-buildings.mjs";
const spec=tileSpec(0,3,3);
const cache=resolve("test-results/terrain-prague-stream-ci");
const file=join(cache,"v2-"+spec.key+".json");
const document=JSON.parse(await readFile(file,"utf8"));
assert.equal(document.status,"real-data");
assert.equal(document.verticalDatum,"Bpv (Baltic 1957)");
const bytes=Buffer.from(document.positionsF32LE,"base64");
const positions=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
const [elements,ground]=await Promise.all([
  fetchOsmFootprints(spec),fetchGroundDmr(spec)
]);
const buildings=buildBuildings(spec,elements,ground,{
  positions,width:document.width,height:document.height,
  originMeters:document.originMeters,verticalDatum:document.verticalDatum
});
assert.equal(buildings.status,"real-source-buildings");
assert.equal(buildings.verticalDatum,"Bpv (Baltic 1957)");
assert.ok(elements.length>10,"Real Prague should return multiple OSM building footprints");
assert.ok(buildings.buildings>0,
  "Real Prague height model and OSM building features should intersect");
assert.ok(buildings.heightMethods.explicitOsmHeight+
  buildings.heightMethods.estimatedDsmMinusDmr===buildings.buildings);
assert.ok(buildings.triangles>0&&buildings.renderVertices>0);
assert.ok(buildings.triangles<130000&&buildings.renderVertices<65536);
await mkdir(cache,{recursive:true});
await writeFile(join(cache,"buildings-v"+BUILDING_LAYER_VERSION+"-"+spec.key+".json"),
  JSON.stringify(buildings));
console.log("PASS genuine OSM + ČÚZK DMR5G/DMPOK building tile "+
  spec.key+": "+elements.length+" real OSM building ways, "+
  buildings.buildings+" LOD1 volumes ("+
  buildings.heightMethods.explicitOsmHeight+" explicit OSM heights + "+
  buildings.heightMethods.estimatedDsmMinusDmr+
  " DSM-DMR derived estimates), "+buildings.triangles+" render triangles");
