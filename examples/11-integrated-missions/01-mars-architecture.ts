/**
 * Mars mission architecture sketch
 *
 * Combine independent first-order helpers into a human-readable Mars architecture study.
 *
 * Uses: BODIES, earthMarsHohmann, marsMissionReference, solarFluxAtDistance, consumablesForMission
 * Network: no
 */
import { BODIES, consumablesForMission, earthMarsHohmann, marsMissionReference, solarFluxAtDistance } from "../../src/index.js";

const transfer = earthMarsHohmann();
const mars = marsMissionReference();
const crew = consumablesForMission(4, 900, { waterRecovery: 0.9, oxygenRecovery: 0.7 });
const marsFlux = solarFluxAtDistance(BODIES.mars.semiMajorAxis);
console.log({ transfer, mars, crew, marsSolarFluxWm2: marsFlux });
