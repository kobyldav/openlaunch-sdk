import test from "node:test";
import assert from "node:assert/strict";
import { probeSpaceImage } from "../dist/intelligence/layer-health.js";
import { SpaceMapClient } from "../dist/intelligence/map-layers.js";

const clock=()=>new Date("2026-10-14T20:00:00.000Z");
const jpeg=new Uint8Array([0xff,0xd8,0xff,1,2]);
const png=new Uint8Array([137,80,78,71,13,10,26,10,1]);
const gibsRequest={source:"nasa-gibs",layer:"MODIS_Terra_CorrectedReflectance_TrueColor",date:"2026-10-13",z:2,x:2,y:1};
test("provider JPEG is truly fetched, not invented as a dated capture",async()=>{
 let calls=0;
 const clients={gibs:{fetchTile:async()=>{calls++;return {image:jpeg,contentType:"image/jpeg"};}},meteosat:{fetchMap:async()=>({image:png,contentType:"image/png"})}};
 const result=await probeSpaceImage(clients,gibsRequest,clock);
 assert.equal(calls,1);
 assert.equal(result.status,"available");
 assert.equal(result.imageBytes,5);
 assert.equal(result.requestedTime,"2026-10-13T00:00:00.000Z");
 assert.equal(result.checkedAt,"2026-10-14T20:00:00.000Z");
 assert.equal(result.observedAt,null);
 assert.equal(result.verifiedAcquisition,false);
});
test("provider HTTP missing, failure and fake MIME remain distinct",async()=>{
 const clients={gibs:{fetchTile:async()=>{throw Error("Provider HTTP 404")}},meteosat:{fetchMap:async()=>{throw Error("timeout")}}};
 const gone=await probeSpaceImage(clients,gibsRequest,clock);
 assert.equal(gone.status,"unavailable");
 const failed=await probeSpaceImage(clients,{source:"meteosat",map:{layer:"mock",bounds3857:[1,2,3,4],width:16,height:16}},clock);
 assert.equal(failed.status,"error");
 assert.equal(failed.observedAt,null);
 const faked=await probeSpaceImage({gibs:{fetchTile:async()=>({image:new Uint8Array([60,120,109,108,62]),contentType:"image/png"})},meteosat:clients.meteosat},gibsRequest,clock);
 assert.equal(faked.status,"error");
 assert.equal(faked.imageBytes,null);
});
test("SpaceMapClient exposes one registry and opt-in provider probe",()=>{
 const client=new SpaceMapClient();
 assert.equal(client.layers().length,18);
 assert.equal(typeof client.probeImage,"function");
});
