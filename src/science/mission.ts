import { BODIES, PHYSICS } from "./constants.js";
import { earthRotationSurfaceSpeed } from "./geodesy.js";
import { earthMarsHohmann, patchedConicDeparture } from "./transfers.js";
import { circularVelocity, escapeVelocity } from "./orbits.js";
import { rocketEquationDeltaV } from "./rocket.js";
import { solarFluxAtDistance } from "./thermal.js";
import { lightTimeSeconds } from "./communications.js";

export interface DeltaVBudgetItem { name: string; deltaVMps: number; reserveFraction?: number; }
export function totalDeltaVBudget(items: readonly DeltaVBudgetItem[]): { nominalMps: number; withReservesMps: number } {
  const nominalMps = items.reduce((sum, item) => sum + item.deltaVMps, 0);
  const withReservesMps = items.reduce((sum, item) => sum + item.deltaVMps * (1 + (item.reserveFraction ?? 0)), 0);
  return { nominalMps, withReservesMps };
}
export const launchAzimuthForInclination = (latitudeRad: number, inclinationRad: number): number => Math.asin(Math.cos(inclinationRad) / Math.cos(latitudeRad));
export const minimumReachableInclinationDeg = (launchLatitudeDeg: number): number => Math.abs(launchLatitudeDeg);
export const rotationBoostMps = (latitudeDeg: number, eastwardComponent = 1): number => earthRotationSurfaceSpeed(latitudeDeg) * eastwardComponent;
export function leoReference(altitudeM = 200_000): { radiusM: number; circularVelocityMps: number; escapeVelocityMps: number; orbitalPeriodMinutes: number } {
  const radiusM = BODIES.earth.radius + altitudeM;
  const circularVelocityMps = circularVelocity(radiusM, BODIES.earth.mu);
  return { radiusM, circularVelocityMps, escapeVelocityMps: escapeVelocity(radiusM, BODIES.earth.mu), orbitalPeriodMinutes: 2 * Math.PI * Math.sqrt(radiusM ** 3 / BODIES.earth.mu) / 60 };
}
export function marsMissionReference(parkingAltitudeM = 200_000): Record<string, number> {
  const transfer = earthMarsHohmann();
  const departure = patchedConicDeparture(BODIES.earth.semiMajorAxis!, BODIES.mars.semiMajorAxis!, BODIES.earth.radius + parkingAltitudeM, BODIES.earth.mu);
  return {
    transferTimeDays: transfer.transferTimeDays,
    synodicPeriodDays: transfer.synodicPeriodDays,
    departurePhaseAngleDeg: transfer.departurePhaseAngleDeg,
    earthDepartureVInfinityMps: transfer.earthDepartureVInfinityMps,
    earthDepartureC3M2ps2: transfer.earthDepartureC3M2ps2,
    transMarsInjectionDeltaVMps: departure.injectionDeltaVMps,
    solarFluxAtMarsWm2: solarFluxAtDistance(BODIES.mars.semiMajorAxis!),
    oneWayLightTimeAtMeanDistanceSeconds: lightTimeSeconds(Math.abs(BODIES.mars.semiMajorAxis! - BODIES.earth.semiMajorAxis!)),
  };
}
export function payloadMassAfterDeltaV(initialMassKg: number, deltaVMps: number, ispSeconds: number): number { return initialMassKg / Math.exp(deltaVMps / (ispSeconds * PHYSICS.standardGravity)); }
export function availableDeltaV(initialMassKg: number, finalMassKg: number, ispSeconds: number): number { return rocketEquationDeltaV(initialMassKg, finalMassKg, ispSeconds); }
