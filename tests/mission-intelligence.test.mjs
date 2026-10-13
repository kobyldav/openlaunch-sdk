import test from "node:test";
import assert from "node:assert/strict";
import {
  bbox, point, inspectEoProduct, selectEoAssets,
  landsatC2SurfaceTemperature, landsatC2StUncertaintyKelvin,
  sentinel2SclClass, summarizeSentinel2Scl,
  ObservationDiscoveryClient, EarthIntelligenceClient,
  downloadEoPreview, downloadEoAsset,
  reconcileAccessWithScenes,
  Sgp4Satellite, SampledTemeTrajectory, auditTrajectoryAgainstCatalog,
  OpenLaunch, simulateLaunch, sweepLaunchGuidance,
  idealStagedDeltaVMps, circularSpeedAtAltitudeMps,
} from "../dist/index.js";

const at = new Date("2019-06-05T12:00:00.000Z");
const tle1="1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const tle2="2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";

const landsat = {
  type:"Feature",
  id:"LC08_MOCK",
  collection:"landsat-c2-l2",
  geometry:null,
  properties:{datetime:"2026-10-03T10:20:00Z","eo:cloud_cover":14},
  assets:{
    red:{href:"https://example.test/red.tif",type:"image/tiff",roles:["data"],gsd:30,"eo:bands":[{name:"red"}]},
    "ST_B10":{href:"https://example.test/st.tif",type:"image/tiff",roles:["data"],gsd:30},
    "QA_PIXEL":{href:"https://example.test/qa.tif",roles:["data"],gsd:30},
    thumbnail:{href:"https://example.test/preview.jpg",type:"image/jpeg",roles:["thumbnail"]},
  },
};

test("EO STAC item reveals actual asset metadata without inventing imagery or AOI clarity",()=>{
  const p=inspectEoProduct(landsat);
  assert.equal(p.sceneCloudCoverPercent,14);
  assert.equal(p.sceneCloudIsAoiSpecific,false);
  assert.deepEqual(p.availableResolutionsM,[30]);
  assert.equal(selectEoAssets(p,"thermal")[0].key,"ST_B10");
  assert.equal(selectEoAssets(p,"mask")[0].key,"QA_PIXEL");
  assert.equal(selectEoAssets(p,"preview")[0].key,"thumbnail");
  assert.equal(selectEoAssets(p,"elevation").length,0);
});

test("EO metadata does not infer a resolution absent from STAC",()=>{
  const p=inspectEoProduct({...landsat,collection:"cop-dem-glo-30",assets:{
    data:{href:"https://example.test/dem.tif",roles:["data"]},
  }});
  assert.equal(selectEoAssets(p,"elevation").length,1);
  assert.deepEqual(p.availableResolutionsM,[]);
  assert.equal(p.assets[0].resolutionSource,"unspecified");
});

test("Landsat L2 physical-temperature conversion and SCL mask avoid unsupported claims",()=>{
  assert.equal(landsatC2SurfaceTemperature(0),null);
  assert.equal(landsatC2SurfaceTemperature(65536),null);
  const temp=landsatC2SurfaceTemperature(44000);
  assert.ok(temp && temp.kelvin>200 && temp.celsius<100);
  assert.equal(temp.physicalQuantity,"land-surface-temperature");
  assert.equal(landsatC2StUncertaintyKelvin(120),1.2);
  assert.equal(sentinel2SclClass(9),"cloud");
  const result=summarizeSentinel2Scl([0,4,5,6,8,9,10,3,11,7]);
  assert.equal(result.cloudy,3);
  assert.equal(result.clear,3);
  assert.equal(result.usable,9);
  assert.equal(result.noData,1);
  assert.equal(result.clearPercentOfUsable,100/3);
});

test("Observation discovery survives one failing provider and preserves explicit error states",async()=>{
  const calls=[];
  const copernicus={stac:{search:async options=>{
    calls.push(options.collections[0]);
    if(options.collections[0]==="sentinel-1-grd") throw new Error("temporary STAC outage");
    return {type:"FeatureCollection",features:[{...landsat,collection:options.collections[0]}]};
  }}};
  const pc={stac:{search:async options=>{
    calls.push(options.collections[0]);
    return {type:"FeatureCollection",features:[{...landsat,collection:options.collections[0]}]};
  }}};
  const discovery=new ObservationDiscoveryClient(copernicus,pc);
  const report=await discovery.discover({
    area:bbox(12,49,13,50),
    from:new Date("2026-10-01"),to:new Date("2026-10-12"),
  });
  assert.equal(report.catalogOnly,true);
  assert.equal(report.scenes.length,3);
  assert.equal(report.queryStatuses.filter(x=>x.status==="error").length,1);
  assert.equal(report.newestByLayer.thermal.product.id,"LC08_MOCK");
  assert.ok(report.warnings.some(x=>/partial/i.test(x)));
  assert.ok(calls.includes("cop-dem-glo-30"));
});

test("Monitoring snapshot never confuses provider outages with complete data",async()=>{
  const client=new EarthIntelligenceClient({
    copernicus:{
      searchSentinel2:async()=>{throw new Error("Copernicus optical unavailable");},
      searchSentinel1:async()=>({features:[]}),
    },
    weather:{ conditionsAt:async()=>null },
  });
  const result=await client.monitoringSnapshot({
    area:point(14.4,50.1),
    now:new Date("2026-10-13T11:00:00Z"),
  });
  assert.equal(result.optical.length,0);
  assert.equal(result.recommendedSensor,"radar");
  assert.equal(result.sourceFailures.length,1);
  assert.ok(result.limitations.some(x=>/incomplete/i.test(x)));
});

test("Catalog time matching is not an acquisition confirmation",()=>{
  const windows=[{
    start:new Date("2026-10-13T10:00:00Z"),
    closest:new Date("2026-10-13T10:01:00Z"),
    end:new Date("2026-10-13T10:02:00Z"),
  }];
  const scene={...landsat,id:"scene",properties:{datetime:"2026-10-13T10:01:02Z",platform:"sentinel-2c"}};
  const match=reconcileAccessWithScenes(windows,[scene],{expectedPlatform:"sentinel-2c"});
  assert.equal(match.matches.length,1);
  assert.equal(match.matches[0].confidence,"time-and-platform");
  assert.equal(match.acquisitionProved,false);
  assert.equal(match.matches[0].acquisitionProvedForExactAoi,false);
  const wrong=reconcileAccessWithScenes(windows,[scene],{expectedPlatform:"sentinel-2a"});
  assert.equal(wrong.matches.length,0);
});

test("Catalog trajectory audit reveals element age, sampling warning and misses",()=>{
  const iss=Sgp4Satellite.fromTle(tle1,tle2,{name:"ISS historic"});
  const pts=[];
  for(let i=0;i<=4;i+=1){
    const t=new Date(at.getTime()+i*30_000);
    const state=iss.stateAt(t);
    pts.push({time:t,positionTemeKm:{
      x:state.positionTemeKm.x+15,
      y:state.positionTemeKm.y,
      z:state.positionTemeKm.z,
    },velocityTemeKmS:state.velocityTemeKmS});
  }
  const orbit=new SampledTemeTrajectory(pts);
  const screen=auditTrajectoryAgainstCatalog(orbit,[iss],{
    thresholdKm:20,maxEphemerisAgeHours:0.01,
  });
  assert.equal(screen.succeeded,1);
  assert.equal(screen.skipped,0);
  assert.equal(screen.operationalClearance,false);
  assert.ok(screen.encounters[0].approach.missDistanceKm>0);
  assert.ok(screen.encounters[0].warnings.some(x=>/freshness/.test(x)));
});

function model(){
  return {
    liftoff:at,
    site:{latitudeDeg:28.56,longitudeDeg:-80.58},
    durationSeconds:20,
    stepSeconds:1,
    guidance:[{timeSeconds:0,pitchDeg:90,headingDeg:90},{timeSeconds:20,pitchDeg:80,headingDeg:90}],
    vehicle:{
      name:"Generic 20s validation",
      payloadMassKg:100,dragCoefficient:0.2,referenceAreaM2:1,
      stages:[{
        name:"single",dryMassKg:200,propellantMassKg:300,
        thrustSeaLevelN:30_000,thrustVacuumN:33_000,
        ispSeaLevelS:250,ispVacuumS:280,
      }],
    },
  };
}

test("Bounded orbit guidance returns honest infeasible verdict with scored variants",()=>{
  const sdk=new OpenLaunch();
  const t={perigeeAltitudeKm:200,apogeeAltitudeKm:200,inclinationDeg:30};
  const sweep=sdk.mission.sweep(model(),t,{
    pitchOffsetsDeg:[-4,0,4],headingOffsetsDeg:[-2,2],maxCandidates:12,
  });
  assert.equal(sweep.evaluated,6);
  assert.equal(sweep.achieved,false);
  assert.equal(sweep.method,"bounded-grid-sweep");
  assert.equal(sweep.best.assessment.achieved,false);
  assert.equal(sweep.candidates.length,6);
  assert.ok(sweep.best.assessment.reasoning.length>0);
  assert.ok(idealStagedDeltaVMps(model())>0);
  assert.ok(circularSpeedAtAltitudeMps(200)>7000);
  assert.equal(sdk.mission.assess(simulateLaunch(model()),t).achieved,false);
  assert.throws(()=>sweepLaunchGuidance(model(),t,{pitchOffsetsDeg:[0,1],headingOffsetsDeg:[0,1],maxCandidates:3}),/maxCandidates/);
});

test("Preview downloader fetches actual bounded bytes without claiming decoded pixels",async()=>{
  const item={...landsat,assets:{
    preview:{href:"https://example.test/preview.png",roles:["thumbnail"],type:"image/png"},
  }};
  let actualUrl,actualRedirect;
  const result=await downloadEoPreview(item,{
    allowedHosts:["example.test"],
    fetch:async(url,init)=>{
      actualUrl=url;actualRedirect=init.redirect;
      return new Response(new Uint8Array([137,80,78,71]),{
        status:200,headers:{"content-type":"image/png","content-length":"4"},
      });
    },
  });
  assert.equal(actualUrl,"https://example.test/preview.png");
  assert.equal(actualRedirect,"error");
  assert.equal(result.sourceItemId,item.id);
  assert.equal(result.contentType,"image/png");
  assert.equal(result.byteLength,4);
  assert.equal(result.decodedPixels,false);
  assert.deepEqual([...result.bytes],[137,80,78,71]);
});

test("Image downloader enforces host allowlist and actual transfer byte limits",async()=>{
  const asset=inspectEoProduct(landsat).assets[0];
  await assert.rejects(
    downloadEoAsset(asset,{allowedHosts:["other.test"],fetch:async()=>new Response("foo")}),
    /allowedHosts/,
  );
  await assert.rejects(
    downloadEoAsset({...asset,href:"http://127.0.0.1/internal"},{fetch:async()=>new Response("foo")}),
    /HTTPS/,
  );
  await assert.rejects(
    downloadEoAsset(asset,{maxBytes:3,fetch:async()=>new Response(new Uint8Array([1,2,3,4]))}),
    /maxBytes/,
  );
});

test("Absent preview is an explicit missing capability, not a synthetic image",async()=>{
  const item={...landsat,assets:{
    b04:{href:"https://example.test/b04.tif",roles:["data"],"eo:bands":[{name:"B04"}]},
  }};
  await assert.rejects(downloadEoPreview(item),/no preview/);
});

test("Thermal discovery never treats a Landsat reflectance-only scene as temperature data",async()=>{
  const item={...landsat,assets:{
    red:{href:"https://example.test/red.tif",roles:["data"],"eo:bands":[{name:"red"}]},
  }};
  const pc={stac:{search:async()=>({features:[item]})}};
  const discovery=new ObservationDiscoveryClient({stac:{search:async()=>({features:[]})}},pc);
  const r=await discovery.discover({
    area:point(14.4,50.1),
    from:new Date("2026-09-01"),to:new Date("2026-10-13"),
    layers:["thermal"],
  });
  assert.equal(r.scenes.length,0);
  assert.equal(r.queryStatuses[0].status,"ok");
  assert.equal(r.queryStatuses[0].excludedWithoutRequiredAsset,1);
});
