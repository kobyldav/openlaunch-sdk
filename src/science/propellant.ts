export const boiloffMassKg = (initialMassKg: number, dailyFraction: number, days: number): number => initialMassKg * (1 - (1 - dailyFraction) ** days);
export const remainingAfterBoiloffKg = (initialMassKg: number, dailyFraction: number, days: number): number => initialMassKg * (1 - dailyFraction) ** days;
export const mixtureComponentMasses = (totalPropellantKg: number, oxidizerFuelRatio: number): { oxidizerKg: number; fuelKg: number } => ({ oxidizerKg: totalPropellantKg * oxidizerFuelRatio / (1 + oxidizerFuelRatio), fuelKg: totalPropellantKg / (1 + oxidizerFuelRatio) });
export const tankVolumeM3 = (propellantMassKg: number, densityKgM3: number, ullageFraction = 0.03): number => propellantMassKg / densityKgM3 / (1 - ullageFraction);
export const pressurantMoles = (pressurePa: number, volumeM3: number, temperatureK: number): number => pressurePa * volumeM3 / (8.31446261815324 * temperatureK);
