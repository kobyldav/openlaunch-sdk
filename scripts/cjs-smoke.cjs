const { Sgp4Satellite } = require("../dist-cjs/index.js");

const line1 = "1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const line2 = "2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";
const sat = Sgp4Satellite.fromTle(line1, line2);
const state = sat.stateAt(new Date("2019-06-05T12:30:00Z"));

if (!Number.isFinite(state.geodetic.heightKm)) {
  throw new Error("CommonJS SGP4 smoke test returned an invalid state");
}

console.log("CommonJS SGP4 smoke passed:", state.geodetic.heightKm.toFixed(1), "km");
