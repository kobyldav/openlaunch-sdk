/**
 * Hohmann transfer between circular Earth orbits
 *
 * Estimate ideal impulsive delta-v and transfer time between two circular radii.
 *
 * Uses: BODIES, hohmannTransfer
 * Network: no
 */
import { BODIES, hohmannTransfer } from "../../src/index.js";

const leo = BODIES.earth.radius + 300_000;
const high = BODIES.earth.radius + 2_000_000;
console.table(hohmannTransfer(leo, high, BODIES.earth.mu));
