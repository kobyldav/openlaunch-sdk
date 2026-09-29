/**
 * Create a custom raw resource
 *
 * Create a RawResource for a current or future LL2 endpoint without waiting for a new SDK release.
 *
 * Uses: OpenLaunch, resource
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const updates = space.resource<Record<string, unknown>>("updates");
const page = await updates.list({ limit: 5, ordering: "-id" });
console.log(page.results);
