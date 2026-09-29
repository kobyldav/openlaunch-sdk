/**
 * NASA EPIC natural imagery metadata
 *
 * Fetch EPIC image metadata. This SDK returns the provider payload without inventing a second schema.
 *
 * Uses: OpenLaunch, nasa.epicNatural, nasa.epicEnhanced
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const natural = await space.nasa.epicNatural();
const enhanced = await space.nasa.epicEnhanced();
console.log({ natural, enhanced });
