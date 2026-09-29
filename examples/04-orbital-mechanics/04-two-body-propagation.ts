/**
 * Two-body orbit propagation
 *
 * Propagate Keplerian elements forward under an ideal two-body model.
 *
 * Uses: BODIES, stateToOrbitalElements, propagateTwoBody
 * Network: no
 */
import { BODIES, propagateTwoBody, stateToOrbitalElements } from "../../src/index.js";

const elements = stateToOrbitalElements({ positionM: [7_000_000, 0, 0], velocityMps: [0, 7_546, 0] }, BODIES.earth.mu);
const afterTenMinutes = propagateTwoBody(elements, 600, BODIES.earth.mu);
console.log(afterTenMinutes);
