import { ecfToEci, gstime } from "satellite.js";
import { geodeticToEcfKm, temeToGeodeticApprox } from "../orbit/frames.js";
import type { CartesianKm } from "../orbit/types.js";
import { isa1976 } from "../science/atmosphere.js";
import { BODIES, PHYSICS } from "../science/constants.js";
import type {
  DerivativeState,
  GuidanceKnot,
  LaunchModel,
  LaunchStage,
  LaunchTelemetry,
} from "./types.js";
import { add, clamp, cross, dot, finite, lerp, norm, rad, scale, sub, unit } from "./math.js";

const G0 = PHYSICS.standardGravity;
const OMEGA = PHYSICS.earthRotationRate;
const RE = BODIES.earth.radius;
const MU = BODIES.earth.mu;
const J2 = 1.08262668e-3;
const SEA_LEVEL_PRESSURE = 101325;

export interface PhysicsContext {
  stage: LaunchStage | null;
  /** Relative seconds since liftoff. */
  elapsedSeconds: number;
  /** Captures explicit coasts between stages and after final burnout. */
  engineOn: boolean;
}

export interface InstantForces {
  gravity: CartesianKm;
  thrustAcceleration: CartesianKm;
  dragAcceleration: CartesianKm;
  thrustN: number;
  massFlowKgS: number;
  dragN: number;
  densityKgM3: number;
  speedOfSoundMps: number;
  pressurePa: number;
  atmosphericRelativeVelocityMps: CartesianKm;
}

export function validateLaunchModel(model: LaunchModel): void {
  if (!(model.liftoff instanceof Date) || !Number.isFinite(model.liftoff.getTime())) throw new RangeError("liftoff must be a valid Date");
  if (!(model.durationSeconds > 0 && model.durationSeconds <= 172800)) throw new RangeError("durationSeconds must be in (0, 172800]");
  const step = model.stepSeconds ?? 1;
  if (!(step > 0 && step <= 30)) throw new RangeError("stepSeconds must be in (0, 30]");
  if (!(model.maxSamples === undefined || Number.isInteger(model.maxSamples) && model.maxSamples >= 2)) throw new RangeError("maxSamples must be an integer >= 2");
  const site = model.site;
  if (!Number.isFinite(site.latitudeDeg) || Math.abs(site.latitudeDeg) > 90) throw new RangeError("site latitude is invalid");
  if (!Number.isFinite(site.longitudeDeg) || Math.abs(site.longitudeDeg) > 180) throw new RangeError("site longitude is invalid");
  finite(site.altitudeM ?? 0, "site altitude");
  const vehicle = model.vehicle;
  if (!vehicle.stages.length) throw new RangeError("at least one stage is required");
  if (!Number.isFinite(vehicle.payloadMassKg) || vehicle.payloadMassKg <= 0) throw new RangeError("payload mass must be positive");
  if (!(vehicle.dragCoefficient >= 0 && vehicle.referenceAreaM2 > 0)) throw new RangeError("drag coefficient and area are invalid");
  finite(vehicle.dragCoefficient, "drag coefficient");
  finite(vehicle.referenceAreaM2, "reference area");
  if (!(vehicle.fairingMassKg === undefined || Number.isFinite(vehicle.fairingMassKg) && vehicle.fairingMassKg >= 0)) throw new RangeError("fairing mass must be >= 0");
  if (vehicle.fairingJettisonSeconds !== undefined && !(vehicle.fairingJettisonSeconds >= 0)) throw new RangeError("fairingJettisonSeconds must be >= 0");
  if (vehicle.fairingJettisonSeconds !== undefined && !(vehicle.fairingMassKg! > 0)) throw new RangeError("fairing mass is required for jettison");
  for (const [index, stage] of vehicle.stages.entries()) {
    for (const [field, value] of Object.entries({
      dryMassKg: stage.dryMassKg, propellantMassKg: stage.propellantMassKg,
      thrustSeaLevelN: stage.thrustSeaLevelN, thrustVacuumN: stage.thrustVacuumN,
      ispSeaLevelS: stage.ispSeaLevelS, ispVacuumS: stage.ispVacuumS,
    })) {
      if (!(Number.isFinite(value) && value > 0)) throw new RangeError("stage " + index + " " + field + " must be > 0");
    }
    if (!(stage.coastAfterSeparationSeconds === undefined || Number.isFinite(stage.coastAfterSeparationSeconds) && stage.coastAfterSeparationSeconds >= 0)) {
      throw new RangeError("coastAfterSeparationSeconds must be >= 0");
    }
  }
  if (model.guidance.length < 1) throw new RangeError("guidance requires at least one knot");
  for (const [index, knot] of model.guidance.entries()) {
    if (!(Number.isFinite(knot.timeSeconds) && knot.timeSeconds >= 0)) throw new RangeError("guidance time must be >= 0");
    if (index && !(knot.timeSeconds > model.guidance[index-1]!.timeSeconds)) throw new RangeError("guidance times must be strictly increasing");
    if (!(knot.pitchDeg >= -90 && knot.pitchDeg <= 90)) throw new RangeError("pitchDeg must be in [-90,90]");
    finite(knot.pitchDeg, "guidance pitch");
    finite(knot.headingDeg, "guidance heading");
    if (knot.throttle !== undefined && !(knot.throttle >= 0 && knot.throttle <= 1)) throw new RangeError("throttle must be in [0,1]");
  }
}

export function initialLaunchState(model: LaunchModel): DerivativeState {
  const ecfKm = geodeticToEcfKm({
    latitudeDeg: model.site.latitudeDeg,
    longitudeDeg: model.site.longitudeDeg,
    heightKm: (model.site.altitudeM ?? 0)/1000,
  });
  const at = model.liftoff;
  const pEcf = scale(ecfKm, 1000);
  const p = ecfToEci(pEcf, gstime(at));
  const positionM = {x:p.x, y:p.y, z:p.z};
  const velocityMps = cross({x:0,y:0,z:OMEGA}, positionM);
  return {positionM, velocityMps, massKg: launchInitialMass(model)};
}

export function launchInitialMass(model: LaunchModel): number {
  return model.vehicle.payloadMassKg + (model.vehicle.fairingMassKg ?? 0) +
    model.vehicle.stages.reduce((sum, stage) => sum + stage.dryMassKg + stage.propellantMassKg, 0);
}

export function guidanceAt(knots: readonly GuidanceKnot[], elapsedSeconds: number): Required<Pick<GuidanceKnot,"pitchDeg"|"headingDeg"|"throttle">> {
  let first = knots[0]!;
  if (elapsedSeconds <= first.timeSeconds) return {pitchDeg:first.pitchDeg,headingDeg:first.headingDeg,throttle:first.throttle ?? 1};
  for (let i=1;i<knots.length;i++) {
    const second = knots[i]!;
    if (elapsedSeconds > second.timeSeconds) {first=second;continue;}
    const t = (elapsedSeconds-first.timeSeconds)/(second.timeSeconds-first.timeSeconds);
    // Heading wraps across 360 degrees via the shorter path.
    let headingDelta = ((second.headingDeg-first.headingDeg+540)%360)-180;
    if (headingDelta === -180) headingDelta = 180;
    return {
      pitchDeg: lerp(first.pitchDeg,second.pitchDeg,t),
      headingDeg: first.headingDeg + headingDelta*t,
      throttle: lerp(first.throttle ?? 1, second.throttle ?? 1,t),
    };
  }
  return {pitchDeg:first.pitchDeg,headingDeg:first.headingDeg,throttle:first.throttle ?? 1};
}

export function atmosphericState(altitudeM: number): {densityKgM3:number; pressurePa:number; speedOfSoundMps:number} {
  if (altitudeM >= 200_000) return {densityKgM3:0,pressurePa:0,speedOfSoundMps:300};
  const isa = isa1976(Math.min(altitudeM,84_852));
  if (altitudeM <= 84_852) return isa;
  const decay = Math.exp(-(altitudeM-84_852)/7_000);
  return {densityKgM3:isa.densityKgM3*decay,pressurePa:isa.pressurePa*decay,speedOfSoundMps:isa.speedOfSoundMps};
}

export function computeForces(model: LaunchModel, state: DerivativeState, context: PhysicsContext): InstantForces {
  const r = state.positionM;
  const rr = norm(r);
  if (!(rr > RE*0.9) || !(state.massKg > 0)) throw new RangeError("nonphysical rocket state");
  const r2 = rr*rr;
  const gravityBase = scale(r,-MU/(rr*rr*rr));
  const z2 = r.z*r.z;
  const j2factor = model.enableJ2 === false ? 0 : 1.5*J2*MU*RE*RE/(rr**5);
  const j2 = {
    x: j2factor*r.x*(5*z2/r2-1),
    y: j2factor*r.y*(5*z2/r2-1),
    z: j2factor*r.z*(5*z2/r2-3),
  };
  const gravity = add(gravityBase,j2);
  const earthRotationSpeed = cross({x:0,y:0,z:OMEGA},r);
  const relative = sub(state.velocityMps,earthRotationSpeed);
  const relativeSpeed = norm(relative);
  const date = new Date(model.liftoff.getTime()+context.elapsedSeconds*1000);
  const positionKm = scale(r,1/1000);
  const geo = temeToGeodeticApprox(positionKm,date);
  const atmosphere = atmosphericState(geo.heightKm*1000);
  const dragN = 0.5*atmosphere.densityKgM3*relativeSpeed*relativeSpeed*
    model.vehicle.dragCoefficient*model.vehicle.referenceAreaM2;
  const dragAcceleration = relativeSpeed > 0 ? scale(relative,-dragN/(relativeSpeed*state.massKg)) : {x:0,y:0,z:0};

  let thrustN=0, massFlowKgS=0;
  let thrustAcceleration: CartesianKm = {x:0,y:0,z:0};
  if (context.engineOn && context.stage) {
    const stage=context.stage;
    const throttle=clamp(guidanceAt(model.guidance,context.elapsedSeconds).throttle,0,1);
    const p=clamp(atmosphere.pressurePa/SEA_LEVEL_PRESSURE,0,1);
    thrustN=throttle*lerp(stage.thrustVacuumN,stage.thrustSeaLevelN,p);
    const isp=lerp(stage.ispVacuumS,stage.ispSeaLevelS,p);
    massFlowKgS=thrustN/(isp*G0);
    if(thrustN>0) {
      const gd=guidanceAt(model.guidance,context.elapsedSeconds);
      const lat=rad(geo.latitudeDeg),lon=rad(geo.longitudeDeg);
      const east={x:-Math.sin(lon),y:Math.cos(lon),z:0};
      const north={x:-Math.sin(lat)*Math.cos(lon),y:-Math.sin(lat)*Math.sin(lon),z:Math.cos(lat)};
      const up={x:Math.cos(lat)*Math.cos(lon),y:Math.cos(lat)*Math.sin(lon),z:Math.sin(lat)};
      const heading=rad(gd.headingDeg), pitch=rad(gd.pitchDeg);
      const horizontal=add(scale(north,Math.cos(heading)),scale(east,Math.sin(heading)));
      const thrustEcf=add(scale(horizontal,Math.cos(pitch)),scale(up,Math.sin(pitch)));
      const direction=ecfToEci(thrustEcf,gstime(date));
      thrustAcceleration=scale(direction,thrustN/state.massKg);
    }
  }

  return {
    gravity, thrustAcceleration, dragAcceleration, thrustN, massFlowKgS, dragN,
    densityKgM3: atmosphere.densityKgM3, pressurePa:atmosphere.pressurePa,
    speedOfSoundMps:atmosphere.speedOfSoundMps,
    atmosphericRelativeVelocityMps:relative,
  };
}

export function derivative(model: LaunchModel, state: DerivativeState, context: PhysicsContext): DerivativeState {
  const forces=computeForces(model,state,context);
  return {
    positionM:state.velocityMps,
    velocityMps:add(add(forces.gravity,forces.thrustAcceleration),forces.dragAcceleration),
    massKg:-forces.massFlowKgS,
  };
}

export function telemetryAt(model:LaunchModel,state:DerivativeState,context:PhysicsContext,stageIndex:number|null,propellantRemainingKg:number):LaunchTelemetry {
  const f=computeForces(model,state,context);
  const time=new Date(model.liftoff.getTime()+context.elapsedSeconds*1000);
  const geo=temeToGeodeticApprox(scale(state.positionM,1/1000),time);
  const atmosphericSpeed=norm(f.atmosphericRelativeVelocityMps);
  const acceleration=add(add(f.gravity,f.dragAcceleration),f.thrustAcceleration);
  const positionTemeKm=scale(state.positionM,1/1000);
  const velocityTemeKmS=scale(state.velocityMps,1/1000);
  return {
    time,elapsedSeconds:context.elapsedSeconds,stageIndex,massKg:state.massKg,
    propellantRemainingKg,altitudeKm:geo.heightKm,latitudeDeg:geo.latitudeDeg,
    longitudeDeg:geo.longitudeDeg,inertialSpeedMps:norm(state.velocityMps),
    atmosphericRelativeSpeedMps:atmosphericSpeed,
    verticalSpeedMps:dot(f.atmosphericRelativeVelocityMps,unit(state.positionM)),
    dynamicPressurePa:0.5*f.densityKgM3*atmosphericSpeed**2,
    mach:atmosphericSpeed/Math.max(1,f.speedOfSoundMps),
    accelerationMps2:norm(acceleration),
    thrustN:f.thrustN,dragN:f.dragN,gravityMps2:norm(f.gravity),
    positionTemeKm,velocityTemeKmS,
  };
}
