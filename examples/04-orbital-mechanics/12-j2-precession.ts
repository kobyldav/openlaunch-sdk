/**
 * Estimate J2 nodal precession
 *
 * Estimate secular RAAN drift from Earth J2 for a simplified orbit.
 *
 * Uses: BODIES, nodalPrecessionJ2, toRadians
 * Network: no
 */
import { BODIES, nodalPrecessionJ2, toDegrees, toRadians } from "../../src/index.js";

const rateRadPerSecond = nodalPrecessionJ2(BODIES.earth.radius + 700_000, 0.001, toRadians(98));
console.log("deg/day:", toDegrees(rateRadPerSecond) * 86_400);
