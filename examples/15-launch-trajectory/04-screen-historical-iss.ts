import { OpenLaunch } from "../../src/index.js";
import { genericLaunchModel } from "./00-model.js";

// Historical 2019 TLE and matching 2019 model date: network-free.
const line1 = "1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const line2 = "2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";

const space = new OpenLaunch();
const iss = space.orbit.fromTle(line1, line2, { name: "ISS (2019)" });
const screen = space.trajectory.screenSatellites(genericLaunchModel, [iss], {
  thresholdKm: 20_000,
  maxResults: 10,
});
console.table(screen.approaches);
console.warn(screen.warning);
