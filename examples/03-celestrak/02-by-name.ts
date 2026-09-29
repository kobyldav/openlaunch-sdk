/**
 * Search CelesTrak by satellite name
 *
 * Retrieve OMM records using CelesTrak name matching.
 *
 * Uses: OpenLaunch, celestrak.byName
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const records = await space.celestrak.byName("HUBBLE");
console.table(records.slice(0, 10).map((r) => ({ name: r.OBJECT_NAME, cat: r.NORAD_CAT_ID, epoch: r.EPOCH })));
