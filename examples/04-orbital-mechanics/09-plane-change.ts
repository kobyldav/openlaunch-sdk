/**
 * Plane-change delta-v
 *
 * Estimate an ideal instantaneous plane-change maneuver at a known orbital speed.
 *
 * Uses: planeChangeDeltaV, toRadians
 * Network: no
 */
import { planeChangeDeltaV, toRadians } from "../../src/index.js";

console.log("Delta-v m/s:", planeChangeDeltaV(7_700, toRadians(5)));
