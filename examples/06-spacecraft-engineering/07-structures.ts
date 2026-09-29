/**
 * Thin-wall pressure vessel and buckling checks
 *
 * First-order structural calculations for architecture and sanity checks.
 *
 * Uses: thinWallHoopStressPa, thinWallLongitudinalStressPa, eulerBucklingLoadN, factorOfSafety
 * Network: no
 */
import { eulerBucklingLoadN, factorOfSafety, rectangularSecondMoment, thinWallHoopStressPa, thinWallLongitudinalStressPa } from "../../src/index.js";

const pressure = 300_000;
const radius = 1.5;
const thickness = 0.004;
const hoop = thinWallHoopStressPa(pressure, radius, thickness);
const longitudinal = thinWallLongitudinalStressPa(pressure, radius, thickness);
const buckling = eulerBucklingLoadN(70e9, rectangularSecondMoment(0.05, 0.10), 2);
console.log({ hoop, longitudinal, buckling, hoopFos: factorOfSafety(250e6, hoop) });
