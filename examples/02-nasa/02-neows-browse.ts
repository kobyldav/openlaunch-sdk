/**
 * Browse NASA near-Earth objects
 *
 * Browse paginated NeoWs objects using NASA DEMO_KEY by default.
 *
 * Uses: OpenLaunch, nasa.neoBrowse
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const data = await space.nasa.neoBrowse(0, 20);
console.log(data);
