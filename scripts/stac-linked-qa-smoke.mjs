import assert from "node:assert/strict";
import { SpaceMapClient } from "@openlaunchsdk/earth";
import { bbox } from "@openlaunchsdk/raster";
const area=bbox(14,50.98,14.03,51);
const item={type:"Feature",id:"S2-SMOKE",collection:"sentinel-2-l2a",
 geometry:null,properties:{datetime:"2026-10-10T10:00:00Z"},
 assets:{SCL:{href:"https://assets.example.test/SCL.tif",type:"image/tiff",roles:["data"]}}
};
const bytes=(()=>{const values=[4,8,9,3,11,6];
 const f=new Uint8Array(512),v=new DataView(f.buffer);
 f[0]=73;f[1]=73;v.setUint16(2,42,true);v.setUint32(4,8,true);
 // Tiny single-band TIFF has 13 tags incl georeference; offline smoke relies on
 // a deliberately generated 16-bit file, not just fake jpeg bytes.
 const tags=[[256,4,1,3],[257,4,1,2],[258,3,1,16],[259,3,1,1],
 [262,3,1,1],[273,4,1,0],[277,3,1,1],[278,4,1,2],
 [279,4,1,12],[284,3,1,1],[33550,12,3,0],[33922,12,6,0],
 [34735,3,8,0]];
 v.setUint16(8,tags.length,true);
 let extra=8+2+tags.length*12+4;
 extra=(extra+7)&~7;
 const attach=(tag,bytes)=>{let pos=extra;f.set(bytes,pos);extra=(extra+bytes.length+7)&~7;tags.find(t=>t[0]===tag)[3]=pos;};
 const d=(n)=>{const b=new Uint8Array(n.length*8),w=new DataView(b.buffer);n.forEach((a,i)=>w.setFloat64(i*8,a,true));return b;};
 attach(33550,d([.01,.01,0]));attach(33922,d([0,0,0,14,51,0]));
 const k=[1,1,0,1,2048,0,1,4326],kb=new Uint8Array(16),kw=new DataView(kb.buffer);
 k.forEach((a,i)=>kw.setUint16(i*2,a,true));attach(34735,kb);
 const offset=extra;tags.find(t=>t[0]===273)[3]=offset;
 tags.forEach((t,i)=>{let o=10+i*12;v.setUint16(o,t[0],true);v.setUint16(o+2,t[1],true);
 v.setUint32(o+4,t[2],true);if(t[1]===3&&t[2]===1)v.setUint16(o+8,t[3],true);
 else v.setUint32(o+8,t[3],true);});
 v.setUint32(10+tags.length*12,0);
 values.forEach((x,i)=>v.setUint16(offset+i*2,x,true));
 return f.slice(0,offset+12);
})();
let catalogs=0,ranges=0;
const sdk=new SpaceMapClient({qaAllowedHosts:["assets.example.test"],fetch:async (url,init={})=>{
 if(String(url).includes("/collections/")){catalogs++;return new Response(JSON.stringify(item));}
 const m=/bytes=(\d+)-(\d+)/.exec(init.headers?.Range??"");
 if(!m)throw new Error("Range required");
 ranges++;
 const start=Number(m[1]),end=Math.min(Number(m[2]),bytes.length-1);
 const part=bytes.slice(start,end+1);
 return new Response(part,{status:206,headers:{
  "content-range":`bytes ${start}-${end}/${bytes.length}`,
  "content-length":String(part.length),"content-type":"image/tiff"
 }});
}});
const result=await sdk.analyzeObservationQa({provider:"copernicus",collection:"sentinel-2-l2a",itemId:"S2-SMOKE",area});
assert.equal(result.quality.aoiPixelCount,6);
assert.equal(result.quality.clearPixels,2);
assert.equal(result.quality.cloudPixels,2);
assert.equal(result.verifiedPixelMask,true);
assert.equal(result.independentlyVerifiedSceneAssociation,false);
console.log("PASS OpenLaunch v1.14 STAC Linked QA Analysis");
console.log("STAC item lookups:",catalogs);
console.log("GeoTIFF ranged requests:",ranges);
console.log("AOI clear pixels:",result.quality.clearPixels);
console.log("AOI cloud pixels:",result.quality.cloudPixels);
console.log("Independent scene association:",result.independentlyVerifiedSceneAssociation);
