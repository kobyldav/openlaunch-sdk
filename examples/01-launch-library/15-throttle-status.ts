/**
 * Inspect LL2 throttle status
 *
 * Read LL2 request-limit information before a data-heavy workflow.
 *
 * Uses: OpenLaunch, throttle
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const throttle = await space.throttle();
console.log(throttle ?? "Throttle endpoint did not return a recognized shape.");
