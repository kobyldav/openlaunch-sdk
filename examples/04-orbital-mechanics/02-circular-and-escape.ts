/**
 * Circular and escape velocity
 *
 * Compare circular-orbit and escape speeds at a selected Earth altitude.
 *
 * Uses: BODIES, circularVelocity, escapeVelocity
 * Network: no
 */
import { BODIES, circularVelocity, escapeVelocity } from "../../src/index.js";

const radius = BODIES.earth.radius + 400_000;
console.log({
  circularMps: circularVelocity(radius, BODIES.earth.mu),
  escapeMps: escapeVelocity(radius, BODIES.earth.mu),
});
