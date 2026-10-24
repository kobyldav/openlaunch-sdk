import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const names=["core","earth","raster","launches","orbit","math","engineering"];
const require=createRequire(import.meta.url);
const publicFunctions={
 core:["HttpClient","MemoryCache","query"],
 earth:["EarthCatalogClient","SpaceMapClient","NasaGibsClient","MeteosatClient","MeteosatImageCache","MeteosatCloudflareKvStore","NasaFirmsClient","Sentinel5pClient","SpaceVideoClient","StacClient","CopernicusClient","PlanetaryComputerClient","ObservationDiscoveryClient","bbox"],
 raster:["decodeGeoTiff","readCogWindowUrl","ndviRaster","ndwiRaster","ndmiRaster","nbrRaster","calibrateRasterFromStac","elevationToLocalMesh"],
 launches:["LaunchDataClient","LaunchesResource","NasaClient","LL2_PRODUCTION_BASE_URL"],
 orbit:["Sgp4Satellite","OrbitEngine","TrafficEngine"],
 math:["vec3","matrixMul","quatNormalize","LinearKalmanFilter"],
 engineering:["simulateLaunch","sweepLaunchGuidance","idealStagedDeltaVMps"],
};

for(const name of names){
  test(`@openlaunch/${name} has independently resolvable ESM/CJS main exports`,async()=>{
    const esm=await import("@openlaunch/"+name);
    const cjs=require("@openlaunch/"+name);
    for(const property of publicFunctions[name]){
      assert.ok(property in esm,`ESM missing ${name}.${property}`);
      assert.ok(property in cjs,`CJS missing ${name}.${property}`);
    }
  });
}
test("Earth STAC search uses scoped @openlaunch/core in a standalone workspace",async()=>{
  const {StacClient,bbox}=await import("@openlaunch/earth");
  let called=false;
  const fetchImpl=async(url,options)=>{
    called=true;
    assert.match(String(url),/search/);
    assert.equal(options.method,"POST");
    return new Response(JSON.stringify({type:"FeatureCollection",features:[]}),{
      status:200,headers:{"content-type":"application/json"},
    });
  };
  const client=new StacClient({baseUrl:"https://api.example.test/",fetch:fetchImpl,retries:0,cache:false});
  const result=await client.search({intersects:bbox(14,50,15,51).geometry,limit:5});
  assert.equal(called,true);
  assert.equal(result.features.length,0);
});
test("Launches package constructs a resource without full OpenLaunch class",async()=>{
  const {LaunchesResource}=await import("@openlaunch/launches");
  const {HttpClient}=await import("@openlaunch/core");
  const http=new HttpClient({
    baseUrl:"https://ll.example.test/2.3.0/",
    fetchImpl:async()=>new Response(JSON.stringify({count:0,next:null,previous:null,results:[]})),
    retries:0,retryDelayMs:100,cacheTtlMs:0,headers:{},
  });
  const client=new LaunchesResource(http);
  assert.equal((await client.upcoming({limit:1})).results.length,0);
});
test("Earth, launches and raster have no satellite.js or orbit/engineering dependency",async()=>{
  for(const n of ["earth","launches","raster","math"]){
    const file=path.join(root,"packages",n,"package.json");
    const manifest=JSON.parse(await readFile(file,"utf8"));
    for(const unwanted of ["satellite.js","@openlaunch/orbit","@openlaunch/engineering"]){
      assert.equal(Object.hasOwn(manifest.dependencies??{},unwanted),false,n+" unexpectedly depends on "+unwanted);
    }
    // Only modules reachable from that package's own entrypoint are packaged.
    for(const dir of (n==="math"?["orbit","traffic","trajectory","mission"]:["orbit","traffic","trajectory","science","mission"])){
      await assert.rejects(stat(path.join(root,"packages",n,"dist","esm",dir)),{code:"ENOENT"});
    }
  }
});
test("Monolith remains backward-compatible and distinct from modular packages",async()=>{
  const whole=await import("../dist/index.js");
  assert.equal(typeof whole.OpenLaunch,"function");
  assert.equal(typeof whole.readCogWindowUrl,"function");
  const pkg=JSON.parse(await readFile(path.join(root,"package.json"),"utf8"));
  assert.deepEqual(pkg.workspaces,["packages/*"]);
  assert.equal(pkg.version,"1.8.0");
});
test("Package build-report shows isolated module sizes",async()=>{
  const report=JSON.parse(await readFile(path.join(root,"packages/build-report.json"),"utf8"));
  assert.equal(report.length,7);
  for(const item of report){
    assert.ok(item.modules>0&&item.bytes>0);
    assert.ok(item.bytes<3_000_000,item.pkg+" package unexpectedly exceeds 3 MB uncompressed");
  }
  const earth=report.find(x=>x.pkg==="earth");
  const engineering=report.find(x=>x.pkg==="engineering");
  // Modular Earth now contains real provider/cache logic. Compare against a\n  // fixed budget, not the unrelated optional engineering package size.\n  assert.ok(earth.bytes<384*1024,"Earth package unexpectedly exceeds 384 KiB");\n  assert.ok(engineering.bytes<384*1024,"Engineering package unexpectedly exceeds 384 KiB");
  console.log("Workspace uncompressed size report:",report.map(x=>({
    name:"@openlaunch/"+x.pkg,modules:x.modules,KiB:Math.round(x.bytes/1024)
  })));
});

test("Small standalone facades support one-line Earth and launch data clients",async()=>{
  const {EarthCatalogClient}=await import("@openlaunch/earth");
  const {LaunchDataClient}=await import("@openlaunch/launches");
  const providers=new EarthCatalogClient();
  assert.equal(typeof providers.discoverObservations,"function");
  assert.equal(typeof providers.downloadPreview,"function");
  const launches=new LaunchDataClient({
    fetch:async()=>new Response(JSON.stringify({count:0,next:null,previous:null,results:[]})),
    retries:0,
  });
  assert.equal((await launches.launches.upcoming({limit:1})).results.length,0);
  assert.ok(launches.config);
});

test("Engineering re-exports math without bundling math implementations",async()=>{
 const e=JSON.parse(await readFile(path.join(root,"packages/engineering/package.json"),"utf8"));
 assert.equal(e.dependencies["@openlaunch/math"],"^1.8.0");
 const index=await readFile(path.join(root,"packages/engineering/dist/esm/science/index.js"),"utf8");
 assert.match(index,/@openlaunch\/math\/internal\/science\/matrix/);
 const m=await import("@openlaunch/math");
 assert.equal(m.matrixMul([[2]],[[3]])[0][0],6);
});
