/**
 * Solar array and battery sizing
 *
 * First-order spacecraft power sizing using solar flux, efficiency and eclipse duration.
 *
 * Uses: solarArrayPower, requiredSolarArea, requiredBatteryWh
 * Network: no
 */
import { requiredBatteryWh, requiredSolarArea, solarArrayPower } from "../../src/index.js";

const flux = 1_361;
console.log("2 m² array W:", solarArrayPower(flux, 2, 0.30, 0, 0.85));
console.log("Area for 800 W m²:", requiredSolarArea(800, flux, 0.30, 1, 0.85));
console.log("Battery Wh:", requiredBatteryWh(600, 0.6, 0.8, 0.95));
