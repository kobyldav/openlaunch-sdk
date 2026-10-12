import type { LaunchSite } from "./types.js";
import {
  EARTH_OMEGA_RAD_S, cross, dot, launchSiteEcefM, localEnu,
  magnitude, plus, times,
} from "./physics.js";

export interface InclinationTarget {
  /** Target inertial orbital-plane inclination, degrees [0,180]. */
  inclinationDeg: number;
  /** Assumed horizontal speed relative to rotating launch pad (m/s). */
  horizontalSpeedMps: number;
  /** WGS84 site used for preliminary plane targeting. */
  site: LaunchSite;
}

export interface AzimuthSolution {
  azimuthDeg: number;
  resultingInclinationDeg: number;
  /** Which side of the local launch site the trajectory initially heads toward. */
  hemisphereDirection: "northbound" | "southbound";
  assumedHorizontalSpeedMps: number;
  model: "local-tangent-plane-with-earth-rotation";
}

/**
 * Solve candidate horizontal pad headings for a target orbital inclination.
 *
 * Uses inertial velocity = local tangent horizontal velocity + omega x r.
 * It does not model a rocket gravity turn, insertion latitude/longitude,
 * range safety corridor, RAAN target, terrain or launch windows.
 */
export function candidateLaunchAzimuths(target:InclinationTarget):AzimuthSolution[]{
  const {site,inclinationDeg,horizontalSpeedMps}=target;
  if(!Number.isFinite(inclinationDeg)||inclinationDeg<0||inclinationDeg>180)
    throw new RangeError("inclinationDeg must be within [0,180]");
  if(!Number.isFinite(horizontalSpeedMps)||horizontalSpeedMps<=0)
    throw new RangeError("horizontalSpeedMps must be positive");
  if(!Number.isFinite(site.latitudeDeg)||Math.abs(site.latitudeDeg)>90 ||
    !Number.isFinite(site.longitudeDeg)||Math.abs(site.longitudeDeg)>180 ||
    !Number.isFinite(site.altitudeM))
    throw new RangeError("Invalid launch site");

  const position=launchSiteEcefM(site);
  const {east,north}=localEnu(position);
  const rotationVelocity:[number,number,number]=[
    -EARTH_OMEGA_RAD_S*position[1],
    EARTH_OMEGA_RAD_S*position[0],
    0,
  ];
  const inclinationAt=(azimuthDeg:number):number=>{
    const az=azimuthDeg*Math.PI/180;
    const relative=plus(times(east,horizontalSpeedMps*Math.sin(az)),
      times(north,horizontalSpeedMps*Math.cos(az)));
    const velocity=plus(rotationVelocity,relative);
    const angularMomentum=cross(position,velocity);
    const mag=magnitude(angularMomentum);
    if(!(mag>0))return Number.NaN;
    const cosine=Math.max(-1,Math.min(1,angularMomentum[2]/mag));
    return Math.acos(cosine)*180/Math.PI;
  };

  const roots:number[]=[];
  let prev=0,prevDiff=inclinationAt(0)-inclinationDeg;
  const samples=360;
  for(let i=1;i<=samples;i++){
    const az=i;
    const diff=inclinationAt(az)-inclinationDeg;
    if(Math.abs(prevDiff)<1e-8 && roots.every(root=>Math.abs(root-prev)>1e-4))roots.push(prev);
    if(diff*prevDiff<0){
      let lo=prev,hi=az;
      const rising=diff>prevDiff;
      for(let k=0;k<48;k++){
        const mid=(lo+hi)/2;
        const err=inclinationAt(mid)-inclinationDeg;
        if(rising ? err>0 : err<0)hi=mid;
        else lo=mid;
      }
      const solution=((lo+hi)/2)%360;
      if(roots.every(root=>Math.min(Math.abs(root-solution),360-Math.abs(root-solution))>1e-5))
        roots.push(solution);
    }
    prev=az;prevDiff=diff;
  }
  if(Math.abs(prevDiff)<1e-8 && roots.every(root=>Math.abs(root)<1e-4))roots.push(0);

  return roots.sort((a,b)=>a-b).map(azimuthDeg=>({
    azimuthDeg,
    resultingInclinationDeg:inclinationAt(azimuthDeg),
    hemisphereDirection:Math.cos(azimuthDeg*Math.PI/180)>=0?"northbound":"southbound",
    assumedHorizontalSpeedMps:horizontalSpeedMps,
    model:"local-tangent-plane-with-earth-rotation" as const,
  }));
}
