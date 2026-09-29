/**
 * Fetch the next launch
 *
 * Smallest useful LL2 example: create a client and fetch the next normalized launch.
 *
 * Uses: OpenLaunch, launches.next
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const launch = await space.launches.next();

if (!launch) {
  console.log("No upcoming launch found.");
} else {
  console.log({
    name: launch.name,
    net: launch.net.toISOString(),
    status: launch.status.name,
    rocket: launch.rocket?.fullName ?? launch.rocket?.name,
    agency: launch.provider?.name,
    pad: launch.pad?.name,
  });
}
