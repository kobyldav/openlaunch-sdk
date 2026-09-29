/**
 * Root finding and numerical integration
 *
 * Use general numerical primitives on deterministic scalar functions.
 *
 * Uses: bisection, newtonRaphson, integrateSimpson, derivativeCentral
 * Network: no
 */
import { bisection, derivativeCentral, integrateSimpson, newtonRaphson } from "../../src/index.js";

const f = (x: number) => x * x - 2;
console.log({
  sqrt2Bisection: bisection(f, 0, 2),
  sqrt2Newton: newtonRaphson(f, (x) => 2 * x, 1),
  integralSin0Pi: integrateSimpson(Math.sin, 0, Math.PI, 200),
  derivativeCosAt1: derivativeCentral(Math.cos, 1),
});
