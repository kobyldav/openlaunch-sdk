/**
 * Use generic normalized resources
 *
 * Use stable id/name wrappers for LL2 entities that do not yet have dedicated rich OpenLaunch types.
 *
 * Uses: OpenLaunch, spacecraft, payloads, programs
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const [spacecraft, payloads, programs] = await Promise.all([
  space.spacecraft.list({ limit: 3 }),
  space.payloads.list({ limit: 3 }),
  space.programs.list({ limit: 3 }),
]);

console.log("Spacecraft:", spacecraft.results.map((x) => x.name));
console.log("Payloads:", payloads.results.map((x) => x.name));
console.log("Programs:", programs.results.map((x) => x.name));
