/**
 * Compute observer azimuth/elevation/range and signed range rate.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const satellite = await space.orbit.byCatalogNumber(25544);

if (satellite) {
  const look = space.orbit.lookAngles(
    satellite,
    { latitudeDeg: 49.1951, longitudeDeg: 16.6068, heightM: 240 },
    new Date(),
  );
  console.log(look);
}
