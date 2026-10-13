import type { CartesianKm } from "../orbit/types.js";

export const add = (a: CartesianKm, b: CartesianKm): CartesianKm => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: CartesianKm, b: CartesianKm): CartesianKm => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (v: CartesianKm, k: number): CartesianKm => ({ x: v.x * k, y: v.y * k, z: v.z * k });
export const dot = (a: CartesianKm, b: CartesianKm): number => a.x*b.x + a.y*b.y + a.z*b.z;
export const cross = (a: CartesianKm, b: CartesianKm): CartesianKm => ({ x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x });
export const norm = (a: CartesianKm): number => Math.hypot(a.x, a.y, a.z);
export function unit(v: CartesianKm): CartesianKm {
  const n = norm(v);
  if (!(n > 0)) throw new RangeError("Cannot normalize a zero or invalid vector");
  return scale(v, 1/n);
}
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(name + " must be finite");
}
export const rad = (degrees: number): number => degrees * Math.PI / 180;
export const deg = (radians: number): number => radians * 180 / Math.PI;
