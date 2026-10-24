import test from "node:test";
import assert from "node:assert/strict";
import {SpaceMapClient} from "../dist/intelligence/map-layers.js";
import {fetchWebMapDailyTile} from "../dist/intelligence/web-map-tile.js";

const req={layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:17,y:11};
const jpg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,255,217]);
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
function nasa(fetch){
 const calls=[];
 const sdk=new SpaceMapClient({fetch:async(url,opts)=>{
  calls.push({url:String(url),method:opts?.method,redirect:opts?.redirect,accept:opts?.headers?.Accept});
  return fetch(url,opts);
 }});
 return {sdk,calls};
}
test("v1.21 NASA GIBS actual JPEG image is verified before exposing bytes",async()=>{
 const {sdk,calls}=nasa(async()=>new Response(jpg.slice(),{
  headers:{"content-type":"image/jpeg","content-length":String(jpg.length)}
 }));
 const result=await sdk.webMapDailyTile(req);
 assert.equal(result.status,"available");
 assert.equal(result.reason,"ok");
 assert.equal(result.imageVerified,true);
 assert.equal(result.verifiedAcquisition,false);
 assert.equal(result.observedAt,null);
 assert.equal(result.contentType,"image/jpeg");
 assert.deepEqual([...result.image],[...jpg]);
 assert.equal(result.byteLength,jpg.length);
 assert.equal(result.provider,"nasa-gibs");
 assert.equal(result.attribution,"NASA EOSDIS GIBS");
 assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
 assert.equal(calls.length,1);
 assert.equal(calls[0].redirect,"error");
 assert.equal(calls[0].method,"GET");
 assert.deepEqual(calls[0].accept,"image/jpeg,image/png");
 assert.equal(calls[0].url, 
 "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-10-17/GoogleMapsCompatible_Level9/5/11/17.jpg");
 assert.equal(JSON.stringify(result).includes("gibs.earthdata.nasa.gov"),false);
});
test("v1.21 404/410 means missing tile, never a delivered satellite observation",async()=>{
 for(const code of [404,410]){
  const {sdk}=nasa(async()=>new Response("<xml>not available</xml>",{status:code}));
  const result=await sdk.webMapDailyTile(req);
  assert.equal(result.status,"missing");
  assert.equal(result.reason,"not-found");
  assert.equal(result.image,null);
  assert.equal(result.imageVerified,false);
  assert.equal(result.byteLength,0);
 }
});
test("v1.21 provider error versus missing tile is distinguished and redacted",async()=>{
 const {sdk}=nasa(async()=>new Response("<xml>SECRET_PROVIDER_TOKEN</xml>",{status:502}));
 const result=await sdk.webMapDailyTile(req);
 assert.equal(result.status,"unavailable");
 assert.equal(result.reason,"upstream-error");
 assert.equal(JSON.stringify(result).includes("SECRET_PROVIDER_TOKEN"),false);
 const thrown=nasa(async()=>{throw new Error("SECRET_PROVIDER_TOKEN")});
 const other=await thrown.sdk.webMapDailyTile(req);
 assert.equal(other.status,"unavailable");
 assert.equal(other.reason,"network-error");
 assert.equal(JSON.stringify(other).includes("SECRET_PROVIDER_TOKEN"),false);
});
test("v1.21 HTML/XML HTTP200, mismatched JPEG header and invalid content type fail closed",async()=>{
 for(const [mime,body] of [
   ["application/xml",new TextEncoder().encode("<ServiceException>no imagery</ServiceException>")],
   ["image/jpeg",new TextEncoder().encode("<html>200 but not an image</html>")],
   ["image/png",jpg],
   ["image/jpeg",png],
 ]){
  const {sdk}=nasa(async()=>new Response(body,{headers:{"content-type":mime}}));
  const out=await sdk.webMapDailyTile(req);
  assert.equal(out.status,"invalid");
  assert.equal(out.reason,"invalid-image");
  assert.equal(out.imageVerified,false);
  assert.equal(out.image,null);
 }
});
test("v1.21 valid PNG signature with MIME is delivered (when provider switches format)",async()=>{
 const {sdk}=nasa(async()=>new Response(png,{headers:{"content-type":"image/png; charset=binary"}}));
 const out=await sdk.webMapDailyTile(req);
 assert.equal(out.status,"available");
 assert.equal(out.contentType,"image/png");
 assert.deepEqual([...out.image],[...png]);
});
test("v1.21 bad zoom/XYZ, layer and budgets fail before network egress",async()=>{
 let calls=0;
 const {sdk}=nasa(async()=>{calls++;return new Response(jpg);});
 for(const change of [
  {z:10},{z:-1},{z:2.5},{x:-1},{y:-1},{x:32},{y:32},{x:Infinity},
 ]){
  await assert.rejects(sdk.webMapDailyTile({...req,...change}),/XYZ/);
 }
 await assert.rejects(sdk.webMapDailyTile({...req,layer:"unauthorized"}),/Unsupported web map daily layer/);
 await assert.rejects(fetchWebMapDailyTile(sdk,req,{fetch:async()=>{calls++;throw Error("should not");},maxBytes:2097153}),/maxBytes/);
 await assert.rejects(fetchWebMapDailyTile(sdk,req,{fetch:async()=>{calls++;throw Error("should not");},timeoutMs:30001}),/timeoutMs/);
 assert.equal(calls,0);
});
test("v1.21 stream and Content-Length caps prevent oversized downloads",async()=>{
 let chunks=0;
 const sdk=new SpaceMapClient({webMapTileMaxBytes:16,fetch:async()=>new Response(jpg,{
  headers:{"content-type":"image/jpeg","content-length":"5000"}
 })});
 const declared=await sdk.webMapDailyTile(req);
 assert.equal(declared.status,"invalid");
 assert.equal(declared.reason,"too-large");
 const stream=new ReadableStream({pull(controller){
  chunks++;controller.enqueue(new Uint8Array(10).fill(255));
  if(chunks>4)controller.close();
 }});
 const second=new SpaceMapClient({webMapTileMaxBytes:16,fetch:async()=>new Response(stream,{
  headers:{"content-type":"image/jpeg"}
 })});
 const streamed=await second.webMapDailyTile(req);
 assert.equal(streamed.status,"invalid");
 assert.equal(streamed.reason,"too-large");
 assert.equal(streamed.image,null);
});
test("v1.21 timeout is controlled, no raw exception and no URLs",async()=>{
 const {sdk}=nasa(async(_url,opts)=>{
  await new Promise((resolve,reject)=>{
   opts.signal.addEventListener("abort",()=>reject(new Error("SECRET timeout")), {once:true});
  });
  return new Response(jpg);
 });
 const out=await fetchWebMapDailyTile(sdk,req,{
  fetch:async(url,opts)=>{
   await new Promise((resolve,reject)=>opts.signal.addEventListener("abort",()=>reject(Error("secret")), {once:true}));
   return new Response(jpg);
  },timeoutMs:1
 });
 assert.equal(out.status,"unavailable");
 assert.equal(out.reason,"timeout");
 assert.equal(JSON.stringify(out).includes("secret"),false);
});
test("v1.21 tiles cannot be redirected to arbitrary provider hosts",async()=>{
 const {sdk}=nasa(async()=>Response.redirect("https://evil.example/token",302));
 const out=await sdk.webMapDailyTile(req);
 assert.equal(out.status,"unavailable");
 assert.equal(out.imageVerified,false);
});
test("v1.21 a deliberately forged descriptor never becomes an internet fetch proxy",async()=>{
 let sent=0;
 const fake={nasaDailyTiles:()=>({
  provider:"nasa-gibs",kind:"wmts-xyz",
  urlTemplate:"https://gibs.earthdata.nasa.gov.evil.example/wmts/epsg3857/best/layer/{z}/{y}/{x}.jpg",
  requestedDate:"2026-10-17",maxZoom:9,attribution:"unsafe"
 })};
 await assert.rejects(fetchWebMapDailyTile(fake,req,{fetch:async()=>{sent++;return new Response(jpg)}}),
  /Unexpected NASA (?:GIBS tile URL|map descriptor)/);
 assert.equal(sent,0);
});
