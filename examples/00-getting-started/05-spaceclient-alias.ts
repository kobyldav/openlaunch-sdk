/**
 * Use the SpaceClient alias
 *
 * OpenLaunch is also exported as SpaceClient for compatibility and descriptive naming.
 *
 * Uses: SpaceClient
 * Network: yes
 */
import { SpaceClient } from "../../src/index.js";

const space = new SpaceClient();
const next = await space.launches.next();
console.log(next?.name ?? "No upcoming launch");
