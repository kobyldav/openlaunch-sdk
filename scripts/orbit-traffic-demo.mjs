import {
  OpenLaunch,
  OrbitScenario,
  SENSOR_PRESETS,
  bbox,
  findSensorAccessWindows,
} from "../dist/index.js";

const space = new OpenLaunch({ timeoutMs: 30_000 });
const now = new Date();

console.log("=== OpenLaunch v0.7 Orbit + Traffic demo ===");

const iss = await space.orbit.byCatalogNumber(25544);
if (!iss) throw new Error("ISS was not returned by CelesTrak");

const issState = iss.stateAt(now);
console.log("\nISS SGP4 state");
console.log({
  epoch: iss.sourceInfo.epoch.toISOString(),
  elementAgeHours: issState.sourceAgeHours,
  method: issState.propagationMethod,
  lat: issState.geodetic.latitudeDeg,
  lon: issState.geodetic.longitudeDeg,
  altitudeKm: issState.geodetic.heightKm,
});

const prague = { latitudeDeg: 50.0755, longitudeDeg: 14.4378, heightM: 250 };
const nextPass = space.orbit.nextPass(iss, prague, now, 48, 10);
console.log("\nNext ISS pass above Prague (>10 deg)");
console.log(nextPass ? {
  aos: nextPass.aos.toISOString(),
  tca: nextPass.tca.toISOString(),
  los: nextPass.los.toISOString(),
  maxElevationDeg: nextPass.maxElevationDeg,
  minRangeKm: nextPass.minRangeKm,
} : "No matching pass in search window");

const stations = await space.orbit.group("STATIONS", 100);
const nearest = space.traffic.nearestAt(iss, stations, now, 5);
console.log("\nNearest objects from CelesTrak STATIONS group");
console.table(nearest.map((item) => ({
  name: item.satellite.name,
  norad: item.satellite.noradCatalogId,
  distanceKm: item.distanceKm,
  relativeSpeedKmS: item.relativeSpeedKmS,
})));

const czechia = bbox(12.09, 48.55, 18.86, 51.06);
const sentinelMatches = await space.orbit.byName("SENTINEL-2C");
const sentinel2c = sentinelMatches[0];

if (sentinel2c) {
  const access = findSensorAccessWindows(
    sentinel2c,
    SENSOR_PRESETS.sentinel2Msi,
    {
      area: czechia,
      start: now,
      end: new Date(now.getTime() + 7 * 86_400_000),
      stepSeconds: 30,
      maxWindows: 20,
    },
  );

  console.log("\nSentinel-2C geometric swath access over Czechia");
  console.table(access.slice(0, 5).map((window) => ({
    start: window.start.toISOString(),
    closest: window.closest.toISOString(),
    end: window.end.toISOString(),
    minGroundDistanceKm: window.minGroundDistanceKm,
    requiredOffNadirDeg: window.requiredOffNadirDegAtClosest,
  })));
  console.log("Acquisition confirmed:", false);
}

const scenario = new OrbitScenario(now, new Date(now.getTime() + 90 * 60_000))
  .addSatellite("iss", iss, "ISS");
if (sentinel2c) scenario.addSatellite("sentinel-2c", sentinel2c, "Sentinel-2C");

const czml = scenario.toCzml(30);
console.log("\n3D scenario");
console.log({
  objects: scenario.list().length,
  czmlPackets: czml.length,
  interval: [scenario.start.toISOString(), scenario.end.toISOString()],
});

console.log("\nAccuracy boundary");
console.log("- SGP4/SDP4 is used for GP element propagation.");
console.log("- Relative screening reports miss distance, not collision probability.");
console.log("- Collision probability requires covariance data.");
console.log("- Sensor access is geometric swath access, not a confirmed acquisition plan.");
console.log("- Earth-fixed conversion currently uses GMST without polar-motion/EOP corrections.");
