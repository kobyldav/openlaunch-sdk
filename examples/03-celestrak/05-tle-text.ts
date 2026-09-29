/**
 * Request legacy TLE text
 *
 * Request text-format orbital elements when a downstream legacy tool explicitly needs TLE.
 *
 * Uses: OpenLaunch, celestrak.text
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const tle = await space.celestrak.text({ catnr: 25544 }, "TLE");
console.log(tle);
