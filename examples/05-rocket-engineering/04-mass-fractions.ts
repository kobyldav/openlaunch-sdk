/**
 * Rocket mass fractions
 *
 * Compute simple structural, propellant and payload fractions.
 *
 * Uses: propellantMassFraction, structuralCoefficient, payloadFraction
 * Network: no
 */
import { payloadFraction, propellantMassFraction, structuralCoefficient } from "../../src/index.js";

const dry = 12_000;
const propellant = 88_000;
const payload = 5_000;
console.log({
  propellantMassFraction: propellantMassFraction(dry, propellant),
  structuralCoefficient: structuralCoefficient(dry, propellant),
  payloadFraction: payloadFraction(payload, dry + propellant + payload),
});
