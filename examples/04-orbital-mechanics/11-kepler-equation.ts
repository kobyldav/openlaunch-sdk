/**
 * Solve Kepler equation
 *
 * Convert mean anomaly to eccentric anomaly, then to true anomaly for an elliptic orbit.
 *
 * Uses: solveKepler, trueAnomalyFromEccentric
 * Network: no
 */
import { solveKepler, trueAnomalyFromEccentric } from "../../src/index.js";

const eccentricity = 0.2;
const meanAnomaly = 1.0;
const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
const trueAnomaly = trueAnomalyFromEccentric(eccentricAnomaly, eccentricity);
console.log({ eccentricAnomaly, trueAnomaly });
