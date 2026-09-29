/**
 * Series, parallel and k-of-n reliability
 *
 * Compare reliability architectures and steady-state availability.
 *
 * Uses: seriesReliability, parallelReliability, kOfNReliability, availability
 * Network: no
 */
import { availability, kOfNReliability, parallelReliability, seriesReliability } from "../../src/index.js";

console.log({
  series: seriesReliability([0.99, 0.98, 0.995]),
  parallel: parallelReliability([0.95, 0.95]),
  twoOfThree: kOfNReliability(0.97, 2, 3),
  availability: availability(10_000, 8),
});
