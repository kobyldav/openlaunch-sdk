/**
 * Tsiolkovsky rocket equation
 *
 * Compute ideal delta-v and reverse-calculate propellant requirement for a single idealized stage.
 *
 * Uses: rocketEquationDeltaV, propellantRequired
 * Network: no
 */
import { propellantRequired, rocketEquationDeltaV } from "../../src/index.js";

console.log("delta-v m/s:", rocketEquationDeltaV(50_000, 15_000, 350));
console.log("propellant kg:", propellantRequired(50_000, 4_000, 350));
