/**
 * Line of sight and cylindrical eclipse
 *
 * Check spherical-body line of sight and a simple cylindrical shadow approximation.
 *
 * Uses: BODIES, hasLineOfSight, inCylindricalEclipse
 * Network: no
 */
import { BODIES, hasLineOfSight, inCylindricalEclipse, type Vec3 } from "../../src/index.js";

const a: Vec3 = [7_000_000, 0, 0];
const b: Vec3 = [0, 7_000_000, 0];
const sunFromEarth: Vec3 = [149_597_870_700, 0, 0];
console.log({
  lineOfSight: hasLineOfSight(a, b, BODIES.earth.radius),
  eclipse: inCylindricalEclipse([-7_000_000, 0, 0], sunFromEarth, BODIES.earth.radius),
});
