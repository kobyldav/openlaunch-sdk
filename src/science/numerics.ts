import { ValidationError } from "../errors.js";

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const inverseLerp = (a: number, b: number, value: number): number => a === b ? 0 : (value - a) / (b - a);
export const remap = (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number => lerp(outMin, outMax, inverseLerp(inMin, inMax, value));
export function bisection(fn: (x: number) => number, low: number, high: number, tolerance = 1e-10, maxIterations = 100): number {
  let fl = fn(low), fh = fn(high); if (fl * fh > 0) throw new ValidationError("Bisection requires a sign change over the interval");
  for (let i = 0; i < maxIterations; i++) { const mid = (low + high) / 2, fm = fn(mid); if (Math.abs(fm) < tolerance || Math.abs(high - low) < tolerance) return mid; if (fl * fm <= 0) { high = mid; fh = fm; } else { low = mid; fl = fm; } }
  return (low + high) / 2;
}
export function newtonRaphson(fn: (x: number) => number, derivative: (x: number) => number, initial: number, tolerance = 1e-10, maxIterations = 50): number { let x = initial; for (let i = 0; i < maxIterations; i++) { const d = derivative(x); if (Math.abs(d) < 1e-15) break; const next = x - fn(x) / d; if (Math.abs(next - x) < tolerance) return next; x = next; } return x; }
export function derivativeCentral(fn: (x: number) => number, x: number, h = 1e-5): number { return (fn(x + h) - fn(x - h)) / (2 * h); }
export function integrateTrapezoid(fn: (x: number) => number, a: number, b: number, steps = 1000): number { const n = Math.max(1, Math.trunc(steps)), h = (b - a) / n; let sum = 0.5 * (fn(a) + fn(b)); for (let i = 1; i < n; i++) sum += fn(a + i * h); return sum * h; }
export function integrateSimpson(fn: (x: number) => number, a: number, b: number, steps = 1000): number { let n = Math.max(2, Math.trunc(steps)); if (n % 2) n++; const h = (b - a) / n; let sum = fn(a) + fn(b); for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * fn(a + i * h); return sum * h / 3; }
export function rk4(state: readonly number[], derivative: (state: readonly number[], t: number) => readonly number[], t: number, dt: number): number[] {
  const add = (a: readonly number[], b: readonly number[], k: number) => a.map((v, i) => v + k * (b[i] ?? 0));
  const k1 = derivative(state, t), k2 = derivative(add(state, k1, dt / 2), t + dt / 2), k3 = derivative(add(state, k2, dt / 2), t + dt / 2), k4 = derivative(add(state, k3, dt), t + dt);
  return state.map((v, i) => v + dt * ((k1[i] ?? 0) + 2 * (k2[i] ?? 0) + 2 * (k3[i] ?? 0) + (k4[i] ?? 0)) / 6);
}
