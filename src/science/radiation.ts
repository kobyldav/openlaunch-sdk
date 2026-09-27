export const accumulatedDoseSv = (doseRateSvPerHour: number, hours: number, shieldingFactor = 1): number => doseRateSvPerHour * hours * shieldingFactor;
export const shieldingTransmission = (arealDensityKgM2: number, attenuationCoefficientM2Kg: number): number => Math.exp(-arealDensityKgM2 * attenuationCoefficientM2Kg);
export const inverseSquareDoseRate = (referenceDoseRate: number, referenceDistanceM: number, distanceM: number): number => referenceDoseRate * (referenceDistanceM / distanceM) ** 2;
export const singleEventProbability = (fluxPerM2S: number, crossSectionM2: number, durationSeconds: number): number => 1 - Math.exp(-fluxPerM2S * crossSectionM2 * durationSeconds);
