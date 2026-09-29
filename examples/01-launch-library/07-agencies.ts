/**
 * Browse launch agencies
 *
 * Read normalized agency metadata.
 *
 * Uses: OpenLaunch, agencies.list
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const page = await space.agencies.list({ limit: 10, ordering: "name" });
console.table(page.results.map((agency) => ({ id: agency.id, name: agency.name, country: agency.country?.code })));
