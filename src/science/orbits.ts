import { ValidationError } from "../errors.js";
import { BODIES } from "./constants.js";
import { angle3, cross3, dot3, norm3, scale3, sub3, type Vec3 } from "./vector.js";
import { normalizeRadians } from "./units.js";

export interface StateVector { positionM: Vec3; velocityMps: Vec3; }
export interface OrbitalElements {
  semiMajorAxisM: number;
  eccentricity: number;
  inclinationRad: number;
  raanRad: number;
  argumentOfPeriapsisRad: number;
  trueAnomalyRad: number;
  semiLatusRectumM: number;
  specificAngularMomentum: number;
  specificOrbitalEnergy: number;
}

export const circularVelocity = (radiusM: number, mu = BODIES.earth.mu): number => Math.sqrt(mu / radiusM);
export const escapeVelocity = (radiusM: number, mu = BODIES.earth.mu): number => Math.sqrt(2 * mu / radiusM);
export const orbitalPeriod = (semiMajorAxisM: number, mu = BODIES.earth.mu): number => 2 * Math.PI * Math.sqrt(semiMajorAxisM ** 3 / mu);
export const meanMotion = (semiMajorAxisM: number, mu = BODIES.earth.mu): number => Math.sqrt(mu / semiMajorAxisM ** 3);
export const visVivaVelocity = (radiusM: number, semiMajorAxisM: number, mu = BODIES.earth.mu): number => Math.sqrt(mu * (2 / radiusM - 1 / semiMajorAxisM));
export const specificOrbitalEnergy = (radiusM: number, velocityMps: number, mu = BODIES.earth.mu): number => velocityMps ** 2 / 2 - mu / radiusM;
export const semiMajorAxisFromEnergy = (energy: number, mu = BODIES.earth.mu): number => -mu / (2 * energy);
export const periapsisRadius = (a: number, e: number): number => a * (1 - e);
export const apoapsisRadius = (a: number, e: number): number => a * (1 + e);
export const eccentricityFromApsides = (rp: number, ra: number): number => (ra - rp) / (ra + rp);
export const semiMajorAxisFromApsides = (rp: number, ra: number): number => (rp + ra) / 2;
export const planeChangeDeltaV = (velocityMps: number, angleRad: number): number => 2 * velocityMps * Math.sin(Math.abs(angleRad) / 2);
export const sphereOfInfluence = (semiMajorAxisM: number, bodyMassKg: number, parentMassKg: number): number => semiMajorAxisM * (bodyMassKg / parentMassKg) ** (2 / 5);
export const hillSphere = (semiMajorAxisM: number, eccentricity: number, bodyMassKg: number, parentMassKg: number): number => semiMajorAxisM * (1 - eccentricity) * (bodyMassKg / (3 * parentMassKg)) ** (1 / 3);
export const hyperbolicExcessFromC3 = (c3: number): number => Math.sqrt(Math.max(0, c3));
export const c3FromHyperbolicExcess = (vInfinityMps: number): number => vInfinityMps * vInfinityMps;
export const circularOrbitAltitude = (periodSeconds: number, bodyRadiusM = BODIES.earth.radius, mu = BODIES.earth.mu): number => (mu * (periodSeconds / (2 * Math.PI)) ** 2) ** (1 / 3) - bodyRadiusM;
export const synchronousOrbitRadius = (rotationPeriodSeconds: number, mu = BODIES.earth.mu): number => (mu * (rotationPeriodSeconds / (2 * Math.PI)) ** 2) ** (1 / 3);
export const nodalPrecessionJ2 = (a: number, e: number, inclinationRad: number, j2 = 1.08262668e-3, radiusM = BODIES.earth.radius, mu = BODIES.earth.mu): number => {
  const n = meanMotion(a, mu);
  return -1.5 * j2 * n * (radiusM / a) ** 2 * Math.cos(inclinationRad) / (1 - e * e) ** 2;
};

export function stateToOrbitalElements(state: StateVector, mu = BODIES.earth.mu): OrbitalElements {
  const r = state.positionM, v = state.velocityMps;
  const rmag = norm3(r), vmag = norm3(v);
  if (rmag === 0) throw new ValidationError("Position magnitude cannot be zero");
  const h = cross3(r, v), hmag = norm3(h);
  if (hmag === 0) throw new ValidationError("Angular momentum cannot be zero");
  const k: Vec3 = [0, 0, 1];
  const n = cross3(k, h), nmag = norm3(n);
  const evec = sub3(scale3(r, (vmag * vmag - mu / rmag) / mu), scale3(v, dot3(r, v) / mu));
  const e = norm3(evec);
  const energy = specificOrbitalEnergy(rmag, vmag, mu);
  const a = Math.abs(energy) < 1e-15 ? Number.POSITIVE_INFINITY : semiMajorAxisFromEnergy(energy, mu);
  const i = Math.acos(Math.max(-1, Math.min(1, h[2] / hmag)));
  let raan = nmag < 1e-12 ? 0 : Math.atan2(n[1], n[0]);
  raan = normalizeRadians(raan);
  let argp = 0;
  if (nmag >= 1e-12 && e > 1e-12) {
    argp = angle3(n, evec);
    if (evec[2] < 0) argp = 2 * Math.PI - argp;
  }
  let nu = 0;
  if (e > 1e-12) {
    nu = angle3(evec, r);
    if (dot3(r, v) < 0) nu = 2 * Math.PI - nu;
  } else if (nmag >= 1e-12) {
    nu = angle3(n, r);
    if (r[2] < 0) nu = 2 * Math.PI - nu;
  } else {
    nu = normalizeRadians(Math.atan2(r[1], r[0]));
  }
  return {
    semiMajorAxisM: a,
    eccentricity: e,
    inclinationRad: i,
    raanRad: raan,
    argumentOfPeriapsisRad: normalizeRadians(argp),
    trueAnomalyRad: normalizeRadians(nu),
    semiLatusRectumM: hmag * hmag / mu,
    specificAngularMomentum: hmag,
    specificOrbitalEnergy: energy,
  };
}

export function orbitalElementsToState(elements: Pick<OrbitalElements, "semiMajorAxisM" | "eccentricity" | "inclinationRad" | "raanRad" | "argumentOfPeriapsisRad" | "trueAnomalyRad">, mu = BODIES.earth.mu): StateVector {
  const { semiMajorAxisM: a, eccentricity: e, inclinationRad: i, raanRad: O, argumentOfPeriapsisRad: w, trueAnomalyRad: nu } = elements;
  const p = a * (1 - e * e);
  if (!(p > 0)) throw new ValidationError("Semi-latus rectum must be positive");
  const rmag = p / (1 + e * Math.cos(nu));
  const rp: Vec3 = [rmag * Math.cos(nu), rmag * Math.sin(nu), 0];
  const factor = Math.sqrt(mu / p);
  const vp: Vec3 = [-factor * Math.sin(nu), factor * (e + Math.cos(nu)), 0];
  const cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(w), sw = Math.sin(w);
  const transform = (q: Vec3): Vec3 => [
    (cO * cw - sO * sw * ci) * q[0] + (-cO * sw - sO * cw * ci) * q[1],
    (sO * cw + cO * sw * ci) * q[0] + (-sO * sw + cO * cw * ci) * q[1],
    (sw * si) * q[0] + (cw * si) * q[1],
  ];
  return { positionM: transform(rp), velocityMps: transform(vp) };
}

export function eccentricAnomalyFromTrue(trueAnomalyRad: number, eccentricity: number): number {
  return 2 * Math.atan2(Math.sqrt(1 - eccentricity) * Math.sin(trueAnomalyRad / 2), Math.sqrt(1 + eccentricity) * Math.cos(trueAnomalyRad / 2));
}
export function meanAnomalyFromEccentric(eccentricAnomalyRad: number, eccentricity: number): number { return eccentricAnomalyRad - eccentricity * Math.sin(eccentricAnomalyRad); }
export function solveKepler(meanAnomalyRad: number, eccentricity: number, tolerance = 1e-12, maxIterations = 50): number {
  let eAnomaly = eccentricity < 0.8 ? meanAnomalyRad : Math.PI;
  for (let i = 0; i < maxIterations; i++) {
    const f = eAnomaly - eccentricity * Math.sin(eAnomaly) - meanAnomalyRad;
    const fp = 1 - eccentricity * Math.cos(eAnomaly);
    const next = eAnomaly - f / fp;
    if (Math.abs(next - eAnomaly) < tolerance) return next;
    eAnomaly = next;
  }
  return eAnomaly;
}
export function trueAnomalyFromEccentric(eccentricAnomalyRad: number, eccentricity: number): number {
  return normalizeRadians(2 * Math.atan2(Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomalyRad / 2), Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomalyRad / 2)));
}
export function propagateTwoBody(elements: OrbitalElements, deltaTimeSeconds: number, mu = BODIES.earth.mu): StateVector {
  if (elements.eccentricity >= 1) throw new ValidationError("This propagator currently supports elliptical orbits (e < 1)");
  const e0 = eccentricAnomalyFromTrue(elements.trueAnomalyRad, elements.eccentricity);
  const m0 = meanAnomalyFromEccentric(e0, elements.eccentricity);
  const m = m0 + meanMotion(elements.semiMajorAxisM, mu) * deltaTimeSeconds;
  const e = solveKepler(m, elements.eccentricity);
  const nu = trueAnomalyFromEccentric(e, elements.eccentricity);
  return orbitalElementsToState({ ...elements, trueAnomalyRad: nu }, mu);
}
