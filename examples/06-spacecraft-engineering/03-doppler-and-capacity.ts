/**
 * Doppler shift and Shannon capacity
 *
 * Estimate first-order Doppler shift and theoretical channel capacity.
 *
 * Uses: dopplerShiftHz, shannonCapacityBps, dbToLinear
 * Network: no
 */
import { dbToLinear, dopplerShiftHz, shannonCapacityBps } from "../../src/index.js";

console.log("Doppler Hz:", dopplerShiftHz(8.4e9, 12_000));
console.log("Capacity bps:", shannonCapacityBps(1_000_000, dbToLinear(10)));
