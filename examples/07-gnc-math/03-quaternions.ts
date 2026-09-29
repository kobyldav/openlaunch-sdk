/**
 * Quaternion attitude rotations
 *
 * Rotate a vector with a quaternion and interpolate attitude with SLERP.
 *
 * Uses: quatFromAxisAngle, quatRotateVector, quatSlerp, quatIdentity
 * Network: no
 */
import { quatFromAxisAngle, quatIdentity, quatRotateVector, quatSlerp, toRadians } from "../../src/index.js";

const target = quatFromAxisAngle([0, 0, 1], toRadians(90));
const halfway = quatSlerp(quatIdentity(), target, 0.5);
console.log(quatRotateVector(halfway, [1, 0, 0]));
