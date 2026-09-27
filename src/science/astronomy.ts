import { PHYSICS } from "./constants.js";
export const angularDiameterRad = (diameterM: number, distanceM: number): number => 2 * Math.atan2(diameterM / 2, distanceM);
export const luminosityFromRadiusTemperature = (radiusM: number, temperatureK: number): number => 4 * Math.PI * radiusM ** 2 * PHYSICS.stefanBoltzmann * temperatureK ** 4;
export const fluxFromLuminosity = (luminosityW: number, distanceM: number): number => luminosityW / (4 * Math.PI * distanceM ** 2);
export const distanceModulus = (distanceParsec: number): number => 5 * Math.log10(distanceParsec) - 5;
export const apparentMagnitude = (absoluteMagnitude: number, distanceParsec: number): number => absoluteMagnitude + distanceModulus(distanceParsec);
export const magnitudeDifferenceToFluxRatio = (deltaMagnitude: number): number => 10 ** (-0.4 * deltaMagnitude);
export const blackbodyPeakWavelengthM = (temperatureK: number): number => 2.897771955e-3 / temperatureK;
