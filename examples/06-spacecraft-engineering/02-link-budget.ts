/**
 * Deep-space style link margin
 *
 * Build a first-order RF link budget and compute one-way light time.
 *
 * Uses: antennaGainDb, linkMarginDb, lightTimeSeconds
 * Network: no
 */
import { antennaGainDb, lightTimeSeconds, linkMarginDb } from "../../src/index.js";

const distanceM = 100_000_000_000;
const frequencyHz = 8.4e9;
const marginDb = linkMarginDb({
  transmitPowerW: 100,
  txGainDb: antennaGainDb(1.5, frequencyHz),
  rxGainDb: antennaGainDb(34, frequencyHz),
  distanceM,
  frequencyHz,
  systemLossesDb: 3,
  requiredEbN0Db: 3,
  dataRateBps: 10_000,
  noiseTemperatureK: 100,
});
console.log({ marginDb, oneWayLightTimeS: lightTimeSeconds(distanceM) });
