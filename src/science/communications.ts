import { PHYSICS } from "./constants.js";

export const wavelength = (frequencyHz: number): number => PHYSICS.speedOfLight / frequencyHz;
export const lightTimeSeconds = (distanceM: number): number => distanceM / PHYSICS.speedOfLight;
export const roundTripLightTimeSeconds = (distanceM: number): number => 2 * lightTimeSeconds(distanceM);
export const freeSpacePathLossDb = (distanceM: number, frequencyHz: number): number => 20 * Math.log10(4 * Math.PI * distanceM * frequencyHz / PHYSICS.speedOfLight);
export const antennaGainLinear = (diameterM: number, frequencyHz: number, efficiency = 0.6): number => efficiency * (Math.PI * diameterM / wavelength(frequencyHz)) ** 2;
export const antennaGainDb = (diameterM: number, frequencyHz: number, efficiency = 0.6): number => 10 * Math.log10(antennaGainLinear(diameterM, frequencyHz, efficiency));
export const eirpDbw = (transmitPowerW: number, antennaGainDbValue: number, lossesDb = 0): number => 10 * Math.log10(transmitPowerW) + antennaGainDbValue - lossesDb;
export const thermalNoiseDbw = (temperatureK: number, bandwidthHz: number): number => 10 * Math.log10(PHYSICS.boltzmann * temperatureK * bandwidthHz);
export const dbToLinear = (db: number): number => 10 ** (db / 10);
export const linearToDb = (linear: number): number => 10 * Math.log10(linear);
export const shannonCapacityBps = (bandwidthHz: number, snrLinear: number): number => bandwidthHz * Math.log2(1 + snrLinear);
export const dopplerShiftHz = (frequencyHz: number, radialVelocityMps: number): number => -frequencyHz * radialVelocityMps / PHYSICS.speedOfLight;
export function linkMarginDb(input: { transmitPowerW: number; txGainDb: number; rxGainDb: number; distanceM: number; frequencyHz: number; systemLossesDb?: number; requiredEbN0Db?: number; dataRateBps?: number; noiseTemperatureK?: number }): number {
  const eirp = eirpDbw(input.transmitPowerW, input.txGainDb);
  const receivedDbw = eirp + input.rxGainDb - freeSpacePathLossDb(input.distanceM, input.frequencyHz) - (input.systemLossesDb ?? 0);
  const n0DbwPerHz = 10 * Math.log10(PHYSICS.boltzmann * (input.noiseTemperatureK ?? 290));
  const ebN0 = receivedDbw - n0DbwPerHz - 10 * Math.log10(input.dataRateBps ?? 1);
  return ebN0 - (input.requiredEbN0Db ?? 0);
}
