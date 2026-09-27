import { PHYSICS } from "./constants.js";

export const blackbodyRadiativePower = (areaM2: number, temperatureK: number, emissivity = 1): number => emissivity * PHYSICS.stefanBoltzmann * areaM2 * temperatureK ** 4;
export const radiativeEquilibriumTemperature = (absorbedFluxWm2: number, absorptivity = 1, emissivity = 1, viewFactor = 4): number => (absorptivity * absorbedFluxWm2 / (emissivity * PHYSICS.stefanBoltzmann * viewFactor)) ** 0.25;
export const solarFluxAtDistance = (distanceM: number): number => PHYSICS.solarConstant1AU * (PHYSICS.astronomicalUnit / distanceM) ** 2;
export const conductiveHeatFlow = (thermalConductivityWmK: number, areaM2: number, deltaTemperatureK: number, thicknessM: number): number => thermalConductivityWmK * areaM2 * deltaTemperatureK / thicknessM;
export const absorbedSolarPower = (fluxWm2: number, areaM2: number, absorptivity = 1, incidenceAngleRad = 0): number => fluxWm2 * areaM2 * absorptivity * Math.max(0, Math.cos(incidenceAngleRad));
export const heatCapacityEnergy = (massKg: number, specificHeatJkgK: number, deltaTemperatureK: number): number => massKg * specificHeatJkgK * deltaTemperatureK;
export const temperatureChangeFromEnergy = (energyJ: number, massKg: number, specificHeatJkgK: number): number => energyJ / (massKg * specificHeatJkgK);
