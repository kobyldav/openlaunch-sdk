/**
 * Great-circle distance and bearing
 *
 * Compute spherical distance/bearing and project a destination point.
 *
 * Uses: haversineDistanceM, initialBearingDeg, destinationPoint
 * Network: no
 */
import { destinationPoint, haversineDistanceM, initialBearingDeg } from "../../src/index.js";

const a = { latitudeDeg: 50.0833, longitudeDeg: 14.4667 };
const b = { latitudeDeg: 28.5721, longitudeDeg: -80.648 };
console.log({ distanceM: haversineDistanceM(a, b), bearingDeg: initialBearingDeg(a, b) });
console.log(destinationPoint(a, 270, 100_000));
