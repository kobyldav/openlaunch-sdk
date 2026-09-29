/**
 * Complementary and low/high-pass filters
 *
 * Apply simple filters to sensor-like scalar values.
 *
 * Uses: complementaryFilter, lowPass, highPass
 * Network: no
 */
import { complementaryFilter, highPass, lowPass } from "../../src/index.js";

console.log({
  complementary: complementaryFilter(10, 0.2, 10.5, 0.01, 0.98),
  lowPass: lowPass(10, 12, 0.2),
  highPass: highPass(0.5, 12, 11, 0.9),
});
