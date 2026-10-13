import type { Sgp4Satellite } from "../orbit/sgp4.js";
import type { TrajectoryClosestApproach } from "../traffic/types.js";
import { screenTrajectoryAgainstSatellites, SampledTemeTrajectory } from "../traffic/trajectory.js";
import { launchMonteCarlo } from "./monte-carlo.js";
import { simulateLaunch } from "./simulate.js";
import type {
  LaunchModel, LaunchMonteCarloResult, LaunchSimulation, MonteCarloConfig,
} from "./types.js";

export interface LaunchScreenResult {
  simulation: LaunchSimulation;
  /** A geometric proximity screen only; no covariance-based collision probabilities. */
  approaches: readonly TrajectoryClosestApproach[];
  screeningFrame: "TEME-approx-GMST";
  thresholdKm: number;
  /** Coordinates are GMST-aligned approximations; the result is not an operational safety assessment. */
  warning: string;
}

export class LaunchTrajectoryEngine {
  simulate(model: LaunchModel): LaunchSimulation { return simulateLaunch(model); }
  monteCarlo(model: LaunchModel, options: MonteCarloConfig): LaunchMonteCarloResult {
    return launchMonteCarlo(model, options);
  }
  /** Convert the simulation to the pre-existing v0.7 satellite-screening contract. */
  toSampledTrajectory(simulation: LaunchSimulation): SampledTemeTrajectory {
    return new SampledTemeTrajectory(simulation.trajectory);
  }
  /**
   * Compare a modeled generic vehicle against propagated public satellite elements.
   * Do not use for collision avoidance/launch clearance without high-quality ephemerides,
   * validated frame transformations and uncertainty analysis.
   */
  screenSatellites(
    model: LaunchModel,
    satellites: readonly Sgp4Satellite[],
    options: { thresholdKm: number; maxResults?: number },
  ): LaunchScreenResult {
    const simulation=this.simulate(model);
    if (simulation.trajectory.length < 2) throw new RangeError("simulated trajectory requires at least two samples");
    const trajectory=this.toSampledTrajectory(simulation);
    const approaches=screenTrajectoryAgainstSatellites(trajectory,satellites,options);
    return {
      simulation,approaches,thresholdKm:options.thresholdKm,
      screeningFrame:"TEME-approx-GMST",
      warning:"Research-grade relative-motion screen. No covariance or collision probability; launch state uses simplified GMST alignment.",
    };
  }
}
