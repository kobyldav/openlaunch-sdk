/**
 * Build a launch-watch data snapshot
 *
 * Fetch a compact dashboard snapshot while reusing one cached client.
 *
 * Uses: OpenLaunch, launches.upcoming, events.upcoming, throttle
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch({ cacheTtlMs: 5 * 60_000 });
const [launches, events, throttle] = await Promise.all([
  space.launches.upcoming({ limit: 5 }),
  space.events.upcoming({ limit: 5 }),
  space.throttle(),
]);

console.log({
  launches: launches.results.map((x) => ({ name: x.name, net: x.net.toISOString() })),
  events: events.results.map((x) => ({ name: x.name, date: x.date.toISOString() })),
  throttle,
});
