/**
 * Sutton-Graves convective heating estimate
 *
 * Compute first-order stagnation-region heat flux, kinetic energy and ballistic coefficient.
 *
 * Uses: suttonGravesHeatFluxWm2, kineticEnergyJ, ballisticCoefficientKgM2
 * Network: no
 */
import { ballisticCoefficientKgM2, kineticEnergyJ, suttonGravesHeatFluxWm2 } from "../../src/index.js";

console.log({
  heatFluxWm2: suttonGravesHeatFluxWm2(0.001, 7_500, 0.5),
  kineticEnergyJ: kineticEnergyJ(2_000, 7_500),
  betaKgM2: ballisticCoefficientKgM2(2_000, 1.4, 10),
});
