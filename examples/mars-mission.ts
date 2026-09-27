import {
  OpenLaunch,
  BODIES,
  marsMissionReference,
  consumablesForMission,
  solarFluxAtDistance,
  earthMarsHohmann,
} from "../src/index.js";

const sdk = new OpenLaunch();
const next = await sdk.launches.next();

console.log("Next launch:", next?.name);
console.table(marsMissionReference());
console.table(earthMarsHohmann());
console.log("Mars solar flux W/m²:", solarFluxAtDistance(BODIES.mars.semiMajorAxis!));
console.table(consumablesForMission(4, 900, { waterRecovery: 0.9, oxygenRecovery: 0.7 }));
