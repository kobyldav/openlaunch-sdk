/**
 * ISA 1976 atmosphere sample
 *
 * Sample the built-in standard-atmosphere model at several geometric altitudes.
 *
 * Uses: isa1976
 * Network: no
 */
import { isa1976 } from "../../src/index.js";

for (const altitudeM of [0, 10_000, 20_000, 50_000, 80_000]) {
  console.log(altitudeM, isa1976(altitudeM));
}
