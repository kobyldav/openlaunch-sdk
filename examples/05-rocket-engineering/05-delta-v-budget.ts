/**
 * Mission delta-v budget with reserves
 *
 * Aggregate named maneuver budgets and reserve fractions.
 *
 * Uses: totalDeltaVBudget
 * Network: no
 */
import { totalDeltaVBudget } from "../../src/index.js";

console.table(totalDeltaVBudget([
  { name: "Injection correction", deltaVMps: 80, reserveFraction: 0.25 },
  { name: "Mid-course corrections", deltaVMps: 120, reserveFraction: 0.5 },
  { name: "Orbit insertion", deltaVMps: 1_400, reserveFraction: 0.1 },
]));
