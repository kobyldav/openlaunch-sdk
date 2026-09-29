/**
 * Use the raw NASA provider
 *
 * Call a NASA Open API path that does not yet have a convenience method. api_key is added automatically.
 *
 * Uses: OpenLaunch, nasa.raw
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const response = await space.nasa.raw("planetary/apod", { date: "2026-09-01" });
console.log(response);
