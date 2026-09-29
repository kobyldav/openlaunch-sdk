/**
 * Matrix solve and inverse
 *
 * Solve a small linear system and verify matrix inversion utilities.
 *
 * Uses: matrixMul, inverse, solveLinear, identity
 * Network: no
 */
import { identity, inverse, matrixMul, solveLinear, type Matrix } from "../../src/index.js";

const A: Matrix = [[3, 2], [1, 2]];
const b = [5, 5];
console.log("x =", solveLinear(A, b));
console.log("A * inv(A) =", matrixMul(A, inverse(A)));
console.log("I =", identity(2));
