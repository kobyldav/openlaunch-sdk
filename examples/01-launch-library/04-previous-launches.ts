/**
 * Read launch history
 *
 * Retrieve recent launches in reverse chronological order.
 *
 * Uses: OpenLaunch, launches.previous
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const history = await space.launches.previous({ limit: 10 });
for (const launch of history.results) {
  console.log(launch.net.toISOString(), launch.status.name, launch.name);
}
