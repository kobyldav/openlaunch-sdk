/**
 * Search astronauts
 *
 * Search normalized astronaut records and use optional career fields safely.
 *
 * Uses: OpenLaunch, astronauts.search
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const page = await space.astronauts.search("Williams", { limit: 10 });
for (const astronaut of page.results) {
  console.log(astronaut.name, astronaut.agency?.name, astronaut.flightsCount ?? "unknown flights");
}
