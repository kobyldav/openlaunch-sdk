/**
 * Sphere of influence and Hill sphere
 *
 * Estimate Earth gravitational influence scales relative to the Sun.
 *
 * Uses: BODIES, sphereOfInfluence, hillSphere
 * Network: no
 */
import { BODIES, hillSphere, sphereOfInfluence } from "../../src/index.js";

console.log({
  sphereOfInfluenceM: sphereOfInfluence(BODIES.earth.semiMajorAxis, BODIES.earth.mass, BODIES.sun.mass),
  hillSphereM: hillSphere(BODIES.earth.semiMajorAxis, BODIES.earth.eccentricity, BODIES.earth.mass, BODIES.sun.mass),
});
