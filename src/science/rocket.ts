import { PHYSICS } from "./constants.js";
import { ValidationError } from "../errors.js";

export interface RocketStage {
  dryMassKg: number;
  propellantMassKg: number;
  specificImpulseS: number;
  thrustN?: number;
}
export const exhaustVelocity = (specificImpulseS: number, g0 = PHYSICS.standardGravity): number => specificImpulseS * g0;
export const specificImpulseFromExhaustVelocity = (velocityMps: number, g0 = PHYSICS.standardGravity): number => velocityMps / g0;
export function rocketEquationDeltaV(initialMassKg: number, finalMassKg: number, specificImpulseS: number, g0 = PHYSICS.standardGravity): number {
  if (!(initialMassKg > finalMassKg && finalMassKg > 0)) throw new ValidationError("Require initialMassKg > finalMassKg > 0");
  return specificImpulseS * g0 * Math.log(initialMassKg / finalMassKg);
}
export const massRatioForDeltaV = (deltaVMps: number, specificImpulseS: number, g0 = PHYSICS.standardGravity): number => Math.exp(deltaVMps / (specificImpulseS * g0));
export function propellantRequired(initialMassKg: number, deltaVMps: number, specificImpulseS: number, g0 = PHYSICS.standardGravity): number { return initialMassKg * (1 - 1 / massRatioForDeltaV(deltaVMps, specificImpulseS, g0)); }
export const thrustToWeight = (thrustN: number, massKg: number, gravityMps2 = PHYSICS.standardGravity): number => thrustN / (massKg * gravityMps2);
export const massFlowRate = (thrustN: number, specificImpulseS: number, g0 = PHYSICS.standardGravity): number => thrustN / (specificImpulseS * g0);
export const burnTime = (propellantKg: number, thrustN: number, specificImpulseS: number, g0 = PHYSICS.standardGravity): number => propellantKg / massFlowRate(thrustN, specificImpulseS, g0);
export const characteristicVelocity = (chamberPressurePa: number, throatAreaM2: number, massFlowKgS: number): number => chamberPressurePa * throatAreaM2 / massFlowKgS;
export const effectiveExhaustVelocity = (thrustN: number, massFlowKgS: number): number => thrustN / massFlowKgS;
export function stageDeltaV(stage: RocketStage, payloadAboveKg = 0, g0 = PHYSICS.standardGravity): number {
  const initial = stage.dryMassKg + stage.propellantMassKg + payloadAboveKg;
  const final = stage.dryMassKg + payloadAboveKg;
  return rocketEquationDeltaV(initial, final, stage.specificImpulseS, g0);
}
export function stagedRocketDeltaV(stagesBottomToTop: readonly RocketStage[], payloadKg = 0): { totalDeltaVMps: number; perStageDeltaVMps: number[] } {
  const per: number[] = [];
  for (let i = 0; i < stagesBottomToTop.length; i++) {
    let above = payloadKg;
    for (let j = i + 1; j < stagesBottomToTop.length; j++) above += stagesBottomToTop[j]!.dryMassKg + stagesBottomToTop[j]!.propellantMassKg;
    per.push(stageDeltaV(stagesBottomToTop[i]!, above));
  }
  return { totalDeltaVMps: per.reduce((a, b) => a + b, 0), perStageDeltaVMps: per };
}
export const propellantMassFraction = (dryMassKg: number, propellantMassKg: number): number => propellantMassKg / (dryMassKg + propellantMassKg);
export const structuralCoefficient = (dryMassKg: number, propellantMassKg: number): number => dryMassKg / (dryMassKg + propellantMassKg);
export const payloadFraction = (payloadKg: number, initialMassKg: number): number => payloadKg / initialMassKg;
export const impulse = (thrustN: number, burnSeconds: number): number => thrustN * burnSeconds;
export const averageAcceleration = (thrustN: number, massKg: number, gravityMps2 = 0): number => thrustN / massKg - gravityMps2;
