/**
 * Upcoming space events
 *
 * Fetch upcoming non-launch spaceflight events.
 *
 * Uses: OpenLaunch, events.upcoming
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const page = await space.events.upcoming({ limit: 10 });
for (const event of page.results) {
  console.log(event.date.toISOString(), event.type ?? "event", event.name);
}
