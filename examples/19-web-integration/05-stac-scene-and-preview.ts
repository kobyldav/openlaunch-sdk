import {SpaceMapClient} from "../../src/index.js";
const scene={type:"Feature",id:"S2-DEMO-1",collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2026-10-17T10:00:00Z","eo:cloud_cover":9},
 assets:{visual:{href:"https://assets.example.test/scene.png?secret=NEVER_SEND",
  roles:["visual"],type:"image/png",gsd:10}}};
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
const sdk=new SpaceMapClient({previewAllowedHosts:["assets.example.test"],
 fetch:async(input)=>{
  const url=String(input);
  if(url.includes("/search"))
   return new Response(JSON.stringify({type:"FeatureCollection",features:[scene]}),{
    headers:{"content-type":"application/json"}});
  if(url.includes("/collections/"))
   return new Response(JSON.stringify(scene),{headers:{"content-type":"application/json"}});
  return new Response(png.slice(),{headers:{"content-type":"image/png"}});
 }});
const result=await sdk.webMapSearch({layer:"sentinel2-optical",
 area:{center:[14.42,50.08],radiusKm:10},from:"2026-10-01",to:"2026-10-20",maxResults:5});
if(result.returned!==1||JSON.stringify(result).includes("NEVER_SEND"))
 throw Error("Scene mapping or signed URL leakage");
const request=result.scenes[0]?.preview.request;
if(!request)throw Error("Missing preview selector");
const image=await sdk.fetchObservationPreview(request);
if(!image.previewVerified||image.byteLength!==png.length||image.verifiedAcquisition)
 throw Error("Preview signature verification failed");
console.log("PASS STAC scene->verified preview",image.byteLength,"bytes");
