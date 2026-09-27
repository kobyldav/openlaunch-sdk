export type Vec3 = readonly [number, number, number];

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normSq3 = (v: Vec3): number => dot3(v, v);
export const norm3 = (v: Vec3): number => Math.sqrt(normSq3(v));
export const distance3 = (a: Vec3, b: Vec3): number => norm3(sub3(a, b));
export const normalize3 = (v: Vec3): Vec3 => { const n = norm3(v); return n === 0 ? [0, 0, 0] : scale3(v, 1 / n); };
export const negate3 = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add3(a, scale3(sub3(b, a), t));
export const angle3 = (a: Vec3, b: Vec3): number => {
  const d = norm3(a) * norm3(b);
  return d === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot3(a, b) / d)));
};
export const project3 = (a: Vec3, onto: Vec3): Vec3 => {
  const d = normSq3(onto);
  return d === 0 ? [0, 0, 0] : scale3(onto, dot3(a, onto) / d);
};
export const reject3 = (a: Vec3, from: Vec3): Vec3 => sub3(a, project3(a, from));
export const rotateZ3 = (v: Vec3, radians: number): Vec3 => {
  const c = Math.cos(radians), s = Math.sin(radians);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
};
export const rotateX3 = (v: Vec3, radians: number): Vec3 => {
  const c = Math.cos(radians), s = Math.sin(radians);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
};
export const rotateY3 = (v: Vec3, radians: number): Vec3 => {
  const c = Math.cos(radians), s = Math.sin(radians);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
};
