/**
 * Search NASA technology transfer
 *
 * Search NASA patent/technology-transfer data.
 *
 * Uses: OpenLaunch, nasa.techTransfer
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const results = await space.nasa.techTransfer("thermal protection");
console.log(results);
