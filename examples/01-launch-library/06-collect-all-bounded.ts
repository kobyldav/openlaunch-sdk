/**
 * Collect a bounded result set
 *
 * Collect multiple pages into one array while using maxItems as a safety boundary.
 *
 * Uses: OpenLaunch, BaseResource.all
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const astronauts = await space.astronauts.all({ pageSize: 25, maxItems: 100, ordering: "name" });
console.log("Collected astronauts:", astronauts.length);
