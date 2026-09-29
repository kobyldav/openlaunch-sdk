/**
 * Ground-station look angles
 *
 * Compute azimuth, elevation and range from a ground observer to an ECEF target.
 *
 * Uses: lookAngles, geodeticToEcef
 * Network: no
 */
import { geodeticToEcef, lookAngles } from "../../src/index.js";

const observer = { latitudeDeg: 50, longitudeDeg: 15, altitudeM: 300 };
const targetEcef = geodeticToEcef({ latitudeDeg: 50.5, longitudeDeg: 16, altitudeM: 400_000 });
console.log(lookAngles(observer, targetEcef));
