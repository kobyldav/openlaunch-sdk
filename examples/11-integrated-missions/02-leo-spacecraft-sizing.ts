/**
 * LEO spacecraft first-order sizing
 *
 * Combine orbit, power and data helpers into a small LEO spacecraft sizing workflow.
 *
 * Uses: leoReference, requiredBatteryWh, requiredSolarArea, dailyDataBudget, downlinkBalance
 * Network: no
 */
import { dailyDataBudget, downlinkBalance, leoReference, requiredBatteryWh, requiredSolarArea } from "../../src/index.js";

const orbit = leoReference(500_000);
const eclipseHours = 0.6;
const batteryWh = requiredBatteryWh(350, eclipseHours, 0.8, 0.95);
const arrayM2 = requiredSolarArea(500, 1_361, 0.29, 0.8, 0.9);
const generatedBits = dailyDataBudget([{ rateBps: 1e6, dutyCycle: 0.1 }]);
const downlink = downlinkBalance(generatedBits / 86_400, 2e6, 0.2);
console.log({ orbit, batteryWh, arrayM2, generatedBits, downlink });
