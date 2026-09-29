/**
 * Dynamic pressure, drag and Reynolds number
 *
 * Combine atmospheric state with first-order aerodynamic loads.
 *
 * Uses: isa1976, dynamicPressure, dragForce, reynoldsNumber, sutherlandViscosity
 * Network: no
 */
import { dragForce, dynamicPressure, isa1976, reynoldsNumber, sutherlandViscosity } from "../../src/index.js";

const atmosphere = isa1976(20_000);
const velocity = 1_000;
const q = dynamicPressure(atmosphere.densityKgM3, velocity);
const drag = dragForce(atmosphere.densityKgM3, velocity, 0.5, 10);
const re = reynoldsNumber(atmosphere.densityKgM3, velocity, 2, sutherlandViscosity(atmosphere.temperatureK));
console.log({ q, drag, re });
