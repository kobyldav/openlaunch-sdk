/**
 * List upcoming launches
 *
 * Fetch a small page of upcoming launches and print stable normalized fields.
 *
 * Uses: OpenLaunch, launches.upcoming
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const page = await space.launches.upcoming({ limit: 5 });

console.log(`Total matching launches: ${page.count}`);
for (const launch of page.results) {
  console.log(launch.net.toISOString(), launch.name, launch.status.name);
}
