import test from "node:test";
import assert from "node:assert/strict";
import {
  SpaceMapClient, OpenLaunch, bbox, nasaGibsTileTemplate,
  NasaGibsClient, GIBS_PRESETS, MeteosatClient, meteosatWmsMapUrl,
  NasaFirmsClient, parseFirmsCsv, Sentinel5pClient, s5pVisualScript,
  SpaceVideoClient, buildProcessRequest, CopernicusClient, METEOSAT_EUROPE_STREAM,
} from "../dist/index.js";
import { EarthCatalogClient } from "../dist/modular/earth.js";

test("Satellite map registry contains exactly the four web categories and unique 18 IDs",()=>{
  const sdk=new SpaceMapClient();
  const layers=sdk.layers();
  assert.equal(layers.length,18);
  assert.equal(new Set(layers.map(l=>l.id)).size,18);
  assert.deepEqual(new Set(layers.map(l=>l.category)),new Set(["observations","analyses","terrain-history","live-video"]));
  assert.ok(layers.every(l=>l.observationTime===null&&l.liveVerified===false&&l.resolutionMetres===null));
  assert.equal(sdk.layers("live-video").length,2);
  assert.equal(sdk.layer("fires-viirs").requiresKey,true);
  assert.throws(()=>sdk.layer("fake"),/Unknown space map layer/);
  layers[0].label="mutated";
  assert.notEqual(sdk.layer("sentinel2-optical").label,"mutated");
});
test("GIBS builds dated WMTS XYZ map tiles, without inventing recent acquisition",()=>{
  const d=nasaGibsTileTemplate("MODIS_Terra_CorrectedReflectance_TrueColor","2026-10-12");
  assert.equal(d.observedAt,null);
  assert.equal(d.verifiedAvailable,false);
  assert.match(d.urlTemplate,/MODIS_Terra_CorrectedReflectance_TrueColor\/default\/2026-10-12\/GoogleMapsCompatible_Level9\/\{z\}\/\{y\}\/\{x\}.jpg/);
  assert.equal(GIBS_PRESETS.length,4);
  assert.throws(()=>nasaGibsTileTemplate("madeup","2026-10-12"),/Unknown/);
  assert.throws(()=>nasaGibsTileTemplate(GIBS_PRESETS[0].id,"invalid"),/date/);
});
test("GIBS verified tile download obeys bounds, HTTPS, image MIME",async()=>{
  let called=0;
  const sdk=new NasaGibsClient({fetch:async(url,options)=>{
    called++;
    assert.match(url,/\/3\/2\/4.jpg/);
    assert.equal(options.redirect,"error");
    return new Response(new Uint8Array([0xff,0xd8,0xff,0xd9]),{headers:{"content-type":"image/jpeg"}});
  }});
  const result=await sdk.fetchTile(GIBS_PRESETS[0].id,"2026-10-12",3,4,2);
  assert.equal(called,1);assert.equal(result.image.length,4);
  await assert.rejects(sdk.fetchTile(GIBS_PRESETS[0].id,"2026-10-12",3,8,0),/coordinates/);
  const bad=new NasaGibsClient({fetch:async()=>new Response("not a tile",{headers:{"content-type":"text/html"}})});
  await assert.rejects(bad.fetchTile(GIBS_PRESETS[0].id,"2026-10-12",0,0,0),/Content-Type/);
});
test("Meteosat WMS URL preserves explicit UTC acquisition request but does not claim observed time",()=>{
  const d=meteosatWmsMapUrl({layer:"mtg:rgb",bounds3857:[1300000,6300000,1500000,6700000],width:512,height:256,time:"2026-10-13T18:00:00Z"});
  assert.equal(d.requestedTime,"2026-10-13T18:00:00.000Z");assert.equal(d.observedAt,null);
  assert.equal(d.verifiedAvailable,false);
  const url=new URL(d.url);
  assert.equal(url.searchParams.get("REQUEST"),"GetMap");
  assert.equal(url.searchParams.get("SRS"),"EPSG:3857");
  assert.equal(url.searchParams.get("TIME"),d.requestedTime);
  assert.equal(url.searchParams.get("BBOX"),"1300000,6300000,1500000,6700000");
  assert.throws(()=>meteosatWmsMapUrl({layer:"../bad",bounds3857:[0,0,10,10],width:100,height:100}),/layer/);
  assert.throws(()=>meteosatWmsMapUrl({layer:"mtg:rgb",bounds3857:[10,0,0,10],width:100,height:100}),/bounding/);
});
test("Meteosat capabilities query lists actual advertised layer IDs, never invents RGB name",async()=>{
  const calls=[];
  const fetch=async(url)=>{calls.push(url);return new Response('<WMT_MS_Capabilities><Capability><Layer><Name>demo:mtg</Name><Title>MTG</Title></Layer><Layer><Name>demo:infrared</Name></Layer></Capability></WMT_MS_Capabilities>',{headers:{"content-type":"text/xml"}})};
  const client=new MeteosatClient({fetch});
  const r=await client.capabilities();
  assert.deepEqual(r.layers.map(x=>x.id),["demo:mtg","demo:infrared"]);
  assert.match(calls[0],/GetCapabilities/);
  const invalid=new MeteosatClient({fetch:async()=>new Response('<html>unavailable</html>')});
  await assert.rejects(invalid.capabilities(),/capabilities XML/);
});
test("Meteosat refuses WMS exceptions instead of treating error as a satellite image",async()=>{
  const client=new MeteosatClient({fetch:async()=>new Response('<ServiceException>Not found</ServiceException>',{headers:{"content-type":"text/xml"}})});
  await assert.rejects(client.fetchMap({layer:"mtg:rgb",bounds3857:[0,0,10,10],width:100,height:100}),/non-image/);
});
test("FIRMS CSV parser handles quoted fields, UTC acquisition and filters bbox",()=>{
  const csv="latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,daynight,bright_ti4,frp\n"+
    '50.1,14.2,2026-10-13,935,"NOAA, 20",VIIRS,h,D,320.2,15.5\n'+
    "50.2,14.3,2026-10-13,1140,NPP,VIIRS,n,N,299.9,2.4\n"+
    "55,30,2026-10-13,0900,NPP,VIIRS,l,D,300,0.2\n"+
    "invalid,14.4,2026-10-13,0900,NPP,VIIRS,l,D,300,0.2\n";
  const result=parseFirmsCsv(csv,{bounds:[12,48,19,52]});
  assert.equal(result.items.length,2);
  assert.equal(result.ignored,1);
  assert.equal(result.items[0].acquiredAt,"2026-10-13T09:35:00.000Z");
  assert.equal(result.items[0].satellite,"NOAA, 20");
  assert.equal(result.items[0].frpMegawatts,15.5);
  assert.equal(result.items[0].detectionOnly,true);
  assert.throws(()=>parseFirmsCsv("not a firms header\n1,2,3"),/missing required column/);
});
test("FIRMS requires server-only map key and returns actual area observations",async()=>{
  let called=0;
  const client=new NasaFirmsClient("TESTMAPKEY_123",{fetch:async(url)=>{
    called++;
    assert.match(url,/\/api\/area\/csv\/TESTMAPKEY_123\/VIIRS_NOAA21_NRT\/12,48,19,52\/2/);
    return new Response("latitude,longitude,acq_date,acq_time,satellite,instrument\n50,14,2026-10-13,2350,NPP,VIIRS\n",{headers:{"content-type":"text/csv"}});
  }});
  const r=await client.hotspots([12,48,19,52],{days:2});
  assert.equal(called,1);assert.equal(r.returned,1);
  assert.equal(r.freshness,"near-real-time");
  assert.equal(r.observations[0].acquiredAt,"2026-10-13T23:50:00.000Z");
  await assert.rejects(client.hotspots([12,48,19,52],{days:6}),/between 1 and 5/);
  assert.throws(()=>new NasaFirmsClient("x"),/MAP_KEY/);
  await assert.rejects(new SpaceMapClient().activeFires([12,48,19,52]),/MAP_KEY/);
});
test("Sentinel-5P color scripts whitelist official bands and do not confuse column with surface pollution",()=>{
  const s=s5pVisualScript("NO2");
  assert.match(s,/input:\["NO2","dataMask"\]/);
  assert.match(s,/sampleType:"AUTO"/);
  assert.throws(()=>s5pVisualScript("invalid-injection"),/Unsupported/);
  const d=buildProcessRequest({area:bbox(12,48,19,52),dataType:"sentinel-5p-l2",
    from:"2026-10-13T00:00:00Z",to:"2026-10-13T23:00:00Z",
    evalscript:s,width:256,height:256,minQa:75,timeliness:"NRTI"});
  assert.equal(d.input.data[0].dataFilter.timeliness,"NRTI");
  assert.equal(d.input.data[0].processing.minQa,75);
});
test("Sentinel-5P renders actual Copernicus provider PNG response, labels timestamp unverified",async()=>{
  const observed=[];
  const cp=new CopernicusClient({accessToken:"TEST",fetch:async(url,init)=>{
    observed.push({url,body:JSON.parse(init.body)});
    return new Response(new Uint8Array([137,80,78,71]),{headers:{"content-type":"image/png"}});
  }});
  const s5p=new Sentinel5pClient(cp);
  const r=await s5p.render({area:bbox(14,49,15,50),from:"2026-10-12T00:00:00Z",to:"2026-10-13T00:00:00Z",species:"NO2",minQa:75,width:256,height:256});
  assert.deepEqual([...r.bytes],[137,80,78,71]);
  assert.equal(r.unit,"mol/m²");assert.equal(r.observedAt,null);
  assert.match(r.caution,/not ground-level concentration/);
  assert.equal(observed[0].body.input.data[0].type,"sentinel-5p-l2");
});
test("S5P STAC lookup delegates to real Copernicus collection rather than fake pixels",async()=>{
  const cp=new CopernicusClient({fetch:async(url,options)=>{
    assert.match(url,/\/v1\/search$/);
    assert.equal(JSON.parse(options.body).collections[0],"sentinel-5p-l2-no2-offl");
    return new Response(JSON.stringify({type:"FeatureCollection",features:[]}),{headers:{"content-type":"application/json"}});
  }});
  const r=await new Sentinel5pClient(cp).scenes({area:bbox(12,49,15,51),from:"2026-10-01",to:"2026-10-13"});
  assert.deepEqual(r.features,[]);
});
test("NASA ISS and Meteosat stream descriptors use official URLs with unknown uptime",()=>{
  const list=new SpaceVideoClient().list();
  assert.equal(list.length,2);
  assert.ok(list.every(s=>s.embedUrl.startsWith("https://www.youtube-nocookie.com/embed/")));
  assert.ok(list.every(s=>s.availability==="not-checked"&&s.observedAt===null&&s.isGeoreferenced===false));
  assert.equal(new SpaceVideoClient().get("meteosat-europe-live").documentedFrameIntervalMinutes,10);
  assert.equal(METEOSAT_EUROPE_STREAM.documentedDelayMinutes,30);
  assert.throws(()=>new SpaceVideoClient().get("not-a-stream"),/Unknown/);
});
test("Scene freshness is truthful about aged and absent timestamp",()=>{
  const client=new SpaceMapClient();
  const mk=datetime=>({type:"Feature",id:"scene-1",collection:"sentinel-2-l2a",
    geometry:null,properties:{datetime},assets:{}});
  const now=new Date("2026-10-14T12:00:00Z");
  const recent=client.sceneFreshness(mk("2026-10-14T11:10:00Z"),now,60);
  assert.equal(recent.freshness,"recent");assert.equal(recent.ageMinutes,50);
  const stale=client.sceneFreshness(mk("2026-10-13T11:10:00Z"),now,60);
  assert.equal(stale.freshness,"stale");assert.equal(stale.liveVerified,false);
  const unknown=client.sceneFreshness(mk(null),now);
  assert.equal(unknown.observationTime,null);assert.equal(unknown.freshness,"unknown");
  assert.equal(client.sceneFreshness(mk("2026-10-15T00:00:00Z"),now).freshness,"unknown");
});
test("Both OpenLaunch and standalone EarthCatalogClient expose map layers",()=>{
  assert.equal(new OpenLaunch().earth.maps.layers().length,18);
  assert.equal(new EarthCatalogClient().maps.layers().length,18);
});
