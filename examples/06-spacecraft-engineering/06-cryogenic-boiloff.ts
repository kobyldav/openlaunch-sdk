/**
 * Cryogenic boil-off estimate
 *
 * Use a simple constant daily fractional boil-off model for architecture trades.
 *
 * Uses: boiloffMassKg, remainingAfterBoiloffKg
 * Network: no
 */
import { boiloffMassKg, remainingAfterBoiloffKg } from "../../src/index.js";

console.log({
  lostKg: boiloffMassKg(10_000, 0.001, 180),
  remainingKg: remainingAfterBoiloffKg(10_000, 0.001, 180),
});
