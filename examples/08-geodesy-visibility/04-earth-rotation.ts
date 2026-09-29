/**
 * ECI/ECEF rotation and sidereal time
 *
 * Rotate vectors between simple Earth-fixed and inertial frames using GMST.
 *
 * Uses: eciToEcef, ecefToEci, gmstDegrees
 * Network: no
 */
import { ecefToEci, eciToEcef, gmstDegrees, type Vec3 } from "../../src/index.js";

const date = new Date("2026-09-29T12:00:00Z");
const eci: Vec3 = [7_000_000, 0, 0];
const ecef = eciToEcef(eci, date);
console.log({ gmstDeg: gmstDegrees(date), ecef, back: ecefToEci(ecef, date) });
