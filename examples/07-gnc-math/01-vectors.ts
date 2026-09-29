/**
 * 3D vector operations
 *
 * Basic vector primitives used throughout orbital and attitude calculations.
 *
 * Uses: vec3, dot3, cross3, normalize3, angle3
 * Network: no
 */
import { angle3, cross3, dot3, normalize3, vec3 } from "../../src/index.js";

const a = vec3(1, 2, 3);
const b = vec3(-2, 1, 4);
console.log({ dot: dot3(a, b), cross: cross3(a, b), unitA: normalize3(a), angleRad: angle3(a, b) });
