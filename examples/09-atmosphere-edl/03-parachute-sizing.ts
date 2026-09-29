/**
 * First-order parachute sizing
 *
 * Estimate ideal parachute area and equivalent circular diameter from a target terminal speed.
 *
 * Uses: parachuteAreaM2, parachuteDiameterM
 * Network: no
 */
import { parachuteAreaM2, parachuteDiameterM } from "../../src/index.js";

const area = parachuteAreaM2(1_000, 25, 0.02, 1.5, 3.71);
console.log({ areaM2: area, diameterM: parachuteDiameterM(area) });
