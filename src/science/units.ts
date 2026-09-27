import { ValidationError } from "../errors.js";

export type UnitDimension = "length" | "mass" | "time" | "velocity" | "acceleration" | "angle" | "temperature" | "pressure" | "energy" | "power" | "force" | "area" | "volume" | "frequency" | "data";
export interface UnitDefinition { dimension: UnitDimension; scale: number; offset?: number; }

export const UNITS: Readonly<Record<string, UnitDefinition>> = Object.freeze({
  m: { dimension: "length", scale: 1 }, km: { dimension: "length", scale: 1e3 }, cm: { dimension: "length", scale: 1e-2 }, mm: { dimension: "length", scale: 1e-3 }, um: { dimension: "length", scale: 1e-6 }, nm: { dimension: "length", scale: 1e-9 },
  in: { dimension: "length", scale: 0.0254 }, ft: { dimension: "length", scale: 0.3048 }, yd: { dimension: "length", scale: 0.9144 }, mi: { dimension: "length", scale: 1609.344 }, nmi: { dimension: "length", scale: 1852 }, au: { dimension: "length", scale: 149_597_870_700 }, ly: { dimension: "length", scale: 9.4607304725808e15 }, pc: { dimension: "length", scale: 3.085677581491367e16 },
  kg: { dimension: "mass", scale: 1 }, g: { dimension: "mass", scale: 1e-3 }, mg: { dimension: "mass", scale: 1e-6 }, t: { dimension: "mass", scale: 1e3 }, lb: { dimension: "mass", scale: 0.45359237 }, oz: { dimension: "mass", scale: 0.028349523125 }, slug: { dimension: "mass", scale: 14.59390294 },
  s: { dimension: "time", scale: 1 }, ms: { dimension: "time", scale: 1e-3 }, us: { dimension: "time", scale: 1e-6 }, min: { dimension: "time", scale: 60 }, h: { dimension: "time", scale: 3600 }, day: { dimension: "time", scale: 86400 }, week: { dimension: "time", scale: 604800 }, year: { dimension: "time", scale: 31_557_600 },
  "m/s": { dimension: "velocity", scale: 1 }, "km/s": { dimension: "velocity", scale: 1e3 }, "km/h": { dimension: "velocity", scale: 1 / 3.6 }, mph: { dimension: "velocity", scale: 0.44704 }, knot: { dimension: "velocity", scale: 0.514444444444 }, fps: { dimension: "velocity", scale: 0.3048 },
  "m/s2": { dimension: "acceleration", scale: 1 }, "ft/s2": { dimension: "acceleration", scale: 0.3048 }, g0: { dimension: "acceleration", scale: 9.80665 },
  rad: { dimension: "angle", scale: 1 }, deg: { dimension: "angle", scale: Math.PI / 180 }, arcmin: { dimension: "angle", scale: Math.PI / 10800 }, arcsec: { dimension: "angle", scale: Math.PI / 648000 }, rev: { dimension: "angle", scale: 2 * Math.PI },
  K: { dimension: "temperature", scale: 1, offset: 0 }, C: { dimension: "temperature", scale: 1, offset: 273.15 }, F: { dimension: "temperature", scale: 5 / 9, offset: 255.3722222222222 }, R: { dimension: "temperature", scale: 5 / 9, offset: 0 },
  Pa: { dimension: "pressure", scale: 1 }, kPa: { dimension: "pressure", scale: 1e3 }, MPa: { dimension: "pressure", scale: 1e6 }, bar: { dimension: "pressure", scale: 1e5 }, atm: { dimension: "pressure", scale: 101325 }, psi: { dimension: "pressure", scale: 6894.757293168 }, torr: { dimension: "pressure", scale: 133.322368421 },
  J: { dimension: "energy", scale: 1 }, kJ: { dimension: "energy", scale: 1e3 }, MJ: { dimension: "energy", scale: 1e6 }, GJ: { dimension: "energy", scale: 1e9 }, Wh: { dimension: "energy", scale: 3600 }, kWh: { dimension: "energy", scale: 3.6e6 }, eV: { dimension: "energy", scale: 1.602176634e-19 },
  W: { dimension: "power", scale: 1 }, kW: { dimension: "power", scale: 1e3 }, MW: { dimension: "power", scale: 1e6 }, GW: { dimension: "power", scale: 1e9 }, hp: { dimension: "power", scale: 745.699871582 },
  N: { dimension: "force", scale: 1 }, kN: { dimension: "force", scale: 1e3 }, MN: { dimension: "force", scale: 1e6 }, lbf: { dimension: "force", scale: 4.4482216152605 },
  m2: { dimension: "area", scale: 1 }, km2: { dimension: "area", scale: 1e6 }, cm2: { dimension: "area", scale: 1e-4 }, ft2: { dimension: "area", scale: 0.09290304 }, acre: { dimension: "area", scale: 4046.8564224 },
  m3: { dimension: "volume", scale: 1 }, L: { dimension: "volume", scale: 1e-3 }, mL: { dimension: "volume", scale: 1e-6 }, ft3: { dimension: "volume", scale: 0.028316846592 }, galUS: { dimension: "volume", scale: 0.003785411784 },
  Hz: { dimension: "frequency", scale: 1 }, kHz: { dimension: "frequency", scale: 1e3 }, MHz: { dimension: "frequency", scale: 1e6 }, GHz: { dimension: "frequency", scale: 1e9 }, THz: { dimension: "frequency", scale: 1e12 },
  bit: { dimension: "data", scale: 1 }, byte: { dimension: "data", scale: 8 }, kbit: { dimension: "data", scale: 1e3 }, Mbit: { dimension: "data", scale: 1e6 }, Gbit: { dimension: "data", scale: 1e9 }, KiB: { dimension: "data", scale: 8192 }, MiB: { dimension: "data", scale: 8_388_608 }, GiB: { dimension: "data", scale: 8_589_934_592 },
});

export function convert(value: number, from: string, to: string): number {
  const a = UNITS[from], b = UNITS[to];
  if (!a) throw new ValidationError(`Unknown unit: ${from}`);
  if (!b) throw new ValidationError(`Unknown unit: ${to}`);
  if (a.dimension !== b.dimension) throw new ValidationError(`Cannot convert ${from} (${a.dimension}) to ${to} (${b.dimension})`);
  const si = value * a.scale + (a.offset ?? 0);
  return (si - (b.offset ?? 0)) / b.scale;
}
export const toRadians = (degrees: number): number => degrees * Math.PI / 180;
export const toDegrees = (radians: number): number => radians * 180 / Math.PI;
export const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;
export const normalizeRadians = (radians: number): number => ((radians % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
export function supportedUnits(dimension?: UnitDimension): string[] { return Object.entries(UNITS).filter(([, def]) => !dimension || def.dimension === dimension).map(([name]) => name); }
