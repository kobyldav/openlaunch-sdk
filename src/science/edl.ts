import { PHYSICS } from "./constants.js";
export const parachuteAreaM2 = (massKg: number, targetVelocityMps: number, densityKgM3: number, dragCoefficient: number, gravityMps2 = PHYSICS.standardGravity): number => 2 * massKg * gravityMps2 / (densityKgM3 * dragCoefficient * targetVelocityMps ** 2);
export const parachuteDiameterM = (areaM2: number): number => 2 * Math.sqrt(areaM2 / Math.PI);
export const suttonGravesHeatFluxWm2 = (densityKgM3: number, velocityMps: number, noseRadiusM: number, coefficient = 1.83e-4): number => coefficient * Math.sqrt(densityKgM3 / noseRadiusM) * velocityMps ** 3;
export const decelerationG = (dragN: number, massKg: number, gravityMps2 = PHYSICS.standardGravity): number => dragN / massKg / gravityMps2;
export const ballisticCoefficientKgM2 = (massKg: number, dragCoefficient: number, referenceAreaM2: number): number => massKg / (dragCoefficient * referenceAreaM2);
export const kineticEnergyJ = (massKg: number, velocityMps: number): number => 0.5 * massKg * velocityMps ** 2;
