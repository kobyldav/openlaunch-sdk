/**
 * Blackbody and magnitude helpers
 *
 * Use simple astronomy utilities for blackbody peak wavelength, luminosity and magnitude scaling.
 *
 * Uses: blackbodyPeakWavelengthM, luminosityFromRadiusTemperature, fluxFromLuminosity, apparentMagnitude
 * Network: no
 */
import { apparentMagnitude, blackbodyPeakWavelengthM, fluxFromLuminosity, luminosityFromRadiusTemperature } from "../../src/index.js";

const luminosity = luminosityFromRadiusTemperature(6.957e8, 5_772);
console.log({
  peakWavelengthM: blackbodyPeakWavelengthM(5_772),
  luminosityW: luminosity,
  fluxAt1AuLikeDistance: fluxFromLuminosity(luminosity, 149_597_870_700),
  magnitudeAt10Pc: apparentMagnitude(4.83, 10),
});
