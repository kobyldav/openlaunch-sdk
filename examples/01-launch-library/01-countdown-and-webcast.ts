/**
 * Launch countdown and webcast helpers
 *
 * Derive countdown, webcast availability and a simple live-window indicator from a normalized launch.
 *
 * Uses: OpenLaunch, launches.countdown, launches.hasWebcast, launches.isLive
 * Network: yes
 */
import { OpenLaunch } from "../../src/index.js";

const space = new OpenLaunch();
const launch = await space.launches.next();

if (launch) {
  const t = space.launches.countdown(launch);
  console.log(`T${t.isPast ? "+" : "-"}${t.days}d ${t.hours}h ${t.minutes}m ${t.seconds}s`);
  console.log("Has webcast:", space.launches.hasWebcast(launch));
  console.log("Inside live window:", space.launches.isLive(launch));
}
