/**
 * Fetch ISS OMM by catalog number
 *
 * Retrieve current OMM mean elements for NORAD catalog 25544 (ISS).
 *
 * Uses: OpenLaunch, celestrak.byCatalogNumber
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const [iss] = await space.celestrak.byCatalogNumber(25544);
console.log(iss?.OBJECT_NAME, iss?.EPOCH, iss?.MEAN_MOTION);
