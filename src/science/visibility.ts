import { dot3, norm3, scale3, sub3, type Vec3 } from "./vector.js";

/** True when the line segment between two positions does not intersect a spherical body. */
export function hasLineOfSight(a: Vec3, b: Vec3, bodyRadiusM: number): boolean {
  const d = sub3(b, a);
  const dd = dot3(d, d);
  if (dd === 0) return norm3(a) > bodyRadiusM;
  const t = Math.max(0, Math.min(1, -dot3(a, d) / dd));
  const closest = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t] as const;
  return norm3(closest) > bodyRadiusM;
}

/** Cylindrical-shadow eclipse approximation: spacecraft is behind the occulting body relative to the Sun and inside its projected radius. */
export function inCylindricalEclipse(spacecraftFromBody: Vec3, sunFromBody: Vec3, bodyRadiusM: number): boolean {
  const sunDistance = norm3(sunFromBody);
  if (sunDistance === 0) return false;
  const sunHat = scale3(sunFromBody, 1 / sunDistance);
  const axial = dot3(spacecraftFromBody, sunHat);
  if (axial >= 0) return false;
  const perpendicular = sub3(spacecraftFromBody, scale3(sunHat, axial));
  return norm3(perpendicular) < bodyRadiusM;
}

export function angularSeparationRad(a: Vec3, b: Vec3): number {
  const denom = norm3(a) * norm3(b);
  return denom === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot3(a, b) / denom)));
}

export function occultedBySphere(observer: Vec3, target: Vec3, bodyCenter: Vec3, bodyRadiusM: number): boolean {
  return !hasLineOfSight(sub3(observer, bodyCenter), sub3(target, bodyCenter), bodyRadiusM);
}
