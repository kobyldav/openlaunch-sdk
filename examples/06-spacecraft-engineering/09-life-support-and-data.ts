/**
 * Crew consumables and data budget
 *
 * Estimate crew consumables and a simple daily instrument/downlink data balance.
 *
 * Uses: consumablesForMission, metabolicHeatW, dailyDataBudget, downlinkBalance
 * Network: no
 */
import { consumablesForMission, dailyDataBudget, downlinkBalance, metabolicHeatW } from "../../src/index.js";

const consumables = consumablesForMission(4, 900, { waterRecovery: 0.9, oxygenRecovery: 0.7 });
const generatedBitsPerDay = dailyDataBudget([
  { rateBps: 2e6, dutyCycle: 0.10 },
  { rateBps: 200e3, dutyCycle: 0.50 },
]);
console.log({ consumables, metabolicHeatW: metabolicHeatW(4), generatedBitsPerDay, balance: downlinkBalance(generatedBitsPerDay / 86400, 5e6, 0.15) });
