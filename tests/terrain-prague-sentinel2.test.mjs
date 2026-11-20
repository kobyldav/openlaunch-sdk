import test from "node:test";
import assert from "node:assert/strict";
import {bbox} from "../dist/geo/types.js";
import {chooseSentinel2RgbScenes,fetchSentinel2RgbTile} from "../dist/eo/sentinel2-rgb.js";

const host="https://sentinel-cogs.s3.us-west-2.amazonaws.com/33/U/UR/2025/7/fixture/";
const scene=(id,cloud,override={})=>({
 type:"Feature",id,collection:"sentinel-2-l2a",geometry:null,
 properties:{datetime:"2025-07-15T10:11:12Z","eo:cloud_cover":cloud},
 assets:{red:{href:host+"B04.tif"},green:{href:host+"B03.tif"},blue:{href:host+"B02.tif"},...override}
});
const area=bbox(14.411,50.083,14.430,50.094);
function band(value){
 return {raster:{width:3,height:3,crs:"EPSG:4326",
   transform:[14.41,.01,0,50.1,0,-.01],
   values:new Float64Array(9).fill(value),unit:"native-sample"},
   requestedTiles:1,metadataBytesRead:2048,tileBytesRead:512,
   totalSourceBytes:1024,transferStrategy:"http-byte-ranges",warnings:[]};
}
test("Sentinel-2 Prague selects coherent low-cloud COG from verified public hosts",async()=>{
 let sawSearch,sawRange=0;
 const tile=await fetchSentinel2RgbTile({area,startDate:"2025-06-01",endDate:"2025-09-30",
  client:{search:async q=>{sawSearch=q;return {features:[
     scene("cloudy",80),scene("good",4),scene("fake",0,{red:{href:"https://malicious.invalid/red.tif"}})
   ]}}},
  readWindow:async (href,ao,opts)=>{
   assert.deepEqual(ao,area);
   assert.ok(opts.allowedHosts.includes(new URL(href).hostname));
   sawRange++;
   return band(href.endsWith("B04.tif")?1000:href.endsWith("B03.tif")?1400:800);
  }
 });
 assert.equal(tile.sceneId,"good");assert.equal(tile.elevationSource,"none");
 assert.equal(tile.verticalModel,null);assert.equal(tile.grid.width,3);
 assert.equal(tile.acquiredAt,"2025-07-15T10:11:12Z");
 assert.equal(sawSearch.collections[0],"sentinel-2-l2a");
 assert.equal(sawSearch.bbox[0],14.411);
 assert.equal(sawRange,3);
 assert.equal(tile.bands.red.values[0],1000);
 assert.equal(tile.bands.green.values[0],1400);
});
test("Sentinel-2 scene selection rejects fake hosts, JP2 assets and excessive cloud cover",()=>{
 const accepted=chooseSentinel2RgbScenes([
   scene("real",25),scene("cloud",85),scene("evil",0,{red:{href:"https://sentinel-cogs.s3.us-west-2.amazonaws.com.evil.invalid/B04.tif"}}),
   scene("jp2",1,{red:{href:host+"B04.jp2"}})
 ],30);
 assert.deepEqual(accepted.map(i=>i.id),["real"]);
});
test("Sentinel-2 refuses broad AOIs or invalid UTC date ranges",async()=>{
 const client={search:async()=>({features:[]})};
 await assert.rejects(()=>fetchSentinel2RgbTile({
   area:bbox(14.3,49.9,14.7,50.3),startDate:"2025-06-01",endDate:"2025-09-30",client
 }),/9 km/);
 await assert.rejects(()=>fetchSentinel2RgbTile({
   area,startDate:"2025-13-01",endDate:"2025-09-30",client
 }),/YYYY-MM-DD/);
 await assert.rejects(()=>fetchSentinel2RgbTile({
   area,startDate:"2025-06-01",endDate:"2025-09-30",client
 }),/No compatible public Sentinel-2/);
});
