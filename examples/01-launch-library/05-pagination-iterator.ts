/**
 * Stream pages with an async iterator
 *
 * Iterate across LL2 pages without manually managing offsets. maxItems prevents accidental large downloads.
 *
 * Uses: OpenLaunch, BaseResource.iterate
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
for await (const launch of space.launches.iterate({ pageSize: 10, maxItems: 25, ordering: "net" })) {
  console.log(launch.id, launch.name);
}
