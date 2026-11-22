/**
 * Reproducible browser screenshots of real SDK orbital and launch model outputs.
 * Uses SGP4 historical TLE + simulateLaunch / launchToCzml; not an illustration generator.
 * NASA Blue Marble is a real satellite-derived Earth surface composite (2002).
 *
 * Command after npm run build:
 * node scripts/generate-sdk-showcase.mjs
 */
import { readFile,writeFile,mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { join,dirname,resolve } from "node:path";
import { createRequire } from "node:module";
import { Sgp4Satellite,simulateLaunch,launchToCzml } from "../dist/index.js";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const TOOLS=join(ROOT,"tools/readme-gallery");
const OUT=join(ROOT,"docs/images/live");
const req=createRequire(join(TOOLS,"package.json"));
const {chromium}=req("playwright");
const THREE_MODULE=join(TOOLS,"node_modules","three","build","three.module.js");
const THREE_CORE=join(TOOLS,"node_modules","three","build","three.core.js");
const ISS1="1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const ISS2="2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";
const START=new Date("2019-06-05T12:00:00Z");
const NASA_URL="https://raw.githubusercontent.com/Depal-Jakub/orbital-bloom/main/public/assets/earth-day-2048.jpg";
const NASA_ORIGINAL="https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg";

const model={
 liftoff:START,
 site:{name:"Generic Atlantic-coast launch pad",latitudeDeg:28.56,longitudeDeg:-80.58,altitudeM:3},
 durationSeconds:240,stepSeconds:1,
 guidance:[{timeSeconds:0,pitchDeg:90,headingDeg:90,throttle:1},
 {timeSeconds:20,pitchDeg:65,headingDeg:90,throttle:1},
 {timeSeconds:80,pitchDeg:24,headingDeg:90,throttle:1},
 {timeSeconds:170,pitchDeg:8,headingDeg:90,throttle:.95},
 {timeSeconds:240,pitchDeg:0,headingDeg:90,throttle:.95}],
 vehicle:{name:"Generic two-stage test vehicle",payloadMassKg:100,fairingMassKg:30,
  fairingJettisonSeconds:25,dragCoefficient:.25,referenceAreaM2:2,stages:[
   {name:"Booster",dryMassKg:1000,propellantMassKg:5000,thrustSeaLevelN:300000,thrustVacuumN:330000,
    ispSeaLevelS:250,ispVacuumS:280,coastAfterSeparationSeconds:3},
   {name:"Upper stage",dryMassKg:300,propellantMassKg:1000,thrustSeaLevelN:60000,thrustVacuumN:65000,
    ispSeaLevelS:280,ispVacuumS:310}
  ]}
};
function finite(n){if(!Number.isFinite(n))throw Error("Nonfinite SDK output");return Number(n.toFixed(5));}
function scenes(){
 const sat=Sgp4Satellite.fromTle(ISS1,ISS2,{name:"ISS / historical GP elements"});
 const points=sat.groundTrack({start:START,end:new Date(START.getTime()+95*60000),stepSeconds:45});
 const flight=simulateLaunch(model);
 if(points.length<100||flight.telemetry.length<20)throw Error("SDK returned insufficient model samples");
 // The SDK's own CZML transform supplies time-tagged Earth-fixed positions.
 const czml=launchToCzml(flight);
 const flightPacket=czml.find(v=>v.id==="launch-vehicle");
 if(!flightPacket?.position?.cartesian?.length)throw Error("SDK CZML export is empty");
 const trajectory=flight.telemetry.map(p=>({
  t:finite(p.elapsedSeconds),lon:finite(p.longitudeDeg),lat:finite(p.latitudeDeg),
  altKm:finite(p.altitudeKm),qPa:finite(p.dynamicPressurePa),speedMps:finite(p.inertialSpeedMps),
  mach:finite(p.mach),stage:p.stageIndex
 }));
 if(trajectory.some(p=>p.altKm < -1))throw Error("Invalid simulated launch altitude");
 return {
  orbit:{epoch:sat.sourceInfo.epoch.toISOString(),start:START.toISOString(),norad:25544,
   positions:points.map(p=>[finite(p.positionEcfKm.x),finite(p.positionEcfKm.y),finite(p.positionEcfKm.z)]),
   ground:points.map(p=>[finite(p.latitudeDeg),finite(p.longitudeDeg)]),
   altitudeKm:finite(points[Math.floor(points.length/2)].heightKm),
   source:"Historical June 2019 TLE from SDK regression fixtures / SGP4 propagated positions"},
  launch:{launchTime:START.toISOString(),modelName:model.vehicle.name,
   path:trajectory,events:flight.events.map(e=>({kind:e.kind,t:finite(e.elapsedSeconds),altKm:finite(e.altitudeKm)})),
   maxAltitudeKm:finite(flight.maxAltitudeKm),maxQkPa:finite(flight.maxQPa/1000),
   maxSpeedMps:finite(Math.max(...flight.telemetry.map(p=>p.inertialSpeedMps))),
   source:"SDK generic two-stage 3DOF model, not actual launch telemetry",
   czmlSamples:flightPacket.position.cartesian.length/4},
  sourceImages:{blueMarble:NASA_ORIGINAL,mirror:NASA_URL,attribution:"NASA/GSFC, Reto Stöckli (Blue Marble 2002)"}
 };
}
async function texture(){
 let bytes;
 if(process.env.OPENLAUNCH_EARTH_TEXTURE){
  bytes=await readFile(resolve(process.env.OPENLAUNCH_EARTH_TEXTURE));
 }else{
  const response=await fetch(NASA_URL,{signal:AbortSignal.timeout(30000),headers:{"User-Agent":"OpenLaunch-SDK-readme-showcase/1.0"}});
  if(!response.ok)throw Error("NASA Blue Marble mirror HTTP "+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
 }
 if(bytes.length<80000||bytes.length>6_000_000||bytes[0]!==0xff||bytes[1]!==0xd8)throw Error("NASA texture is not validated JPEG");
 return bytes;
}
function serve(scene,earth){
 const viewer=readFile(join(TOOLS,"showcase-viewer.html"));
 const module=readFile(THREE_MODULE);
 const coreModule=readFile(THREE_CORE);
 const server=createServer(async(request,response)=>{
  const pathname=(request.url||"/").split("?")[0];
  const payload=pathname==="/viewer.html"?[await viewer,"text/html; charset=utf-8"]
   :pathname==="/three.module.js"?[await module,"text/javascript; charset=utf-8"]
   :pathname==="/three.core.js"?[await coreModule,"text/javascript; charset=utf-8"]
   :pathname==="/scene.json"?[Buffer.from(JSON.stringify(scene)),"application/json"]
   :pathname==="/earth.jpg"?[earth,"image/jpeg"]:null;
  if(!payload){response.writeHead(404);response.end();return;}
  response.writeHead(200,{"content-type":payload[1],"cache-control":"no-store"});
  response.end(payload[0]);
 });
 return new Promise((res,rej)=>server.once("error",rej).listen(0,"127.0.0.1",()=>res({
  server,url:"http://127.0.0.1:"+server.address().port+"/viewer.html"
 })));
}
async function main(){
 await mkdir(OUT,{recursive:true});
 const data=scenes(),earth=await texture();
 await writeFile(join(OUT,"sdk-showcase-provenance.json"),JSON.stringify({generatedAt:new Date().toISOString(),
  dataSources:[data.orbit.source,data.launch.source,data.sourceImages.attribution],
  blueMarble:NASA_URL,figureTypes:["3D orbit rendering","3D local launch model"],
  limits:"Visual demonstration of SDK results; not live orbit, flight telemetry or photorealistic spacecraft"},null,2)+"\n");
 const {server,url}=await serve(data,earth);
 const browser=await chromium.launch({headless:true,args:["--enable-webgl","--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader","--use-angle=swiftshader","--no-sandbox"]});
 const results=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1,locale:"en-US"});
  for(const mode of ["orbit","launch"]){
   const page=await ctx.newPage();
   const errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   page.on("console",m=>{if(m.type()==="error")errors.push("console: "+m.text().slice(0,600));});
   page.on("requestfailed",req=>errors.push("request: "+req.url()+" "+req.failure()?.errorText));
   await page.goto(url+"?mode="+mode,{waitUntil:"load",timeout:35000});
   try{await page.waitForFunction(()=>window.__showcaseReady===true,null,{timeout:12000});}
   catch(e){
    console.error("WebGL page did not initialize:",mode,JSON.stringify(errors));
    console.error("DOM:",(await page.locator("body").innerText()).slice(0,900));
    await page.screenshot({path:join(OUT,"sdk-"+mode+"-diagnostic.png"),timeout:10000}).catch(()=>{});
    throw e;
   }
   if(errors.length)throw Error("Browser error: "+errors.join("; "));
   const gl=await page.evaluate(()=>{
    const canvas=document.querySelector("canvas");
    return {width:canvas?.width,height:canvas?.height,webgl:!!canvas?.getContext("webgl2"),ready:window.__showcaseReady};
   });
   if(!gl.webgl)throw Error("Real WebGL did not initialize for "+mode);
   await page.screenshot({path:join(OUT,"sdk-"+mode+"-3d.png"),animations:"disabled",timeout:20000});
   results.push({mode,file:"sdk-"+mode+"-3d.png",webgl:gl});
   await page.close();
  }
  await ctx.close();
 }finally{
  await browser.close();
  await new Promise(done=>server.close(done));
 }
 console.log("Real SDK WebGL screenshots:",results);
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
