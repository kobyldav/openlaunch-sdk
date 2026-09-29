/**
 * State vector and orbital elements round trip
 *
 * Convert an inertial state to Keplerian elements and back.
 *
 * Uses: BODIES, stateToOrbitalElements, orbitalElementsToState
 * Network: no
 */
import { BODIES, orbitalElementsToState, stateToOrbitalElements, type StateVector } from "../../src/index.js";

const state: StateVector = {
  positionM: [7_000_000, 0, 0],
  velocityMps: [0, 7_500, 1_000],
};
const elements = stateToOrbitalElements(state, BODIES.earth.mu);
const reconstructed = orbitalElementsToState(elements, BODIES.earth.mu);
console.log({ elements, reconstructed });
