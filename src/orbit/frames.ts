import {
  degreesLat,
  degreesLong,
  degreesToRadians,
  eciToEcf,
  eciToGeodetic,
  geodeticToEcf,
  gstime,
} from "satellite.js";
import type { CartesianKm, GeodeticState } from "./types.js";

export const EARTH_ROTATION_RATE_RAD_S = 7.2921150e-5;

export interface TemeStateKm {
  positionKm: CartesianKm;
  velocityKmS: CartesianKm;
}

export interface EarthFixedStateKm {
  positionKm: CartesianKm;
  velocityKmS: CartesianKm;
  transform: "GMST-rotation-no-polar-motion";
}

/**
 * Rotate a TEME/ECI-like position to an Earth-fixed frame using GMST.
 *
 * This is appropriate for ordinary visualization, ground tracks and pass geometry.
 * It is not a full IERS TEME->ITRF transformation: UT1 corrections, polar motion
 * and higher-order Earth-orientation terms are not applied.
 */
export function temeToEcfPositionApprox(positionTemeKm: CartesianKm, at: Date): CartesianKm {
  const ecf = eciToEcf(positionTemeKm, gstime(at));
  return { x: ecf.x, y: ecf.y, z: ecf.z };
}

/**
 * Rotate position and inertial-like velocity into the Earth-fixed frame.
 * The velocity includes the -omega x r rotating-frame term, unlike simply
 * rotating the velocity vector as if it were a position.
 */
export function temeToEcfStateApprox(state: TemeStateKm, at: Date): EarthFixedStateKm {
  const gmst = gstime(at);
  const p = eciToEcf(state.positionKm, gmst);
  const vRotated = eciToEcf(state.velocityKmS, gmst);
  const omegaCrossR = {
    x: -EARTH_ROTATION_RATE_RAD_S * p.y,
    y: EARTH_ROTATION_RATE_RAD_S * p.x,
    z: 0,
  };
  return {
    positionKm: { x: p.x, y: p.y, z: p.z },
    velocityKmS: {
      x: vRotated.x - omegaCrossR.x,
      y: vRotated.y - omegaCrossR.y,
      z: vRotated.z,
    },
    transform: "GMST-rotation-no-polar-motion",
  };
}

export function temeToGeodeticApprox(positionTemeKm: CartesianKm, at: Date): GeodeticState {
  const gd = eciToGeodetic(positionTemeKm, gstime(at));
  return {
    latitudeDeg: degreesLat(gd.latitude),
    longitudeDeg: degreesLong(gd.longitude),
    heightKm: gd.height,
  };
}

export function geodeticToEcfKm(position: {
  latitudeDeg: number;
  longitudeDeg: number;
  heightKm?: number;
}): CartesianKm {
  const ecf = geodeticToEcf({
    latitude: degreesToRadians(position.latitudeDeg),
    longitude: degreesToRadians(position.longitudeDeg),
    height: position.heightKm ?? 0,
  });
  return { x: ecf.x, y: ecf.y, z: ecf.z };
}
