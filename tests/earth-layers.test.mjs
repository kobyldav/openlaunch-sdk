import test from "node:test";
import assert from "node:assert/strict";
import { earthLayerCatalog,nasaGibsTileTemplate,nasaGibsCapabilitiesUrl,issLiveSource,parseFirmsCsv,fetchFirmsHotspots,discoverAtmosphereScenes,bbox,PlanetaryComputerClient } from "../dist/index.js";
import { EarthCatalogClient } from "@openlaunch/earth";
test("Earth layer switch registry is honest about status and freshness",()=>{
 const list=earthLayerCatalog();assert.ok(list.length>=13);assert.equal(new Set(list.map(x=>x.id)).size,list.length);
 assert.equal(list.find(x=>x.id==="meteosat-clouds").implemented,false);
 assert.equal(list.find(x=>x.id==="iss-live-camera").acquisitionTime,null);
 assert.equal(list.find(x=>x.id==="sentinel-5p-no2").method,"stac");
 assert.ok(list.every(x=>x.acquisitionTime===null && x.spatialResolutionM===null));
});
test("NASA GIBS WMTS date URLs are controlled and no fabricated acquisition proof",()=>{
 const t=nasaGibsTileTemplate("nasa-modis-terra","2026-10-13");
 assert.match(t.tileTemplate,/gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/MODIS_Terra/);
 assert.match(t.tileTemplate,/2026-10-13.*\{z\}\/\{y\}\/\{x\}\.jpg/);
 assert.equal(t.actualAcquisitionVerified,false);
 assert.match(nasaGibsCapabilitiesUrl(),/WMTSCapabilities.xml/);
 assert.throws(()=>nasaGibsTileTemplate("nasa-viirs-snpp","2026-02-30"),/date/);
});
test("NASA FIRMS CSV is parsed into UTC map hotspot observations",()=>{
 const csv='latitude,longitude,acq_date,acq_time,confidence,frp\n50.1,14.3,2026-10-13,930,n,8.4\n';
 const [h]=parseFirmsCsv(csv,"VIIRS_NOAA21_NRT");
 assert.equal(h.acquiredAt,"2026-10-13T09:30:00.000Z");
 assert.equal(h.frpMw,8.4);
 assert.equal(h.latitude,50.1);
 assert.throws(()=>parseFirmsCsv("latitude,longitude\n50,14","VIIRS_NOAA21_NRT"),/missing column/);
});
test("FIRMS authenticated query uses validated bbox without leaking access in errors",async()=>{
 let called="";
 const data=await fetchFirmsHotspots({mapKey:"abcdefgh1234",area:bbox(12,48,19,52),
  fetch:async(url)=>{called=String(url);return new Response("latitude,longitude,acq_date,acq_time\n50,14,2026-10-13,1300",{headers:{"content-type":"text/csv"}});}
 });
 assert.match(called,/VIIRS_NOAA21_NRT\/12,48,19,52\/1/);assert.equal(data.length,1);
 await assert.rejects(fetchFirmsHotspots({mapKey:"bad/",area:bbox(12,48,19,52)}),/Invalid FIRMS/);
});
test("ISS video is an external NASA source not synthetic georeferenced stream",()=>{
 const v=issLiveSource();assert.equal(v.playbackType,"external-page");assert.equal(v.georeferenced,false);
 assert.equal(v.isLiveVerified,false);assert.equal(new URL(v.landingPage).hostname,"www.nasa.gov");
});
test("Atmosphere STAC discovery requires an explicit real collection",async()=>{
 const fetch=async()=>new Response(JSON.stringify({type:"FeatureCollection",features:[]}),{headers:{"content-type":"application/json"}});
 const client=new PlanetaryComputerClient({fetch,cache:false});
 const r=await discoverAtmosphereScenes("sentinel-5p-l2",bbox(12,48,19,52),new Date("2026-10-01"),new Date("2026-10-13"),client);
 assert.deepEqual(r.features,[]);
});
test("Earth standalone facade exposes layer interface",()=>{
 const sdk=new EarthCatalogClient();
 assert.ok(sdk.layers.catalog().length>5);
 assert.equal(sdk.layers.issVideo().id,"iss-live-camera");
});
