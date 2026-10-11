/**
 * Predict refined AOS/TCA/LOS passes above Prague.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const satellite = await space.orbit.byCatalogNumber(25544);

if (satellite) {
  const start = new Date();
  const passes = space.orbit.passes(
    satellite,
    { latitudeDeg: 50.0755, longitudeDeg: 14.4378, heightM: 250 },
    {
      start,
      end: new Date(start.getTime() + 48 * 3_600_000),
      minElevationDeg: 10,
      stepSeconds: 30,
    },
  );

  console.table(passes.map((pass) => ({
    aos: pass.aos.toISOString(),
    tca: pass.tca.toISOString(),
    los: pass.los.toISOString(),
    maxElevationDeg: pass.maxElevationDeg,
    minRangeKm: pass.minRangeKm,
  })));
}
