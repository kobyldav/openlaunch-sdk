/**
 * Geodetic and ECEF conversion
 *
 * Round-trip a WGS-84 latitude/longitude/altitude position through ECEF.
 *
 * Uses: geodeticToEcef, ecefToGeodetic
 * Network: no
 */
import { ecefToGeodetic, geodeticToEcef } from "../../src/index.js";

const site = { latitudeDeg: 28.5721, longitudeDeg: -80.648, altitudeM: 3 };
const ecef = geodeticToEcef(site);
console.log({ ecef, roundTrip: ecefToGeodetic(ecef) });
