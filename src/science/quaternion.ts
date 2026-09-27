import { normalize3, type Vec3 } from "./vector.js";

export type Quaternion = readonly [number, number, number, number]; // [w,x,y,z]
export const quatIdentity = (): Quaternion => [1, 0, 0, 0];
export const quatNorm = (q: Quaternion): number => Math.hypot(q[0], q[1], q[2], q[3]);
export const quatNormalize = (q: Quaternion): Quaternion => { const n = quatNorm(q); return n === 0 ? quatIdentity() : [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
export const quatConjugate = (q: Quaternion): Quaternion => [q[0], -q[1], -q[2], -q[3]];
export const quatMultiply = (a: Quaternion, b: Quaternion): Quaternion => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export const quatFromAxisAngle = (axis: Vec3, angleRad: number): Quaternion => { const n = normalize3(axis), h = angleRad / 2, s = Math.sin(h); return quatNormalize([Math.cos(h), n[0] * s, n[1] * s, n[2] * s]); };
export function quatRotateVector(q: Quaternion, v: Vec3): Vec3 { const p: Quaternion = [0, v[0], v[1], v[2]]; const r = quatMultiply(quatMultiply(q, p), quatConjugate(q)); return [r[1], r[2], r[3]]; }
export function quatFromEuler(rollRad: number, pitchRad: number, yawRad: number): Quaternion {
  const cr = Math.cos(rollRad / 2), sr = Math.sin(rollRad / 2), cp = Math.cos(pitchRad / 2), sp = Math.sin(pitchRad / 2), cy = Math.cos(yawRad / 2), sy = Math.sin(yawRad / 2);
  return quatNormalize([cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy]);
}
export function quatToEuler(qIn: Quaternion): { rollRad: number; pitchRad: number; yawRad: number } {
  const q = quatNormalize(qIn); const [w, x, y, z] = q;
  const sinr = 2 * (w * x + y * z), cosr = 1 - 2 * (x * x + y * y);
  const sinp = 2 * (w * y - z * x);
  const siny = 2 * (w * z + x * y), cosy = 1 - 2 * (y * y + z * z);
  return { rollRad: Math.atan2(sinr, cosr), pitchRad: Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp), yawRad: Math.atan2(siny, cosy) };
}
export function quatSlerp(aIn: Quaternion, bIn: Quaternion, t: number): Quaternion {
  let a = quatNormalize(aIn), b = quatNormalize(bIn); let dot = a.reduce((s, v, i) => s + v * b[i]!, 0);
  if (dot < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; dot = -dot; }
  if (dot > 0.9995) return quatNormalize([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]), a[3] + t * (b[3] - a[3])]);
  const theta0 = Math.acos(Math.max(-1, Math.min(1, dot))), theta = theta0 * t, s0 = Math.cos(theta) - dot * Math.sin(theta) / Math.sin(theta0), s1 = Math.sin(theta) / Math.sin(theta0);
  return [s0 * a[0] + s1 * b[0], s0 * a[1] + s1 * b[1], s0 * a[2] + s1 * b[2], s0 * a[3] + s1 * b[3]];
}
