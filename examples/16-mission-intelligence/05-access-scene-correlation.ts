import {
  reconcileAccessWithScenes,
  type SensorAccessWindow, type StacItem,
} from "../../src/index.js";

// NETWORK: no. Demonstrates matching method, NOT verified target acquisition.
const access:SensorAccessWindow={
  start:new Date("2026-10-13T09:59:30Z"),
  closest:new Date("2026-10-13T10:00:00Z"),
  end:new Date("2026-10-13T10:00:30Z"),
  durationSeconds:60,minGroundDistanceKm:10,targetRadiusKm:0,
  swathHalfWidthKm:145,offNadirReachKm:0,requiredOffNadirDegAtClosest:0,
  satelliteAltitudeKmAtClosest:780,
  sensor:{name:"Sentinel-2 MSI",kind:"optical",nadirSwathWidthKm:290},
  geometryModel:"spherical-earth-swath",
};
const scene:StacItem={
  type:"Feature",id:"DEMO_SCENE",collection:"sentinel-2-l2a",
  geometry:null,properties:{datetime:"2026-10-13T10:00:05Z",platform:"sentinel-2c"},assets:{},
};
const report=reconcileAccessWithScenes([access],[scene],{
  expectedPlatform:"sentinel-2c",toleranceSeconds:30,
});
console.log(report.matches,report.warnings,report.acquisitionProved);
