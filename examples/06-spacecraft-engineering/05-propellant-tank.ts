/**
 * Propellant mixture and tank volume
 *
 * Split bipropellant mass, estimate tank volume with ullage, and ideal-gas pressurant requirement.
 *
 * Uses: mixtureComponentMasses, tankVolumeM3, pressurantMoles
 * Network: no
 */
import { mixtureComponentMasses, pressurantMoles, tankVolumeM3 } from "../../src/index.js";

const mix = mixtureComponentMasses(1_000, 2.6);
const oxidizerVolume = tankVolumeM3(mix.oxidizerKg, 1_140, 0.05);
const heliumMoles = pressurantMoles(2_000_000, oxidizerVolume * 0.05, 300);
console.log({ mix, oxidizerVolume, heliumMoles });
