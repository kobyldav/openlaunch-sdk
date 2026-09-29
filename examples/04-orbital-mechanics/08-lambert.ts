/**
 * Solve a Lambert transfer
 *
 * Solve a single-revolution Lambert boundary-value problem with inertial position vectors.
 *
 * Uses: BODIES, solveLambertUniversal
 * Network: no
 */
import { BODIES, solveLambertUniversal, type Vec3 } from "../../src/index.js";

const r1: Vec3 = [7_000_000, 0, 0];
const r2: Vec3 = [0, 8_000_000, 0];
const solution = solveLambertUniversal(r1, r2, 2_400, BODIES.earth.mu);
console.log(solution);
