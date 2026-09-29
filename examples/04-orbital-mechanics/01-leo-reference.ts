/**
 * LEO reference orbit
 *
 * Compute a simple circular LEO reference around Earth.
 *
 * Uses: BODIES, leoReference
 * Network: no
 */
import { leoReference } from "../../src/index.js";

console.table(leoReference(400_000));
