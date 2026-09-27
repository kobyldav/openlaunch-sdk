import { ValidationError } from "../errors.js";
import { add3, dot3, norm3, scale3, sub3, type Vec3 } from "./vector.js";

export interface LambertSolution {
  departureVelocityMps: Vec3;
  arrivalVelocityMps: Vec3;
  transferAngleRad: number;
  z: number;
}

export function stumpffC(z: number): number {
  if (z > 1e-8) { const s = Math.sqrt(z); return (1 - Math.cos(s)) / z; }
  if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.cosh(s) - 1) / (-z); }
  return 0.5 - z / 24 + z * z / 720 - z * z * z / 40320;
}

export function stumpffS(z: number): number {
  if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s ** 3); }
  if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s ** 3); }
  return 1 / 6 - z / 120 + z * z / 5040 - z * z * z / 362880;
}

/**
 * Single-revolution universal-variable Lambert solver.
 * Inputs are inertial position vectors in metres, time of flight in seconds and mu in m^3/s^2.
 */
export function solveLambertUniversal(
  r1: Vec3,
  r2: Vec3,
  timeOfFlightSeconds: number,
  mu: number,
  options: { prograde?: boolean; toleranceSeconds?: number; maxIterations?: number } = {},
): LambertSolution {
  if (!(timeOfFlightSeconds > 0) || !(mu > 0)) throw new ValidationError("Lambert solver requires positive time of flight and gravitational parameter");
  const r1m = norm3(r1), r2m = norm3(r2);
  if (!(r1m > 0 && r2m > 0)) throw new ValidationError("Lambert position vectors must be non-zero");
  const cosDnu = Math.max(-1, Math.min(1, dot3(r1, r2) / (r1m * r2m)));
  const crossZ = r1[0] * r2[1] - r1[1] * r2[0];
  let sinDnu = Math.sqrt(Math.max(0, 1 - cosDnu * cosDnu));
  const prograde = options.prograde ?? true;
  if ((prograde && crossZ < 0) || (!prograde && crossZ >= 0)) sinDnu = -sinDnu;
  const transferAngleRad = Math.atan2(sinDnu, cosDnu) < 0 ? Math.atan2(sinDnu, cosDnu) + 2 * Math.PI : Math.atan2(sinDnu, cosDnu);
  const denom = 1 - cosDnu;
  if (Math.abs(denom) < 1e-14) throw new ValidationError("Lambert geometry is singular for collinear same-direction vectors");
  const A = sinDnu * Math.sqrt(r1m * r2m / denom);
  if (Math.abs(A) < 1e-14) throw new ValidationError("Lambert geometry is singular");

  const tof = (z: number): number => {
    const c = stumpffC(z), s = stumpffS(z);
    if (c <= 0) return Number.NaN;
    const y = r1m + r2m + A * (z * s - 1) / Math.sqrt(c);
    if (y < 0) return Number.NaN;
    const x = Math.sqrt(y / c);
    return (x ** 3 * s + A * Math.sqrt(y)) / Math.sqrt(mu);
  };

  // Find a valid bracket by scanning a wide universal-variable domain.
  let low = -4 * Math.PI * Math.PI;
  let high = 4 * Math.PI * Math.PI;
  let fl = Number.NaN, fh = Number.NaN;
  let previousZ: number | undefined;
  let previousF: number | undefined;
  let bracketed = false;
  const scans = 800;
  for (let i = 0; i <= scans; i++) {
    const z = low + (high - low) * i / scans;
    const t = tof(z);
    if (!Number.isFinite(t)) continue;
    const f = t - timeOfFlightSeconds;
    if (previousZ !== undefined && previousF !== undefined && f * previousF <= 0) {
      low = previousZ; high = z; fl = previousF; fh = f; bracketed = true; break;
    }
    previousZ = z; previousF = f;
  }
  if (!bracketed) throw new ValidationError("Could not bracket a single-revolution Lambert solution for the requested geometry/time");

  const tolerance = options.toleranceSeconds ?? 1e-6;
  const maxIterations = options.maxIterations ?? 100;
  let z = (low + high) / 2;
  for (let i = 0; i < maxIterations; i++) {
    z = (low + high) / 2;
    const f = tof(z) - timeOfFlightSeconds;
    if (Math.abs(f) <= tolerance) break;
    if (fl * f <= 0) { high = z; fh = f; }
    else { low = z; fl = f; }
  }

  const c = stumpffC(z), s = stumpffS(z);
  const y = r1m + r2m + A * (z * s - 1) / Math.sqrt(c);
  const f = 1 - y / r1m;
  const g = A * Math.sqrt(y / mu);
  const gdot = 1 - y / r2m;
  if (Math.abs(g) < 1e-14) throw new ValidationError("Lambert solution produced singular g function");
  const departureVelocityMps = scale3(sub3(r2, scale3(r1, f)), 1 / g);
  const arrivalVelocityMps = scale3(sub3(scale3(r2, gdot), r1), 1 / g);
  return { departureVelocityMps, arrivalVelocityMps, transferAngleRad, z };
}
