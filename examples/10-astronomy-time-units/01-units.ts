/**
 * Unit conversion engine
 *
 * Convert across dimensions and enumerate supported velocity units.
 *
 * Uses: convert, supportedUnits
 * Network: no
 */
import { convert, supportedUnits } from "../../src/index.js";

console.log("400 km in nmi:", convert(400, "km", "nmi"));
console.log("Mach-like 7.8 km/s in mph:", convert(7.8, "km/s", "mph"));
console.log("20 C in K:", convert(20, "C", "K"));
console.log("Velocity units:", supportedUnits("velocity"));
