/**
 * Filter crewed launches
 *
 * Fetch only upcoming launches marked as crewed by LL2.
 *
 * Uses: OpenLaunch, launches.upcoming
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const page = await space.launches.upcoming({ isCrewed: true, limit: 20 });
console.table(page.results.map((launch) => ({ name: launch.name, net: launch.net.toISOString() })));
