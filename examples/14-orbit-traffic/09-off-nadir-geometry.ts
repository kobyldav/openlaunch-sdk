/**
 * Explore how off-nadir pointing expands ground reach.
 * Network: no
 */
import {
  offNadirGroundReachKm,
  requiredOffNadirDeg,
} from "../../src/index.js";

for (const angleDeg of [0, 10, 20, 30, 45]) {
  console.log({
    altitudeKm: 550,
    offNadirDeg: angleDeg,
    groundReachKm: offNadirGroundReachKm(550, angleDeg),
  });
}

console.log("Required angle for 200 km cross-track target:", requiredOffNadirDeg(550, 200));
