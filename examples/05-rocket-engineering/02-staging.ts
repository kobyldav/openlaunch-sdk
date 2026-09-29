/**
 * Multi-stage ideal delta-v
 *
 * Estimate ideal total delta-v for stacked stages with a payload above them.
 *
 * Uses: stagedRocketDeltaV, RocketStage
 * Network: no
 */
import { stagedRocketDeltaV, type RocketStage } from "../../src/index.js";

const stages: RocketStage[] = [
  { dryMassKg: 25_000, propellantMassKg: 400_000, specificImpulseS: 300 },
  { dryMassKg: 5_000, propellantMassKg: 90_000, specificImpulseS: 350 },
];
console.log(stagedRocketDeltaV(stages, 10_000));
