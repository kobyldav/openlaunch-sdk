import test from "node:test";
import assert from "node:assert/strict";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";
import { fetchVerifiedObservationPreview } from "../dist/intelligence/observation-preview.js";

const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const jpeg=new Uint8Array([255,216,255,224,0]);
const request={provider:"copernicus",collection:"sentinel-2-l2a",itemId:"S2-CZ"};
const item=(href="https://images.example.org/preview.png")=>({
 type:"Feature",id:"S2-CZ",collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2026-10-10T10:05:00Z","eo:cloud_cover":8},
 assets:{visual:{href,roles:["visual"],type:"image/png",gsd:10}}
});
const mock=(asset,options={})=>{
 const records=[];
 const sdk=new SpaceMapClient({previewAllowedHosts:["images.example.org"],fetch:async (url,init={})=>{
  records.push({url:String(url),method:init.method,redirect:init.redirect});
  if(String(url).includes("/collections/")){
    return new Response(JSON.stringify(asset),{headers:{"content-type":"application/json"}});
  }
  return new Response(png.slice(),{headers:{"content-type":"image/png"}});
 },...options});
 return {sdk,records};
};
test("v1.10 fetches selected STAC item, downloads verified bytes and hides signed/source URL",async()=>{
 const {sdk,records}=mock(item());
 const result=await sdk.fetchObservationPreview(request);
 assert.equal(result.previewVerified,true);
 assert.equal(result.imageDelivered,true);
 assert.equal(result.decodedPixels,false);
 assert.equal(result.catalogAcquiredAt,"2026-10-10T10:05:00.000Z");
 assert.equal(result.verifiedAcquisition,false);
 assert.equal(result.contentType,"image/png");
 assert.deepEqual([...result.image],[...png]);
 assert.equal(result.byteLength,png.length);
 assert.equal(records.length,2);
 assert.match(records[0].url,/collections\/sentinel-2-l2a\/items\/S2-CZ/);
 assert.equal(records[1].method,"GET");
 assert.equal(records[1].redirect,"error");
 assert.equal(JSON.stringify({...result,image:undefined}).includes("images.example.org"),false);
});
test("v1.10 fails closed without explicit trusted preview hosts; no network calls",async()=>{
 let count=0;
 const sdk=new SpaceMapClient({fetch:async()=>{count++;throw Error("never");}});
 await assert.rejects(sdk.fetchObservationPreview(request),/previewAllowedHosts/);
 assert.equal(count,0);
});
test("v1.10 rejects arbitrary/untrusted image hosts, nonstandard ports and non-HTTPS before image fetch",async()=>{
 for(const href of ["http://images.example.org/preview.png",
 "https://evil.example/preview.png","https://images.example.org:8443/preview.png",
 "https://127.0.0.1/preview.png","javascript:alert(1)"]){
  const {sdk,records}=mock(item(href));
  await assert.rejects(sdk.fetchObservationPreview(request),/origin is not explicitly allowed/);
  assert.equal(records.length,1);
 }
});
test("v1.10 rejects spoofed image Content-Type and corrupted PNG signatures",async()=>{
 for(const [contentType,bytes] of [
  ["text/html",new TextEncoder().encode("<html>error</html>")],
  ["image/png",new TextEncoder().encode("<html>error</html>")],
  ["image/jpeg",png],
 ]){
  const sdk=new SpaceMapClient({previewAllowedHosts:["images.example.org"],fetch:async (url)=>{
   if(String(url).includes("/collections/"))return new Response(JSON.stringify(item()));
   return new Response(bytes,{headers:{"content-type":contentType}});
  }});
  await assert.rejects(sdk.fetchObservationPreview(request),/supported PNG\/JPEG|signature/);
 }
});
test("v1.10 enforces streamed maximum even without Content-Length and refuses redirects",async()=>{
 const sdk=new SpaceMapClient({previewAllowedHosts:["images.example.org"],previewMaxBytes:16,
  fetch:async url=>String(url).includes("/collections/")?
    new Response(JSON.stringify(item())):
    new Response(new Uint8Array(100),{headers:{"content-type":"image/png"}})});
 await assert.rejects(sdk.fetchObservationPreview(request),/maxBytes/);
 const bad=new SpaceMapClient({previewAllowedHosts:["images.example.org"],fetch:async url=>
   String(url).includes("/collections/")?new Response(JSON.stringify(item())):
     new Response(null,{status:302,headers:{location:"https://evil.example/steal"}})});
 await assert.rejects(bad.fetchObservationPreview(request),/Preview download failed/);
});
test("v1.10 rejects unknown collections and mismatched STAC identity",async()=>{
 const {sdk,records}=mock(item());
 await assert.rejects(sdk.fetchObservationPreview({...request,collection:"landsat-c2-l2"}),/Unsupported preview provider/);
 assert.equal(records.length,0);
 const bad=mock({...item(),id:"OTHER"});
 await assert.rejects(bad.sdk.fetchObservationPreview(request),/identity/);
 assert.equal(bad.records.length,1);
});
test("v1.10 refuses TIFF-only data and missing previews",async()=>{
 const scene={...item(),assets:{B04:{href:"https://images.example.org/b04.tif",roles:["data"],type:"image/tiff"}}};
 const {sdk}=mock(scene);
 await assert.rejects(sdk.fetchObservationPreview(request),/no supported JPEG\/PNG preview/);
});
test("v1.10 Planetary Computer optional signed preview is downloaded without leaking SAS",async()=>{
 let signing=0,downloaded=0;
 const landRequest={provider:"planetary-computer",collection:"landsat-c2-l2",itemId:"LC-CZ"};
 const lc={...item("https://unsigned.example.org/preview.png"),id:"LC-CZ",collection:"landsat-c2-l2"};
 const clients={
  copernicus:{item:async()=>{throw Error("unused")}},
  planetaryComputer:{item:async()=>lc},
  signer:{signAsset:async asset=>{signing++;assert.equal(asset.href,"https://unsigned.example.org/preview.png");
   return {...asset,href:"https://images.example.org/signed.png?sig=SECRET-SAS"};}}
 };
 const output=await fetchVerifiedObservationPreview(clients,landRequest,{
  allowedHosts:["images.example.org"],signPlanetary:true,
  fetch:async url=>{downloaded++;assert.match(String(url),/SECRET-SAS/);
   return new Response(png.slice(),{headers:{"content-type":"image/png"}});}
 });
 assert.equal(signing,1);assert.equal(downloaded,1);
 assert.equal(output.previewVerified,true);
 assert.equal(JSON.stringify({...output,image:undefined}).includes("SECRET-SAS"),false);
});
test("v1.10 trusted JPEG previews accept actual matching JPEG bytes",async()=>{
 const jpgItem={...item("https://images.example.org/photo.jpg"),assets:{
  thumbnail:{href:"https://images.example.org/photo.jpg",roles:["thumbnail"],type:"image/jpeg"}
 }};
 const sdk=new SpaceMapClient({previewAllowedHosts:["images.example.org"],fetch:async url=>
  String(url).includes("/collections/")?new Response(JSON.stringify(jpgItem)):
   new Response(jpeg.slice(),{headers:{"content-type":"image/jpeg"}})});
 const result=await sdk.fetchObservationPreview(request);
 assert.equal(result.contentType,"image/jpeg");
 assert.equal(result.byteLength,jpeg.length);
});
