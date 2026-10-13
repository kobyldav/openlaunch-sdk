/**
 * Export a propagated orbit to Cesium CZML for 3D visualization.
 * Network: yes
 */
import {
  OpenLaunch,
  OrbitScenario,
} from "../../src/index.js";

const space = new OpenLaunch();
const satellite = await space.orbit.byCatalogNumber(25544);

if (satellite) {
  const start = new Date();
  const end = new Date(start.getTime() + 3 * 3_600_000);
  const scenario = new OrbitScenario(start, end)
    .addSatellite("iss", satellite, satellite.sourceInfo.name);

  const czml = scenario.toCzml(30);
  console.log(JSON.stringify(czml, null, 2));
}
