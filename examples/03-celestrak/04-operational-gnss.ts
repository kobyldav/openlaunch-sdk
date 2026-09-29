/**
 * Fetch operational GPS satellites
 *
 * Read the GPS-OPS group. Useful for catalog exploration, not precision navigation.
 *
 * Uses: OpenLaunch, celestrak.gpsOperational
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const gps = await space.celestrak.gpsOperational();
console.table(gps.slice(0, 8).map((r) => ({ name: r.OBJECT_NAME, cat: r.NORAD_CAT_ID })));
