/**
 * Search normalized resources
 *
 * Use high-level search helpers instead of constructing raw query parameters.
 *
 * Uses: OpenLaunch, launches.search, rockets.search
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const [launches, rockets] = await Promise.all([
  space.launches.search("Starlink", { limit: 5 }),
  space.rockets.search("Falcon", { limit: 5 }),
]);

console.log("Launches:", launches.results.map((item) => item.name));
console.log("Rockets:", rockets.results.map((item) => item.fullName ?? item.name));
