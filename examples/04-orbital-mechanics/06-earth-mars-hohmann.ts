/**
 * Earth to Mars Hohmann reference
 *
 * Compute a first-order heliocentric Earth–Mars transfer reference.
 *
 * Uses: earthMarsHohmann
 * Network: no
 */
import { earthMarsHohmann } from "../../src/index.js";

console.table(earthMarsHohmann());
