import { BODIES } from "./constants.js";
import { circularVelocity, visVivaVelocity } from "./orbits.js";

export interface HohmannTransfer {
  transferSemiMajorAxisM: number;
  transferTimeSeconds: number;
  deltaV1Mps: number;
  deltaV2Mps: number;
  totalDeltaVMps: number;
}
export function hohmannTransfer(r1M: number, r2M: number, mu: number): HohmannTransfer {
  const a = (r1M + r2M) / 2;
  const v1 = circularVelocity(r1M, mu), v2 = circularVelocity(r2M, mu);
  const vt1 = visVivaVelocity(r1M, a, mu), vt2 = visVivaVelocity(r2M, a, mu);
  const dv1 = Math.abs(vt1 - v1), dv2 = Math.abs(v2 - vt2);
  return { transferSemiMajorAxisM: a, transferTimeSeconds: Math.PI * Math.sqrt(a ** 3 / mu), deltaV1Mps: dv1, deltaV2Mps: dv2, totalDeltaVMps: dv1 + dv2 };
}
export const synodicPeriod = (period1Seconds: number, period2Seconds: number): number => 1 / Math.abs(1 / period1Seconds - 1 / period2Seconds);
export const interplanetaryPhaseAngle = (r1M: number, r2M: number, mu = BODIES.sun.mu): number => {
  const transfer = hohmannTransfer(r1M, r2M, mu);
  const n2 = Math.sqrt(mu / r2M ** 3);
  return Math.PI - n2 * transfer.transferTimeSeconds;
};
export interface PatchedConicDeparture {
  heliocentricTransferSpeedMps: number;
  planetOrbitalSpeedMps: number;
  hyperbolicExcessMps: number;
  c3M2ps2: number;
  parkingOrbitCircularSpeedMps: number;
  injectionSpeedMps: number;
  injectionDeltaVMps: number;
}
export function patchedConicDeparture(planetOrbitRadiusM: number, targetOrbitRadiusM: number, parkingRadiusM: number, planetMu: number, starMu = BODIES.sun.mu): PatchedConicDeparture {
  const a = (planetOrbitRadiusM + targetOrbitRadiusM) / 2;
  const transferSpeed = visVivaVelocity(planetOrbitRadiusM, a, starMu);
  const planetSpeed = circularVelocity(planetOrbitRadiusM, starMu);
  const vinf = Math.abs(transferSpeed - planetSpeed);
  const parkingCircular = circularVelocity(parkingRadiusM, planetMu);
  const injection = Math.sqrt(vinf * vinf + 2 * planetMu / parkingRadiusM);
  return { heliocentricTransferSpeedMps: transferSpeed, planetOrbitalSpeedMps: planetSpeed, hyperbolicExcessMps: vinf, c3M2ps2: vinf * vinf, parkingOrbitCircularSpeedMps: parkingCircular, injectionSpeedMps: injection, injectionDeltaVMps: injection - parkingCircular };
}
export interface EarthMarsTransfer {
  transferTimeDays: number;
  synodicPeriodDays: number;
  departurePhaseAngleDeg: number;
  earthDepartureVInfinityMps: number;
  earthDepartureC3M2ps2: number;
  marsArrivalVInfinityMps: number;
}
export function earthMarsHohmann(): EarthMarsTransfer {
  const earthR = BODIES.earth.semiMajorAxis!, marsR = BODIES.mars.semiMajorAxis!;
  const transfer = hohmannTransfer(earthR, marsR, BODIES.sun.mu);
  const a = transfer.transferSemiMajorAxisM;
  const earthTransferV = visVivaVelocity(earthR, a, BODIES.sun.mu);
  const marsTransferV = visVivaVelocity(marsR, a, BODIES.sun.mu);
  const earthV = circularVelocity(earthR, BODIES.sun.mu), marsV = circularVelocity(marsR, BODIES.sun.mu);
  return {
    transferTimeDays: transfer.transferTimeSeconds / 86400,
    synodicPeriodDays: synodicPeriod(BODIES.earth.orbitalPeriod!, BODIES.mars.orbitalPeriod!) / 86400,
    departurePhaseAngleDeg: interplanetaryPhaseAngle(earthR, marsR, BODIES.sun.mu) * 180 / Math.PI,
    earthDepartureVInfinityMps: Math.abs(earthTransferV - earthV),
    earthDepartureC3M2ps2: (earthTransferV - earthV) ** 2,
    marsArrivalVInfinityMps: Math.abs(marsV - marsTransferV),
  };
}
export function gravityAssistTurningAngle(mu: number, periapsisRadiusM: number, vInfinityMps: number): number { const e = 1 + periapsisRadiusM * vInfinityMps ** 2 / mu; return 2 * Math.asin(1 / e); }
export function hyperbolicPeriapsisSpeed(mu: number, periapsisRadiusM: number, vInfinityMps: number): number { return Math.sqrt(vInfinityMps ** 2 + 2 * mu / periapsisRadiusM); }
