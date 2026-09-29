/**
 * NASA NeoWs date feed
 *
 * Fetch NASA near-Earth-object data for a date range. Response is left raw because NASA schemas evolve independently.
 *
 * Uses: OpenLaunch, nasa.neoFeed
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const data = await space.nasa.neoFeed("2026-09-01", "2026-09-03");
console.log(data);
