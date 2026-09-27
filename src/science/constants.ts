export const PHYSICS = Object.freeze({
  gravitationalConstant: 6.67430e-11,
  standardGravity: 9.80665,
  speedOfLight: 299_792_458,
  astronomicalUnit: 149_597_870_700,
  stefanBoltzmann: 5.670374419e-8,
  boltzmann: 1.380649e-23,
  gasConstant: 8.31446261815324,
  solarConstant1AU: 1361,
  earthRotationRate: 7.2921150e-5,
});

export interface CelestialBody {
  name: string;
  mu: number;
  radius: number;
  mass?: number;
  siderealDay?: number;
  semiMajorAxis?: number;
  eccentricity?: number;
  orbitalPeriod?: number;
  atmosphereScaleHeight?: number;
}

export const BODIES = Object.freeze({
  sun: { name: "Sun", mu: 1.32712440018e20, radius: 695_700_000, mass: 1.98847e30 } satisfies CelestialBody,
  mercury: { name: "Mercury", mu: 2.2032e13, radius: 2_439_700, semiMajorAxis: 57_909_050_000, eccentricity: 0.20563, orbitalPeriod: 7_600_543.82 } satisfies CelestialBody,
  venus: { name: "Venus", mu: 3.24859e14, radius: 6_051_800, semiMajorAxis: 108_208_000_000, eccentricity: 0.006772, orbitalPeriod: 19_414_166.4 } satisfies CelestialBody,
  earth: { name: "Earth", mu: 3.986004418e14, radius: 6_378_137, mass: 5.97219e24, siderealDay: 86_164.0905, semiMajorAxis: 149_597_870_700, eccentricity: 0.0167086, orbitalPeriod: 31_558_149.8, atmosphereScaleHeight: 8_500 } satisfies CelestialBody,
  moon: { name: "Moon", mu: 4.9048695e12, radius: 1_737_400, semiMajorAxis: 384_399_000, eccentricity: 0.0549, orbitalPeriod: 2_360_591.5 } satisfies CelestialBody,
  mars: { name: "Mars", mu: 4.282837e13, radius: 3_389_500, mass: 6.4171e23, siderealDay: 88_642.6848, semiMajorAxis: 227_939_200_000, eccentricity: 0.0934, orbitalPeriod: 59_355_072, atmosphereScaleHeight: 11_100 } satisfies CelestialBody,
  jupiter: { name: "Jupiter", mu: 1.26686534e17, radius: 69_911_000, semiMajorAxis: 778_570_000_000, eccentricity: 0.0489, orbitalPeriod: 374_335_776 } satisfies CelestialBody,
  saturn: { name: "Saturn", mu: 3.7931187e16, radius: 58_232_000, semiMajorAxis: 1_433_529_000_000, eccentricity: 0.0565, orbitalPeriod: 929_596_608 } satisfies CelestialBody,
  uranus: { name: "Uranus", mu: 5.793939e15, radius: 25_362_000, semiMajorAxis: 2_872_463_000_000, eccentricity: 0.0457, orbitalPeriod: 2_651_370_624 } satisfies CelestialBody,
  neptune: { name: "Neptune", mu: 6.836529e15, radius: 24_622_000, semiMajorAxis: 4_495_060_000_000, eccentricity: 0.0113, orbitalPeriod: 5_200_418_592 } satisfies CelestialBody,
});
