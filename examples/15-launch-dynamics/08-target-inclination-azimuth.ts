/**
 * Determine possible pad-relative horizontal headings for an orbital
 * inclination. Does not infer launch RAAN, insertion orbit or range safety.
 * Network: no
 */
import { candidateLaunchAzimuths } from "../../src/index.js";

const solutions=candidateLaunchAzimuths({
  site:{latitudeDeg:28.5,longitudeDeg:-80.5,altitudeM:3},
  inclinationDeg:53,
  horizontalSpeedMps:7600,
});
console.table(solutions.map(s=>({
  azimuthDeg:s.azimuthDeg,
  direction:s.hemisphereDirection,
  modeledInclinationDeg:s.resultingInclinationDeg,
})));
console.log("These are local-tangent first-order candidates, not a SpaceX flight plan.");
