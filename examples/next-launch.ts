import { OpenLaunch } from "../src/index";

const space = new OpenLaunch();
const launch = await space.launches.next();
if (!launch) {
  console.log("No upcoming launch found.");
  process.exit(0);
}
const t = space.launches.countdown(launch);
console.log(`${launch.name} — T${t.isPast ? "+" : "-"}${t.days}d ${t.hours}h ${t.minutes}m ${t.seconds}s`);
console.log(launch.rocket?.fullName ?? launch.rocket?.name ?? "Unknown rocket");
console.log(launch.webcast?.url ?? "No webcast yet");
