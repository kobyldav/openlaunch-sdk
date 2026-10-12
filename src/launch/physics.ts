import { ecfToEci, gstime } from "satellite.js";
import { isa1976 } from "../science/atmosphere.js";
import { geodeticToEcef, ecefToGeodetic, WGS84 } from "../science/geodesy.js";
import type { CartesianKm } from "../orbit/types.js";
import type {
  AscentGuidance, AscentStage, LaunchEnvironment, LaunchSite, OsculatingOrbitEstimate,
} from "./types.js";

export type V3 = readonly [number, number, number];
export const EARTH_MU_M3S2 = 3.986004418e14;
export const EARTH_OMEGA_RAD_S = 7.2921150e-5;
export const STANDARD_G0 = 9.80665;
export const EARTH_J2 = 1.08262668e-3;

export const plus = (a: V3, b: V3): V3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const minus = (a: V3, b: V3): V3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const times = (a: V3, k: number): V3 => [a[0]*k,a[1]*k,a[2]*k];
export const magnitude = (a: V3): number => Math.hypot(...a);
export const dot = (a: V3, b: V3): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a: V3, b: V3): V3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit = (v: V3): V3 => { const n=magnitude(v); if (!(n>0)) throw new RangeError("Cannot normalize zero vector"); return times(v,1/n); };
export const toVector = (c: CartesianKm): V3 => [c.x,c.y,c.z];
export const fromVector = (v: V3): CartesianKm => ({x:v[0],y:v[1],z:v[2]});
const deg = (x: number): number => x*Math.PI/180;

export function launchSiteEcefM(site: LaunchSite): V3 {
  const r = geodeticToEcef({latitudeDeg:site.latitudeDeg,longitudeDeg:site.longitudeDeg,altitudeM:site.altitudeM});
  return [r[0],r[1],r[2]];
}

export function localEnu(positionEcefM: V3): { east: V3; north: V3; up: V3 } {
  const location = ecefToGeodetic(positionEcefM);
  const lat=deg(location.latitudeDeg),lon=deg(location.longitudeDeg);
  const east:V3=[-Math.sin(lon),Math.cos(lon),0];
  const north:V3=[-Math.sin(lat)*Math.cos(lon),-Math.sin(lat)*Math.sin(lon),Math.cos(lat)];
  const up:V3=[Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];
  return {east,north,up};
}

export interface Control { elevationDeg:number; azimuthDeg:number; throttle:number; }
export function guidanceAt(guidance: AscentGuidance, tSeconds: number): Control {
  const knots=guidance.program;
  const start=knots[0]!;
  if(tSeconds<=start.tSeconds) return {elevationDeg:start.elevationDeg,azimuthDeg:start.azimuthDeg,throttle:start.throttle??1};
  for(let i=1;i<knots.length;i++){
    const a=knots[i-1]!,b=knots[i]!;
    if(tSeconds<=b.tSeconds){
      const u=(tSeconds-a.tSeconds)/(b.tSeconds-a.tSeconds);
      // Shortest azimuth interpolation across 0/360.
      const delta=((b.azimuthDeg-a.azimuthDeg+540)%360)-180;
      return {
        elevationDeg:a.elevationDeg+(b.elevationDeg-a.elevationDeg)*u,
        azimuthDeg:(a.azimuthDeg+delta*u+360)%360,
        throttle:(a.throttle??1)+((b.throttle??1)-(a.throttle??1))*u,
      };
    }
  }
  const last=knots[knots.length-1]!;
  return {elevationDeg:last.elevationDeg,azimuthDeg:last.azimuthDeg,throttle:last.throttle??1};
}

export function thrustUnitEcef(positionEcefM: V3, control: Control): V3 {
  const enu=localEnu(positionEcefM);
  const el=deg(control.elevationDeg), az=deg(control.azimuthDeg);
  return plus(
    plus(times(enu.east,Math.cos(el)*Math.sin(az)),times(enu.north,Math.cos(el)*Math.cos(az))),
    times(enu.up,Math.sin(el)),
  );
}

export function gravityEcefMps2(positionEcefM: V3, useJ2=false): V3 {
  const [x,y,z]=positionEcefM;
  const radius=magnitude(positionEcefM);
  if(!(radius>WGS84.a*0.8)) throw new RangeError("Position is inside the Earth");
  const central=times(positionEcefM,-EARTH_MU_M3S2/(radius**3));
  if(!useJ2) return central;
  const z2r2=(z/radius)**2;
  const k=1.5*EARTH_J2*EARTH_MU_M3S2*(WGS84.a**2)/(radius**5);
  return plus(central,[k*x*(5*z2r2-1),k*y*(5*z2r2-1),k*z*(5*z2r2-3)]);
}

export function airAtAltitude(altitudeM: number, scaleHeightM=7000) {
  const h=Math.max(-500,altitudeM);
  const capped=Math.min(84852,h);
  const standard=isa1976(capped);
  const densityKgM3=h<=84852?standard.densityKgM3:
    standard.densityKgM3*Math.exp(-(h-84852)/scaleHeightM);
  const pressurePa=h<=84852?standard.pressurePa:
    standard.pressurePa*Math.exp(-(h-84852)/scaleHeightM);
  return {...standard,densityKgM3,pressurePa};
}

export function windEcefMps(positionEcefM:V3, environment:LaunchEnvironment):V3{
  const enu=localEnu(positionEcefM);
  return plus(
    plus(times(enu.east,environment.windEastMps??0),times(enu.north,environment.windNorthMps??0)),
    times(enu.up,environment.windUpMps??0),
  );
}

export function engineAt(stage:AscentStage, pressurePa:number) {
  const seaRatio=Math.max(0,Math.min(1,pressurePa/101325));
  const thrustN=stage.thrustVacuumN+(stage.thrustSeaLevelN-stage.thrustVacuumN)*seaRatio;
  const ispS=stage.ispVacuumS+(stage.ispSeaLevelS-stage.ispVacuumS)*seaRatio;
  return { thrustN, ispS, massFlowKgS: thrustN/(ispS*STANDARD_G0) };
}

export function ecefToTemeApprox(positionEcefM:V3, velocityEcefMps:V3, time:Date) {
  const inertialVelocityEcef:V3=[
    velocityEcefMps[0]-EARTH_OMEGA_RAD_S*positionEcefM[1],
    velocityEcefMps[1]+EARTH_OMEGA_RAD_S*positionEcefM[0],
    velocityEcefMps[2],
  ];
  const gmst=gstime(time);
  const p=ecfToEci(fromVector(positionEcefM),gmst);
  const v=ecfToEci(fromVector(inertialVelocityEcef),gmst);
  return {
    positionTemeKm:{x:p.x/1000,y:p.y/1000,z:p.z/1000},
    velocityTemeKmS:{x:v.x/1000,y:v.y/1000,z:v.z/1000},
  };
}

export function twoBodyOrbitEstimate(positionInertialM:V3, velocityInertialMps:V3):OsculatingOrbitEstimate {
  const r=magnitude(positionInertialM),v2=dot(velocityInertialMps,velocityInertialMps);
  const h=cross(positionInertialM,velocityInertialMps);
  const hNorm=magnitude(h);
  const energy=v2/2-EARTH_MU_M3S2/r;
  const evec=minus(times(cross(velocityInertialMps,h),1/EARTH_MU_M3S2),times(positionInertialM,1/r));
  const e=magnitude(evec);
  const periapsisM=hNorm**2/(EARTH_MU_M3S2*(1+e));
  const bound=energy<0 && e<1;
  const apoapsisM=bound?hNorm**2/(EARTH_MU_M3S2*(1-e)):null;
  return {
    eccentricity:e,
    inclinationDeg:hNorm>0?Math.acos(Math.max(-1,Math.min(1,h[2]/hNorm)))*180/Math.PI:0,
    periapsisAltitudeKm:(periapsisM-WGS84.a)/1000,
    apoapsisAltitudeKm:apoapsisM===null?null:(apoapsisM-WGS84.a)/1000,
    specificOrbitalEnergyJkg:energy,
    bound,
  };
}
