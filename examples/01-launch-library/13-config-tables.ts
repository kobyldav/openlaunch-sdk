/**
 * Read LL2 configuration tables
 *
 * Configuration resources expose reference tables such as launch statuses, orbit types and mission types.
 *
 * Uses: OpenLaunch, config, ConfigResource
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const [statuses, orbits, missionTypes] = await Promise.all([
  space.config.launchStatuses.list(),
  space.config.orbits.list(),
  space.config.missionTypes.list(),
]);

console.log({ statuses: statuses.length, orbits: orbits.length, missionTypes: missionTypes.length });
