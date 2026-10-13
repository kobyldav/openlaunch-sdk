import { computeForces, guidanceAt, initialLaunchState, launchInitialMass, telemetryAt, validateLaunchModel } from "./dynamics.js";
import { rk4LaunchStep } from "./integrator.js";
import { assessLaunchOrbit } from "./orbit-analysis.js";
import { norm } from "./math.js";
import type {
  DerivativeState, LaunchEvent, LaunchEventKind, LaunchModel, LaunchSimulation,
  LaunchStage, LaunchTelemetry,
} from "./types.js";
import type { TimedTemeState } from "../traffic/types.js";

const EPSILON_SECONDS = 0.001;
const EPSILON_PROPELLANT_KG = 0.01;

/**
 * Three-degree-of-freedom point-mass launch simulation.
 *
 * Guidance is a time-tagged commanded pitch/heading schedule, not a closed-loop
 * ascent controller. Inertial coordinates are aligned with SGP4's TEME by a
 * GMST-only approximation; accurate Earth orientation is not modeled.
 */
export function simulateLaunch(model: LaunchModel): LaunchSimulation {
  validateLaunchModel(model);
  const startMass = launchInitialMass(model);
  const startMs = model.liftoff.getTime();
  const stepSeconds = model.stepSeconds ?? 1;
  const maxSamples = model.maxSamples ?? 20_000;

  const trajectory: TimedTemeState[] = [];
  const telemetry: LaunchTelemetry[] = [];
  const events: LaunchEvent[] = [];
  let state = initialLaunchState(model);
  let elapsedSeconds = 0;
  let stageIndex: number | null = 0;
  let propellantRemainingKg = model.vehicle.stages[0]!.propellantMassKg;
  let engineReadyAtSeconds = 0;
  let ignitedStageIndex = -1;
  let fairingJettisoned = false;
  let maxQPa = -Infinity;
  let maxQTime = model.liftoff;
  let maxAltitudeKm = -Infinity;
  let termination: LaunchSimulation["termination"] = "duration";

  const activeStage = (): LaunchStage | null =>
    stageIndex === null ? null : model.vehicle.stages[stageIndex] ?? null;

  const engineOn = (): boolean =>
    activeStage() !== null &&
    elapsedSeconds + 1e-9 >= engineReadyAtSeconds &&
    propellantRemainingKg > EPSILON_PROPELLANT_KG;

  const context = () => ({
    stage: activeStage(),
    elapsedSeconds,
    engineOn: engineOn(),
  });

  const snapshot = (): LaunchTelemetry =>
    telemetryAt(model, state, context(), stageIndex, propellantRemainingKg);

  const recordEvent = (kind: LaunchEventKind, detail?: string): void => {
    const current = snapshot();
    events.push({
      kind,
      time: current.time,
      elapsedSeconds,
      altitudeKm: current.altitudeKm,
      massKg: state.massKg,
      stageIndex,
      ...(detail === undefined ? {} : { detail }),
    });
  };

  const sample = (): void => {
    const next = snapshot();
    if (![next.altitudeKm,next.massKg,next.dynamicPressurePa,next.inertialSpeedMps].every(Number.isFinite)) {
      throw new Error("Simulation generated a non-finite telemetry state");
    }
    const last = telemetry[telemetry.length-1];
    if (last && next.time.getTime() <= last.time.getTime()) {
      if (next.time.getTime() < last.time.getTime()) throw new Error("Simulation time moved backwards");
      telemetry[telemetry.length-1] = next;
      trajectory[trajectory.length-1] = toTrajectoryState(next);
    } else {
      if (telemetry.length >= maxSamples) throw new RangeError("Simulation maxSamples exceeded; increase stepSeconds or maxSamples");
      telemetry.push(next);
      trajectory.push(toTrajectoryState(next));
    }
    if (next.dynamicPressurePa > maxQPa) {
      maxQPa=next.dynamicPressurePa;
      maxQTime=next.time;
    }
    maxAltitudeKm = Math.max(maxAltitudeKm,next.altitudeKm);
  };

  recordEvent("liftoff","Requested simulation initial state, not evidence of an actual liftoff");
  recordEvent("engine-ignition",model.vehicle.stages[0]!.name);
  ignitedStageIndex=0;
  if (model.vehicle.fairingJettisonSeconds === 0) {
    fairingJettisoned = true;
    state = { ...state, massKg: state.massKg - (model.vehicle.fairingMassKg ?? 0) };
    recordEvent("fairing-jettison", "Fairing separation at T+0");
  }
  sample();

  let iterations=0;
  while (elapsedSeconds < model.durationSeconds - 1e-9) {
    if (++iterations > maxSamples * 4) throw new RangeError("Simulation step bound exceeded");

    const currentStage=activeStage();
    if (engineOn() && stageIndex !== ignitedStageIndex) {
      ignitedStageIndex=stageIndex!;
      recordEvent("engine-ignition",currentStage!.name);
    }

    let dt=Math.min(stepSeconds,model.durationSeconds-elapsedSeconds);

    // Stop integration exactly at guidance and discrete-event times.
    const nextGuidance = model.guidance.find(k => k.timeSeconds > elapsedSeconds + EPSILON_SECONDS);
    if (nextGuidance) dt=Math.min(dt,nextGuidance.timeSeconds-elapsedSeconds);

    if (currentStage && !engineOn() && engineReadyAtSeconds > elapsedSeconds + EPSILON_SECONDS) {
      dt=Math.min(dt,engineReadyAtSeconds-elapsedSeconds);
    }

    const fairingAt = model.vehicle.fairingJettisonSeconds;
    if (!fairingJettisoned && fairingAt !== undefined && fairingAt > elapsedSeconds + EPSILON_SECONDS) {
      dt=Math.min(dt,fairingAt-elapsedSeconds);
    }

    if (engineOn()) {
      const nominalMdot=computeForces(model,state,context()).massFlowKgS;
      if (nominalMdot > 0) {
        dt=Math.min(dt,propellantRemainingKg/nominalMdot);
      }
    }

    if (!(dt > 0)) throw new Error("Integrator became stuck at an event boundary");
    // Very small end-of-burn intervals are safely snapped to preserve ms timestamps.
    if (dt < EPSILON_SECONDS && currentStage && engineOn()) {
      state = { ...state, massKg: state.massKg-propellantRemainingKg };
      propellantRemainingKg=0;
    } else {
      const previousMass=state.massKg;
      const integrated=rk4LaunchStep(model,state,context(),dt);
      const propUsed=engineOn() ? Math.max(0,previousMass-integrated.massKg) : 0;
      propellantRemainingKg=Math.max(0,propellantRemainingKg-propUsed);
      state=integrated;
      elapsedSeconds=Math.min(model.durationSeconds,elapsedSeconds+dt);
    }

    if (state.massKg <= 0 || !Number.isFinite(norm(state.positionM))) throw new Error("Rocket state is nonphysical");

    if (
      !fairingJettisoned &&
      fairingAt !== undefined &&
      elapsedSeconds + EPSILON_SECONDS >= fairingAt
    ) {
      fairingJettisoned=true;
      state={...state,massKg:state.massKg-(model.vehicle.fairingMassKg ?? 0)};
      recordEvent("fairing-jettison","Instantaneous fairing mass separation");
    }

    if (currentStage && propellantRemainingKg <= EPSILON_PROPELLANT_KG && elapsedSeconds >= engineReadyAtSeconds) {
      // Project any remaining sub-10-gram propellant off the state when snapping.
      state={...state,massKg:state.massKg-propellantRemainingKg};
      propellantRemainingKg=0;
      recordEvent("engine-cutoff",currentStage.name+" propellant exhausted");

      if (stageIndex !== null && stageIndex < model.vehicle.stages.length-1) {
        recordEvent("stage-separation",currentStage.name+" dry mass released");
        state={...state,massKg:state.massKg-currentStage.dryMassKg};
        stageIndex += 1;
        propellantRemainingKg=model.vehicle.stages[stageIndex]!.propellantMassKg;
        engineReadyAtSeconds=elapsedSeconds+(currentStage.coastAfterSeparationSeconds ?? 0);
      } else {
        stageIndex=null;
        if (model.coastAfterBurnout === false) {
          termination="burnout";
          sample();
          break;
        }
      }
    }

    sample();
    const current=telemetry[telemetry.length-1]!;

    if (
      elapsedSeconds >= 2 &&
      current.altitudeKm * 1000 < (model.site.altitudeM ?? 0) - 5 &&
      current.verticalSpeedMps < 0
    ) {
      termination="ground-impact";
      recordEvent("ground-impact","Terrain is approximated by the launch-site altitude");
      break;
    }
  }

  const maxQSample=telemetry.find(sample=>sample.time.getTime()===maxQTime.getTime());
  if (maxQSample) {
    events.push({
      kind:"max-q",time:maxQTime,elapsedSeconds:maxQSample.elapsedSeconds,
      altitudeKm:maxQSample.altitudeKm,massKg:maxQSample.massKg,
      stageIndex:maxQSample.stageIndex,detail:"Maximum among discrete telemetry samples",
    });
  }

  recordEvent("simulation-end",termination);
  events.sort((a,b)=>a.elapsedSeconds-b.elapsedSeconds);

  return {
    model,trajectory,telemetry,events,
    initialMassKg:startMass,finalMassKg:state.massKg,
    finalOrbit: assessLaunchOrbit(trajectory[trajectory.length - 1]!),
    maxQPa,maxQTime,maxAltitudeKm,totalSimulatedSeconds:elapsedSeconds,
    termination,
    frame:"TEME-approx-GMST",
    limitations:[
      "3DOF point mass: no attitude dynamics, aero moments, TVC limits or closed-loop flight control.",
      "Guidance is a prescribed time/pitch/heading/throttle profile, not inferred from launch schedules.",
      "Atmosphere is ISA through 84.852 km with simplified exponential upper-atmosphere extrapolation; no wind or space weather.",
      "Earth-fixed/TEME alignment uses a GMST-only frame approximation; no IERS EOP or polar motion.",
      "Vehicle values, throttle schedules and launch azimuth must be supplied and independently validated.",
      "Unmodeled maneuvers, dispersions and covariance prevent operational collision-risk claims.",
    ],
  };
}

function toTrajectoryState(record:LaunchTelemetry):TimedTemeState {
  return {
    time:record.time,
    positionTemeKm:{...record.positionTemeKm},
    velocityTemeKmS:{...record.velocityTemeKmS},
  };
}
