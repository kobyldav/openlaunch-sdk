/**
 * Screen an externally simulated TEME trajectory against live satellites.
 *
 * A future launch 3DOF/6DOF solver can feed its time-tagged states into the
 * same SampledTemeTrajectory interface. The values below are only an example
 * upper-stage-like trajectory segment, not a real launch reconstruction.
 *
 * Network: yes
 */
import {
  OpenLaunch,
  SampledTemeTrajectory,
} from "../../src/index.js";

const start = new Date();
const trajectory = new SampledTemeTrajectory([
  {
    time: start,
    positionTemeKm: { x: 6578, y: 0, z: 0 },
    velocityTemeKmS: { x: 0, y: 7.4, z: 0.8 },
  },
  {
    time: new Date(start.getTime() + 300_000),
    positionTemeKm: { x: 6180, y: 2150, z: 230 },
    velocityTemeKmS: { x: -2.6, y: 7.0, z: 0.75 },
  },
  {
    time: new Date(start.getTime() + 600_000),
    positionTemeKm: { x: 5050, y: 4100, z: 440 },
    velocityTemeKmS: { x: -4.9, y: 5.8, z: 0.65 },
  },
]);

const space = new OpenLaunch();
const candidates = await space.orbit.group("STATIONS", 100);
const encounters = space.traffic.screenTrajectory(
  trajectory,
  candidates,
  500,
  20,
);

console.table(encounters.map((event) => ({
  satellite: event.satellite.name,
  tca: event.tca.toISOString(),
  missDistanceKm: event.missDistanceKm,
  relativeSpeedKmS: event.relativeSpeedKmS,
  radialKm: event.satelliteRtn.radialKm,
  alongTrackKm: event.satelliteRtn.alongTrackKm,
  crossTrackKm: event.satelliteRtn.crossTrackKm,
})));
