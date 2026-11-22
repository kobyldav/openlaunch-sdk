import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  SpaceMapClient, Sgp4Satellite, closestApproach, simulateLaunch,
  ndviRaster, rasterStatistics, decodeGeoTiff, elevationToLocalMesh,
  sampleRaster, pixelToWorld, lonLatToGridCrs, gridCrsToLonLat,
} from "../dist/index.js";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const requireGallery=createRequire(new URL("../tools/readme-gallery/package.json",import.meta.url));
let sharp;
try{sharp=requireGallery("sharp");}
catch{console.error("Install the renderer first: npm install --prefix tools/readme-gallery");process.exit(1);}
const W=1600,H=900;
const C={bg:"#06121e",panel:"#102436",line:"#2d4657",white:"#f1f7fc",mute:"#9cb3c3",
  cyan:"#3dd5ee",blue:"#6ca8ff",green:"#86ddb2",orange:"#ffb171",yellow:"#ffe0a2"};
const ISS1="1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const ISS2="2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";
const TEST1="1 25545U 98067B   19156.50900463  .00003075  00000-0  59442-4 0  9991";
const TEST2="2 25545  51.6433  59.2583 0008217  16.4489 347.7017 15.51174618173443";
const START=new Date("2019-06-05T12:00:00Z");
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const n=(v,p=1)=>Number(v).toFixed(p);
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const text=(x,y,s,sz=22,color=C.white,bold=false,other="")=>
  `<text x="${n(x)}" y="${n(y)}" fill="${color}" font-size="${sz}" font-family="Arial,Helvetica,sans-serif" font-weight="${bold?700:400}" ${other}>${esc(s)}</text>`;
const rect=(x,y,w,h,color,rad=0,stroke="none")=>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rad}" fill="${color}" stroke="${stroke}"/>`;
const line=(pts,color=C.cyan,w=3,extra="")=>
  `<path d="${pts.map((p,i)=>`${i?"L":"M"}${n(p[0])} ${n(p[1])}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const circle=(x,y,r,fill,stroke="none",sw=1)=>`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const metric=(x,y,label,val,accent=C.cyan)=>
  text(x,y,label.toUpperCase(),17,C.mute,true)+text(x,y+40,val,32,accent,true);
function frame(title,subtitle,body,source,accent=C.cyan){
  let stars="";
  for(let i=0;i<90;i++){const x=(Math.sin(i*98.7)*9721%1+1)%1*W,y=(Math.cos(i*41.9)*8327%1+1)%1*H;
    stars+=`<circle cx="${n(x)}" cy="${n(y)}" r="${i%5?1:1.7}" fill="#a4d9ee" opacity=".22"/>`;}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#071724"/><stop offset=".5" stop-color="#10273b"/><stop offset="1" stop-color="#071522"/></linearGradient>
  <radialGradient id="globe"><stop stop-color="#24749b"/><stop offset=".7" stop-color="#154566"/><stop offset="1" stop-color="#071827"/></radialGradient>
  <linearGradient id="shade" x2="0" y2="1"><stop stop-opacity="0"/><stop offset="1" stop-color="#06111b" stop-opacity=".46"/></linearGradient>
  <clipPath id="mapcrop"><rect x="64" y="191" width="1200" height="605" rx="13"/></clipPath>
  <clipPath id="globecrop"><circle cx="1050" cy="485" r="280"/></clipPath></defs>
  ${rect(0,0,W,H,"url(#bg)")}${rect(0,0,W,7,accent)}${stars}
  ${text(65,60,"OPENLAUNCH SDK / VISUAL EXAMPLES",18,C.mute,true,'letter-spacing="2"')}
  ${text(65,113,title,46,C.white,true)}
  ${text(68,152,subtitle,22,C.mute)}
  ${body}
  ${rect(65,842,1470,1,C.line)}
  ${text(65,878,source,17,C.mute)}
  ${text(1520,878,"OPENLAUNCHSDK",17,accent,true,'text-anchor="end"')}</svg>`;
}
function optsParse(args){
  const o={offline:false,out:path.join(ROOT,"docs/images"),date:"2026-08-15",dem:null,red:null,nir:null};
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(a==="--offline")o.offline=true;
    else if(a==="--help"||a==="-h"){console.log("Usage: npm run gallery -- [--offline] [--date YYYY-MM-DD] [--out DIR] [--dem DEM.tif] [--red RED.tif --nir NIR.tif]");process.exit(0);}
    else if(["--date","--out","--dem","--red","--nir"].includes(a)){if(!args[i+1])throw Error(`Missing ${a} value`);o[a.slice(2)]=args[++i];}
    else throw Error(`Unknown option: ${a}`);
  }
  if(Boolean(o.red)!==Boolean(o.nir))throw Error("--red and --nir must be supplied together");
  if(!/^\d{4}-\d\d-\d\d$/.test(o.date)||new Date(o.date+"T00:00:00Z").toISOString().slice(0,10)!==o.date)
    throw Error("Invalid --date");
  o.out=path.resolve(o.out);return o;
}
async function emit(out,name,svg){
  if(svg.length>22_000_000)throw Error("SVG exceeds safety limit");
  const filename=path.join(out,name+".png");
  await sharp(Buffer.from(svg),{density:96,limitInputPixels:W*H*4}).png({compressionLevel:9}).toFile(filename);
  console.log("Created",filename);
  return name+".png";
}
const v3=v=>[v.x,v.y,v.z];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>v.map(x=>x/Math.hypot(...v));
function projection(v){
  const view=norm([.52,-.73,.44]), right=norm([view[1],-view[0],0]), up=cross(view,right);
  return [1050+dot(v,right)/6371*280,485-dot(v,up)/6371*280,dot(v,view)];
}
function orbitImage(){
  const sat=Sgp4Satellite.fromTle(ISS1,ISS2,{name:"ISS historical orbit"});
  const samples=sat.groundTrack({start:START,end:new Date(START.getTime()+110*60000),stepSeconds:45});
  const state=sat.stateAt(new Date(START.getTime()+50*60000));
  const samples3=samples.map(p=>projection(v3(p.positionEcfKm)));
  let back="",front="";
  for(let i=1;i<samples3.length;i++){
    const a=samples3[i-1],b=samples3[i];
    const el=line([a,b],C.cyan,a[2]>0&&b[2]>0?4:2,a[2]>0&&b[2]>0?'opacity=".95"':'opacity=".2"');
    if(a[2]>0&&b[2]>0)front+=el;else back+=el;
  }
  const land=`<path d="M750 310l52-50 54 12 25 55-45 30-23 68-43-14z
  M850 425l34-14 40 38-13 63-35 78-40-20 8-65z
  M993 259l70-29 105 40 44 70-70 42-49-29-77 21-44-50z
  M1078 410l62 5 25 55-28 75-43 50-19-89z
  M1195 557l51 5 22 30-29 21-50-24z" fill="#689a81" opacity=".85"/>`;
  const current=projection(v3(state.positionEcfKm));
  const body=`${rect(70,213,555,545,C.panel,20,C.line)}${metric(118,283,"SATELLITE","ISS / 25544")}
    ${metric(118,400,"PROPAGATION MODEL","SGP4 / TLE",C.blue)}
    ${metric(118,518,"MODELLED ALTITUDE",`${n(state.geodetic.heightKm,1)} km`,C.green)}
    ${metric(118,637,"ELEMENT EPOCH","2019-06-05",C.yellow)}
    ${back}${circle(1050,485,280,"url(#globe)")}
    <g clip-path="url(#globecrop)">${land}<ellipse cx="1240" cy="495" rx="215" ry="305" fill="#03121f" opacity=".52"/></g>
    ${circle(1050,485,280,"none","#4b9cbb",2)}${front}
    ${circle(current[0],current[1],9,C.white,C.cyan,4)}
    ${text(670,773,"SDK groundTrack() / propagated Earth-fixed positions",18,C.mute)}`;
  return frame("Satellite orbit propagation","Historical orbital elements / calculated SGP4 states",body,
    "HISTORICAL GP ELEMENTS / NOT A LIVE SATELLITE POSITION");
}
const rocket={
  liftoff:new Date("2019-06-05T12:00:00Z"),
  site:{name:"Generic eastward launch pad",latitudeDeg:28.56,longitudeDeg:-80.58,altitudeM:3},
  durationSeconds:170,stepSeconds:1,
  guidance:[{timeSeconds:0,pitchDeg:90,headingDeg:90,throttle:1},
    {timeSeconds:20,pitchDeg:85,headingDeg:90,throttle:1},
    {timeSeconds:80,pitchDeg:50,headingDeg:90,throttle:1},
    {timeSeconds:170,pitchDeg:15,headingDeg:90,throttle:.9}],
  vehicle:{name:"Generic two-stage test vehicle",payloadMassKg:100,fairingMassKg:30,
    fairingJettisonSeconds:25,dragCoefficient:.25,referenceAreaM2:2,stages:[
      {name:"Booster",dryMassKg:1000,propellantMassKg:5000,thrustSeaLevelN:300000,thrustVacuumN:330000,
        ispSeaLevelS:250,ispVacuumS:280,coastAfterSeparationSeconds:3},
      {name:"Upper stage",dryMassKg:300,propellantMassKg:1000,thrustSeaLevelN:60000,thrustVacuumN:65000,
        ispSeaLevelS:280,ispVacuumS:310}]}
};
function plot(arr,box,ymax,color,w=4){
  const end=Math.max(1,arr.at(-1)[0]);
  return line(arr.map(p=>[box.x+p[0]/end*box.w,box.y+box.h-clamp(p[1]/ymax,0,1)*box.h]),color,w);
}
function launchImage(){
  const data=simulateLaunch(rocket),telemetry=data.telemetry;
  if(!telemetry.length)throw Error("SDK returned empty flight telemetry");
  const last=telemetry.at(-1).elapsedSeconds,maxAlt=Math.max(1,...telemetry.map(p=>p.altitudeKm));
  const maxQ=telemetry.reduce((a,b)=>a.dynamicPressurePa>b.dynamicPressurePa?a:b);
  const maxP=Math.max(1,...telemetry.map(p=>p.dynamicPressurePa/1000));
  const speed=Math.max(1,...telemetry.map(p=>p.inertialSpeedMps/1000));
  const box={x:110,y:305,w:800,h:362};
  let body=rect(70,210,900,580,C.panel,20,C.line)+rect(1000,210,530,580,C.panel,20,C.line);
  body+=text(110,266,"MODELLED FLIGHT PATH / ALTITUDE",20,C.mute,true);
  for(let i=0;i<6;i++){const y=box.y+i*box.h/5;body+=line([[box.x,y],[box.x+box.w,y]],C.line,1);}
  body+=plot(telemetry.map(p=>[p.elapsedSeconds,p.altitudeKm]),box,maxAlt,C.cyan,5);
  const x=box.x+maxQ.elapsedSeconds/last*box.w,y=box.y+box.h-maxQ.altitudeKm/maxAlt*box.h;
  body+=circle(x,y,9,C.orange,C.white,2)+line([[x,y],[x+56,y-67]],C.orange,2)+text(x+60,y-72,"MAX-Q",19,C.orange,true);
  for(const e of data.events.filter(e=>e.kind==="stage-separation")){
    const sx=box.x+e.elapsedSeconds/last*box.w;
    body+=line([[sx,box.y],[sx,box.y+box.h]],C.yellow,2,'stroke-dasharray="6 7" opacity=".55"');
  }
  body+=text(110,710,"TIME / s",18,C.mute)+text(890,710,`${n(maxAlt,1)} km peak`,20,C.cyan,true,'text-anchor="end"');
  body+=text(1040,266,"MAX DYNAMIC PRESSURE",18,C.mute,true)
    +text(1040,303,`${n(maxP,1)} kPa`,32,C.orange,true);
  body+=plot(telemetry.map(p=>[p.elapsedSeconds,p.dynamicPressurePa/1000]),
    {x:1040,y:339,w:440,h:132},maxP,C.orange,4);
  body+=text(1040,522,"INERTIAL SPEED",18,C.mute,true)
    +text(1040,559,`${n(speed,2)} km/s`,32,C.blue,true);
  body+=plot(telemetry.map(p=>[p.elapsedSeconds,p.inertialSpeedMps/1000]),
    {x:1040,y:590,w:440,h:120},speed,C.blue,4);
  return frame("Rocket launch engineering","3DOF multi-stage trajectory and telemetry calculated with OpenLaunch",body,
    "GENERIC SIMULATION / NOT A REAL VEHICLE OR FLIGHT RECORD",C.orange);
}
async function loadTiff(name){
  return decodeGeoTiff(await readFile(path.resolve(name)),{maxPixels:4_194_304,maxInputBytes:64*1024*1024});
}
function syntheticDem(N=72){
  const values=new Float64Array(N*N);
  for(let row=0;row<N;row++)for(let col=0;col<N;col++){
    const u=col/(N-1),v=row/(N-1);
    const peak=(x,y,sx,sy)=>Math.exp(-((u-x)**2/sx+(v-y)**2/sy));
    values[row*N+col]=500+1500*peak(.3,.37,.026,.058)+920*peak(.72,.67,.052,.043)
       +740*peak(.53,.17,.018,.082)+83*Math.sin(u*23+v*11)*Math.cos(v*21-u*17);
  }
  return {width:N,height:N,crs:"EPSG:3857",transform:[0,40,0,40*N,0,-40],values,source:"synthetic DEM"};
}
function projectDem(grid,N=72){
  const corners=[[0,0],[grid.width,0],[grid.width,grid.height],[0,grid.height]].map(p=>{
    const [x,y]=pixelToWorld(grid.transform,...p);
    return lonLatToGridCrs(...gridCrsToLonLat(x,y,grid.crs),"EPSG:3857");
  });
  const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const dx=(maxX-minX)/N,dy=(maxY-minY)/N;const values=new Float64Array(N*N);
  if(!(dx>0&&dy>0))throw Error("DEM has invalid georeferencing");
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){
    const [lon,lat]=gridCrsToLonLat(minX+(c+.5)*dx,maxY-(r+.5)*dy,"EPSG:3857");
    const [x,y]=lonLatToGridCrs(lon,lat,grid.crs);
    values[r*N+c]=sampleRaster(grid,x,y,"nearest");
  }
  return {width:N,height:N,crs:"EPSG:3857",transform:[minX,dx,0,maxY,0,-dy],values,source:grid.source};
}
function terrainColor(t,light){
  const a=t<.28?[35,98,84]:t<.5?[76,137,109]:t<.73?[137,153,116]:t<.89?[183,167,132]:[231,224,207];
  return `rgb(${a.map(x=>Math.round(clamp(x*light,0,255))).join(",")})`;
}
async function terrainImage(o){
  const raster=o.dem?projectDem(await loadTiff(o.dem)):syntheticDem();
  const mesh=elevationToLocalMesh(raster,{maxVertices:10000});
  const finite=Array.from(raster.values).filter(Number.isFinite);
  if(!finite.length)throw Error("DEM contains no valid heights");
  const lo=Math.min(...finite),hi=Math.max(...finite),range=Math.max(1,hi-lo),points=[];
  const sc=Math.max(Math.abs(raster.transform[1]*raster.width),Math.abs(raster.transform[5]*raster.height));
  for(let i=0;i<mesh.positions.length;i+=3){
    const x=mesh.positions[i],y=mesh.positions[i+1],z=mesh.positions[i+2];
    points.push([820+(x-y)/sc*515,545+(x+y)/sc*158-(z-lo)/range*245,z,x+y]);
  }
  const polygons=[];
  for(let i=0;i<mesh.triangles.length;i+=3){
    const a=points[mesh.triangles[i]],b=points[mesh.triangles[i+1]],c=points[mesh.triangles[i+2]];
    if(!a||!b||!c||[a,b,c].some(v=>!Number.isFinite(v[2])))continue;
    const t=((a[2]+b[2]+c[2])/3-lo)/range;
    const light=clamp(.92+((b[2]-a[2])-(c[2]-a[2]))/range*.28,.64,1.18);
    polygons.push({z:(a[3]+b[3]+c[3])/3,svg:`<polygon points="${a[0]},${a[1]} ${b[0]},${b[1]} ${c[0]},${c[1]}" fill="${terrainColor(t,light)}" stroke="#071b24" stroke-width=".55" stroke-opacity=".24"/>`});
  }
  polygons.sort((a,b)=>b.z-a.z);
  const body=rect(70,208,1460,580,C.panel,24,C.line)
     +`<ellipse cx="805" cy="710" rx="600" ry="100" fill="#03101a" opacity=".68"/>`
     +polygons.map(p=>p.svg).join("")
     +rect(108,245,374,135,"#092234",16,C.line)
     +metric(130,280,"ELEVATION RANGE",`${n(lo,0)}–${n(hi,0)} m`,C.green)
     +text(1110,288,`${mesh.triangles.length/3} triangles`,26,C.white,true)
     +text(1110,320,`${mesh.validVertices} vertices`,20,C.mute);
  return frame("Terrain reconstruction","OpenLaunch local triangle mesh from elevation samples",body,
    o.dem?"USER-SUPPLIED GEOTIFF DEM / MODEL COORDINATES IN METRES":"SYNTHETIC TEST DEM / OPENLAUNCH MESH OUTPUT",C.green);
}
function demoBands(w=480,h=320){
  const a=new Float64Array(w*h),b=new Float64Array(w*h),rgb=new Uint8Array(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=x/w,v=y/h,k=y*w+x,field=(Math.floor((u+.09*Math.sin(v*14))*13)+Math.floor(v*11))%7;
    const river=Math.abs(v-(.48+.055*Math.sin(u*11+Math.sin(u*17))))<.018;
    const veg=river?.03:clamp(.13+field*.11+.09*Math.sin(u*31)*Math.cos(v*27),.02,.9);
    a[k]=.10+.23*(1-veg);b[k]=.08+.49*veg;
    rgb.set(river?[24,66,100]:[120-67*veg,94+111*veg,58+46*veg].map(Math.round),k*3);
  }
  return {a,b,rgb};
}
function palette(v){
  if(!Number.isFinite(v))return [18,27,36];
  const cols=[[-1,[33,70,103]],[-.1,[175,153,111]],[.1,[224,198,131]],
    [.3,[160,186,106]],[.5,[80,151,97]],[.8,[23,105,78]],[1,[9,70,51]]];
  for(let i=1;i<cols.length;i++)if(v<=cols[i][0]){
    const q=clamp((v-cols[i-1][0])/(cols[i][0]-cols[i-1][0]),0,1);
    return cols[i-1][1].map((c,j)=>Math.round(c*(1-q)+cols[i][1][j]*q));
  }
  return cols.at(-1)[1];
}
async function imageUri(raw,w,h){
  const png=await sharp(Buffer.from(raw),{raw:{width:w,height:h,channels:3}}).png().toBuffer();
  return "data:image/png;base64,"+png.toString("base64");
}
async function ndviImage(o){
  let red,nir,w,h,rgb,source;
  if(o.red){
    red=await loadTiff(o.red);nir=await loadTiff(o.nir);
    if(red.crs!==nir.crs||red.width!==nir.width||red.height!==nir.height||
       red.transform.some((v,i)=>Math.abs(v-nir.transform[i])>1e-7))
      throw Error("RED and NIR inputs must have the same projection, transform and dimensions");
    w=red.width;h=red.height;rgb=new Uint8Array(w*h*3);
    const max=red.values.reduce((best,v)=>Number.isFinite(v)?Math.max(best,v):best,1);
    for(let i=0;i<w*h;i++){const v=clamp(red.values[i]/max*255,0,255);rgb.set([v,v,v],i*3);}
    source="USER GEOTIFF RED/NIR BANDS / CALIBRATION MUST BE VERIFIED";
  }else{
    w=480;h=320;const fixture=demoBands(w,h);
    red={width:w,height:h,crs:"EPSG:3857",transform:[0,10,0,h*10,0,-10],values:fixture.a};
    nir={...red,values:fixture.b};rgb=fixture.rgb;
    source="SYNTHETIC RED/NIR FIXTURE / SDK-COMPUTED NDVI";
  }
  const ndvi=ndviRaster(red,nir),stats=rasterStatistics(ndvi);
  const output=new Uint8Array(w*h*3);
  for(let i=0;i<ndvi.values.length;i++)output.set(palette(ndvi.values[i]),i*3);
  const original=await imageUri(rgb,w,h),processed=await imageUri(output,w,h);
  let body=rect(70,217,711,522,C.panel,20,C.line)+rect(808,217,722,522,C.panel,20,C.line);
  body+=text(98,268,o.red?"RED SPECTRAL BAND":"SYNTHETIC LAND COVER",18,C.mute,true)
    +text(832,268,"NDVI / SDK RASTER CALCULATION",18,C.green,true);
  body+=`<image x="88" y="295" width="674" height="423" href="${original}" preserveAspectRatio="xMidYMid slice"/>
    <image x="826" y="295" width="686" height="423" href="${processed}" preserveAspectRatio="xMidYMid slice"/>`;
  body+=metric(112,775,"VALID PIXELS",stats.valid.toLocaleString("en-US"),C.white);
  body+=metric(932,775,"MEAN NDVI",n(stats.mean,3),C.green);
  return frame("Vegetation index analysis","RED and NIR aligned rasters / normalized difference index",body,source,C.green);
}
function trafficImage(){
  const a=Sgp4Satellite.fromTle(ISS1,ISS2,{name:"Historical ISS"});
  const b=Sgp4Satellite.fromTle(TEST1,TEST2,{name:"Synthetic test object"});
  const end=new Date(START.getTime()+2*3600000);
  const event=closestApproach(a,b,{start:START,end,stepSeconds:60});
  const samples=[];
  for(let t=0;t<=120;t++){
    const time=new Date(START.getTime()+t*60000),p=a.stateAt(time).positionTemeKm,q=b.stateAt(time).positionTemeKm;
    samples.push([t,Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)]);
  }
  const ymax=Math.max(1,...samples.map(x=>x[1])),box={x:140,y:332,w:765,h:345};
  let body=rect(70,215,915,541,C.panel,22,C.line)+rect(1010,215,520,541,C.panel,22,C.line);
  body+=text(111,270,"RELATIVE SEPARATION / km",19,C.mute,true);
  for(let i=0;i<=5;i++){const y=box.y+i*box.h/5;
    body+=line([[box.x,y],[box.x+box.w,y]],C.line,1)+text(box.x-13,y+6,n(ymax*(5-i)/5,0),16,C.mute,false,'text-anchor="end"');}
  body+=plot(samples,box,ymax,C.cyan,5);
  const progress=clamp((event.tca-START)/(end-START),0,1);
  const x=box.x+progress*box.w,y=box.y+box.h-clamp(event.missDistanceKm/ymax,0,1)*box.h;
  body+=circle(x,y,9,C.orange,C.white,2);
  body+=metric(1052,305,"MINIMUM MODELLED RANGE",`${n(event.missDistanceKm,2)} km`,C.orange)
    +metric(1052,430,"RELATIVE SPEED",`${n(event.relativeSpeedKmS,3)} km/s`,C.cyan)
    +metric(1052,556,"TCA / UTC",event.tca.toISOString().slice(11,19),C.green);
  body+=text(1060,705,"Collision probability: not available",18,C.mute);
  return frame("Space traffic geometry","SDK SGP4 propagation and nearest-approach refinement",body,
    "HISTORICAL ISS + SYNTHETIC NEARBY TLE / NOT AN OPERATIONAL WARNING",C.orange);
}
function xyz(lon,lat,z){const n=2**z,p=lat*Math.PI/180;return [(lon+180)/360*n,(1-Math.log(Math.tan(p)+1/Math.cos(p))/Math.PI)/2*n];}
async function earthImage(o){
  const sdk=new SpaceMapClient({webMapTileMaxBytes:1_200_000,webMapTileTimeoutMs:25000,
    webMapTileCache:{maxEntries:16,maxTotalBytes:16*1024*1024}});
  const zoom=7,[fx,fy]=xyz(14.4208,50.088,zoom),x0=Math.floor(fx)-1,y0=Math.floor(fy)-1,tiles=[];
  for(let r=0;r<3;r++)for(let c=0;c<4;c++)tiles.push({layer:"nasa-modis-terra",date:o.date,z:zoom,x:x0+c,y:y0+r});
  const batch=await sdk.webMapDailyTilesBatch({tiles,concurrency:4});
  if(batch.available<9)throw Error(`Only ${batch.available}/12 NASA tiles were available for ${o.date}; try --date.`);
  let body=rect(60,190,1205,608,C.panel,16,C.line)+'<g clip-path="url(#mapcrop)">';
  for(let r=0;r<3;r++)for(let c=0;c<4;c++){
    const tile=batch.results[r*4+c],x=60+c*308,y=41+r*308;
    if(tile.status==="available"&&tile.image)
      body+=`<image x="${x}" y="${y}" width="308" height="308" href="data:${tile.contentType};base64,${Buffer.from(tile.image).toString("base64")}"/>`;
    else body+=rect(x,y,308,308,"#1d2933");
  }
  const px=60+(fx-x0)*308,py=41+(fy-y0)*308;
  body+=rect(64,191,1200,605,"url(#shade)")
    +circle(px,py,18,"#04121c",C.white,3)+circle(px,py,6,C.cyan)
    +line([[px+20,py-15],[px+70,py-70]],C.cyan,2)+text(px+75,py-76,"PRAGUE",25,C.white,true)+'</g>';
  body+=rect(1293,190,237,608,C.panel,16,C.line)
    +metric(1316,260,"PROVIDER","NASA GIBS",C.white)
    +metric(1316,382,"SOURCE","Terra MODIS",C.cyan)
    +metric(1316,502,"REQUESTED DAY",o.date,C.yellow)
    +metric(1316,623,"IMAGE TILES",`${batch.available}/12`,C.green)
    +text(1318,731,"Acquisition unverified",16,C.mute);
  return frame("Earth observation imagery","Actual NASA daily image tiles delivered through OpenLaunch SDK",body,
    "NASA EOSDIS GIBS / VERIFIED IMAGE BYTES, NOT VERIFIED ACQUISITION DATE",C.cyan);
}
async function main(){
  const o=optsParse(process.argv.slice(2));
  await mkdir(o.out,{recursive:true});
  const outputs=[],errors=[];
  const jobs=[
    ["orbital-tracking",()=>orbitImage()],
    ["launch-simulation",()=>launchImage()],
    ["terrain-model",()=>terrainImage(o)],
    ["ndvi-analysis",()=>ndviImage(o)],
    ["space-traffic",()=>trafficImage()],
    ...(!o.offline?[["earth-observation",()=>earthImage(o)]]:[]),
  ];
  for(const [name,job] of jobs){
    try{outputs.push(await emit(o.out,name,await job()));}
    catch(error){errors.push({name,error:error.message});console.error("FAILED:",name,error.message);}
  }
  const manifest={generator:"OpenLaunch gallery",generatedAt:new Date().toISOString(),offline:o.offline,
    dateRequested:o.date,outputs,errors,
    notes:["Orbit uses historical 2019 TLE.","Traffic secondary TLE is synthetic.",
      "Rocket model is generic simulation.",o.dem?"Terrain uses user GeoTIFF.":"Terrain uses synthetic DEM.",
      o.red?"NDVI uses user-provided bands; calibration is not verified.":"NDVI uses synthetic bands.",
      "NASA GIBS confirms binary delivery, not acquisition timing."]};
  await writeFile(path.join(o.out,"gallery-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  console.log(`Finished: ${outputs.length}/${jobs.length} PNG files in ${o.out}`);
  if(errors.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
