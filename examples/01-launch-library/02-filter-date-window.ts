/**
 * Filter launches by date window
 *
 * Ask LL2 for launches inside a concrete time window using Date values.
 *
 * Uses: OpenLaunch, launches.upcoming
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const from = new Date();
const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
const page = await space.launches.upcoming({ from, to, limit: 20 });

for (const launch of page.results) {
  console.log(launch.net.toISOString(), launch.name);
}
