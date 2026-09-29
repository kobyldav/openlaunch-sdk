/**
 * Access the complete raw LL2 surface
 *
 * Use raw resources when LL2 exposes a field or collection not normalized by the high-level SDK yet.
 *
 * Uses: OpenLaunch, ll2, RawResource
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const landings = await space.ll2.landings.list({ limit: 5, ordering: "-id" });
const spacewalks = await space.ll2.spacewalks.list({ limit: 5, ordering: "-id" });

console.log("Landing records:", landings.results.length);
console.log("Spacewalk records:", spacewalks.results.length);
