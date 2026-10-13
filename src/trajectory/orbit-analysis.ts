import { BODIES } from "../science/constants.js";
import { stateToOrbitalElements } from "../science/orbits.js";
import type { TimedTemeState } from "../traffic/types.js";

export interface LaunchOrbitalAssessment {
  time: Date;
  model: "instantaneous-two-body-osculating";
  specificEnergyJkg: number;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  semiMajorAxisKm: number | null;
  perigeeAltitudeKm: number;
  apogeeAltitudeKm: number | null;
  periodMinutes: number | null;
  /** A kinematic candidate only. Real stable orbit requires additional drag/maneuver analysis. */
  classification: "suborbital" | "bound-orbit-candidate" | "unbound-trajectory";
  /** A rough geometric criterion, not operational orbit insertion verification. */
  perigeeAbove160Km: boolean;
}

/**
 * Instantaneous osculating two-body analysis of a TEME-approx Cartesian state.
 * J2, atmosphere and maneuvers are NOT propagated in this assessment.
 */
export function assessLaunchOrbit(state: TimedTemeState): LaunchOrbitalAssessment | null {
  const r=state.positionTemeKm;
  const v=state.velocityTemeKmS;
  const rM:[number,number,number]=[r.x*1000,r.y*1000,r.z*1000];
  const vMps:[number,number,number]=[v.x*1000,v.y*1000,v.z*1000];
  let oe:ReturnType<typeof stateToOrbitalElements>;
  try {oe=stateToOrbitalElements({positionM:rM,velocityMps:vMps});}
  catch{return null;}
  const e=oe.eccentricity;
  const a=oe.semiMajorAxisM;
  const mu=BODIES.earth.mu;
  const radius=BODIES.earth.radius;
  const bound=oe.specificOrbitalEnergy<0 && e<1 && a>0;
  const perigeeAltitudeKm=(oe.semiLatusRectumM/(1+e)-radius)/1000;
  const apogeeAltitudeKm=bound ? (a*(1+e)-radius)/1000 : null;
  const periodMinutes=bound ? 2*Math.PI*Math.sqrt(a*a*a/mu)/60 : null;
  const perigeeAbove160Km=bound && perigeeAltitudeKm>=160;
  return {
    time:new Date(state.time),model:"instantaneous-two-body-osculating",
    specificEnergyJkg:oe.specificOrbitalEnergy,
    eccentricity:e,inclinationDeg:oe.inclinationRad*180/Math.PI,
    raanDeg:oe.raanRad*180/Math.PI,
    semiMajorAxisKm:Number.isFinite(a)?a/1000:null,
    perigeeAltitudeKm,
    apogeeAltitudeKm,
    periodMinutes,
    classification:bound?(perigeeAbove160Km?"bound-orbit-candidate":"suborbital"):"unbound-trajectory",
    perigeeAbove160Km,
  };
}
