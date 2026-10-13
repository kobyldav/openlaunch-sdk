/**
 * Sample a satellite ground track for one orbit-like time window.
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const satellite = await space.orbit.byCatalogNumber(25544);

if (satellite) {
  const start = new Date();
  const track = satellite.groundTrack({
    start,
    end: new Date(start.getTime() + 100 * 60_000),
    stepSeconds: 30,
  });

  console.table(track.slice(0, 20).map((point) => ({
    time: point.time.toISOString(),
    lat: point.latitudeDeg,
    lon: point.longitudeDeg,
    altitudeKm: point.heightKm,
  })));
}
