/**
 * Fetch the stations group
 *
 * Fetch CelesTrak STATIONS group as OMM JSON.
 *
 * Uses: OpenLaunch, celestrak.stations
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const stations = await space.celestrak.stations();
console.log("Station-like objects:", stations.length);
