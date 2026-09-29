/**
 * Radiation and single-event estimates
 *
 * Simple attenuation, accumulated dose and Poisson single-event probability helpers.
 *
 * Uses: shieldingTransmission, accumulatedDoseSv, singleEventProbability
 * Network: no
 */
import { accumulatedDoseSv, shieldingTransmission, singleEventProbability } from "../../src/index.js";

const transmission = shieldingTransmission(10, 0.12);
console.log({
  transmission,
  doseSv: accumulatedDoseSv(0.00002, 24 * 180, transmission),
  upsetProbability: singleEventProbability(2e4, 1e-10, 86_400),
});
