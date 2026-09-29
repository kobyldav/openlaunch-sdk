/**
 * Thrust, mass flow and burn time
 *
 * Connect engine thrust and specific impulse to mass flow, T/W and approximate burn time.
 *
 * Uses: thrustToWeight, massFlowRate, burnTime
 * Network: no
 */
import { burnTime, massFlowRate, thrustToWeight } from "../../src/index.js";

const thrustN = 1_000_000;
const ispS = 330;
const propellantKg = 80_000;
console.log({
  twr: thrustToWeight(thrustN, 90_000),
  massFlowKgS: massFlowRate(thrustN, ispS),
  burnSeconds: burnTime(propellantKg, thrustN, ispS),
});
