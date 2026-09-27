export const solarArrayPower = (fluxWm2: number, areaM2: number, efficiency: number, incidenceAngleRad = 0, degradation = 0): number => fluxWm2 * areaM2 * efficiency * Math.max(0, Math.cos(incidenceAngleRad)) * (1 - degradation);
export const batteryEnergyWh = (voltageV: number, capacityAh: number): number => voltageV * capacityAh;
export const batteryRuntimeHours = (energyWh: number, loadW: number, usableFraction = 1): number => energyWh * usableFraction / loadW;
export const requiredBatteryWh = (loadW: number, durationHours: number, depthOfDischarge = 0.8, efficiency = 0.95): number => loadW * durationHours / (depthOfDischarge * efficiency);
export const requiredSolarArea = (requiredPowerW: number, fluxWm2: number, efficiency: number, incidenceFactor = 1, degradation = 0): number => requiredPowerW / (fluxWm2 * efficiency * incidenceFactor * (1 - degradation));
export const energyJoules = (powerW: number, seconds: number): number => powerW * seconds;
export const energyWhFromJoules = (joules: number): number => joules / 3600;
export const joulesFromWh = (wh: number): number => wh * 3600;
