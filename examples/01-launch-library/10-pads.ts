/**
 * Search launch pads
 *
 * Find launch pads and print geospatial fields when available.
 *
 * Uses: OpenLaunch, pads.search
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const page = await space.pads.search("Kennedy", { limit: 10 });
console.table(page.results.map((pad) => ({ name: pad.name, location: pad.location, lat: pad.latitude, lon: pad.longitude })));
