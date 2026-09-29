/**
 * Patched-conic Earth departure
 *
 * Estimate injection from a circular Earth parking orbit onto an Earth-to-Mars heliocentric transfer.
 *
 * Uses: BODIES, patchedConicDeparture
 * Network: no
 */
import { BODIES, patchedConicDeparture } from "../../src/index.js";

const result = patchedConicDeparture(
  BODIES.earth.semiMajorAxis,
  BODIES.mars.semiMajorAxis,
  BODIES.earth.radius + 300_000,
  BODIES.earth.mu,
  BODIES.sun.mu,
);
console.table(result);
