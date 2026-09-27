export interface CrewConsumableRates {
  oxygenKgPerPersonDay: number;
  waterKgPerPersonDay: number;
  foodKgPerPersonDay: number;
}
export const DEFAULT_CREW_RATES: CrewConsumableRates = { oxygenKgPerPersonDay: 0.84, waterKgPerPersonDay: 3.5, foodKgPerPersonDay: 1.8 };
export interface ConsumablesEstimate { oxygenKg: number; waterKg: number; foodKg: number; totalKg: number; }
export function consumablesForMission(crew: number, days: number, recycling: { waterRecovery?: number; oxygenRecovery?: number } = {}, reserveFraction = 0.2, rates: CrewConsumableRates = DEFAULT_CREW_RATES): ConsumablesEstimate {
  const factor = crew * days * (1 + reserveFraction);
  const oxygenKg = factor * rates.oxygenKgPerPersonDay * (1 - (recycling.oxygenRecovery ?? 0));
  const waterKg = factor * rates.waterKgPerPersonDay * (1 - (recycling.waterRecovery ?? 0));
  const foodKg = factor * rates.foodKgPerPersonDay;
  return { oxygenKg, waterKg, foodKg, totalKg: oxygenKg + waterKg + foodKg };
}
export const co2ProductionKg = (crew: number, days: number, kgPerPersonDay = 1): number => crew * days * kgPerPersonDay;
export const metabolicHeatW = (crew: number, wattsPerPerson = 100): number => crew * wattsPerPerson;
export const cabinOxygenMassKg = (pressurePa: number, volumeM3: number, temperatureK: number, oxygenMolarFraction = 0.21): number => pressurePa * volumeM3 * oxygenMolarFraction * 0.031998 / (8.31446261815324 * temperatureK);
