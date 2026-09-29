/**
 * Linear Kalman filter
 *
 * Perform one constant-velocity predict/update cycle with a 2-state linear Kalman filter.
 *
 * Uses: LinearKalmanFilter, identity
 * Network: no
 */
import { LinearKalmanFilter, type Matrix } from "../../src/index.js";

const kf = new LinearKalmanFilter([0, 1], [[10, 0], [0, 1]]);
const dt = 1;
const F: Matrix = [[1, dt], [0, 1]];
const Q: Matrix = [[0.01, 0], [0, 0.01]];
const H: Matrix = [[1, 0]];
const R: Matrix = [[4]];

kf.predict(F, Q);
console.log(kf.update([1.2], H, R));
