/**
 * NASA DONKI space weather
 *
 * Query NASA DONKI for coronal mass ejections or other supported event types.
 *
 * Uses: OpenLaunch, nasa.donki
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const cmes = await space.nasa.donki("CME", "2026-09-01", "2026-09-10");
console.log(cmes);
