/**
 * Radiative thermal balance
 *
 * Estimate absorbed solar power, equilibrium temperature and emitted radiative power.
 *
 * Uses: solarFluxAtDistance, absorbedSolarPower, radiativeEquilibriumTemperature, blackbodyRadiativePower
 * Network: no
 */
import { absorbedSolarPower, blackbodyRadiativePower, radiativeEquilibriumTemperature, solarFluxAtDistance, PHYSICS } from "../../src/index.js";

const flux = solarFluxAtDistance(PHYSICS.astronomicalUnit);
const absorbed = absorbedSolarPower(flux, 2, 0.6);
const temperatureK = radiativeEquilibriumTemperature(absorbed / 2, 1, 0.85, 1);
console.log({ flux, absorbed, temperatureK, radiatedW: blackbodyRadiativePower(2, temperatureK, 0.85) });
