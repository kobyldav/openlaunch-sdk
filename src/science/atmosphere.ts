import { PHYSICS } from "./constants.js";

export interface AtmosphereState { temperatureK: number; pressurePa: number; densityKgM3: number; speedOfSoundMps: number; }
const GAMMA = 1.4, R_AIR = 287.05287;
export function isa1976(altitudeM: number): AtmosphereState {
  const h = Math.max(-500, Math.min(84_852, altitudeM));
  const layers = [
    { h0: 0, t0: 288.15, p0: 101325, lapse: -0.0065 },
    { h0: 11000, t0: 216.65, p0: 22632.06, lapse: 0 },
    { h0: 20000, t0: 216.65, p0: 5474.889, lapse: 0.001 },
    { h0: 32000, t0: 228.65, p0: 868.0187, lapse: 0.0028 },
    { h0: 47000, t0: 270.65, p0: 110.9063, lapse: 0 },
    { h0: 51000, t0: 270.65, p0: 66.93887, lapse: -0.0028 },
    { h0: 71000, t0: 214.65, p0: 3.956420, lapse: -0.002 },
  ];
  let layer = layers[0]!;
  for (const candidate of layers) if (h >= candidate.h0) layer = candidate;
  const dh = h - layer.h0;
  const temperatureK = layer.t0 + layer.lapse * dh;
  const pressurePa = layer.lapse === 0
    ? layer.p0 * Math.exp(-PHYSICS.standardGravity * dh / (R_AIR * layer.t0))
    : layer.p0 * (temperatureK / layer.t0) ** (-PHYSICS.standardGravity / (layer.lapse * R_AIR));
  const densityKgM3 = pressurePa / (R_AIR * temperatureK);
  return { temperatureK, pressurePa, densityKgM3, speedOfSoundMps: Math.sqrt(GAMMA * R_AIR * temperatureK) };
}
export const dynamicPressure = (densityKgM3: number, velocityMps: number): number => 0.5 * densityKgM3 * velocityMps ** 2;
export const machNumber = (velocityMps: number, speedOfSoundMps: number): number => velocityMps / speedOfSoundMps;
export const dragForce = (densityKgM3: number, velocityMps: number, dragCoefficient: number, areaM2: number): number => dynamicPressure(densityKgM3, velocityMps) * dragCoefficient * areaM2;
export const ballisticCoefficient = (massKg: number, dragCoefficient: number, areaM2: number): number => massKg / (dragCoefficient * areaM2);
export const terminalVelocity = (massKg: number, gravityMps2: number, densityKgM3: number, dragCoefficient: number, areaM2: number): number => Math.sqrt(2 * massKg * gravityMps2 / (densityKgM3 * dragCoefficient * areaM2));
export const stagnationTemperature = (staticTemperatureK: number, mach: number, gamma = 1.4): number => staticTemperatureK * (1 + (gamma - 1) * mach * mach / 2);
export const reynoldsNumber = (densityKgM3: number, velocityMps: number, lengthM: number, dynamicViscosityPaS: number): number => densityKgM3 * velocityMps * lengthM / dynamicViscosityPaS;
export function sutherlandViscosity(temperatureK: number): number { const mu0 = 1.716e-5, t0 = 273.15, s = 110.4; return mu0 * (temperatureK / t0) ** 1.5 * (t0 + s) / (temperatureK + s); }
