export interface SpectralSample {
  red?: number;
  green?: number;
  blue?: number;
  nir?: number;
  swir1?: number;
  swir2?: number;
}

export function normalizedDifference(a: number, b: number): number {
  const denominator = a + b;
  if (Math.abs(denominator) < 1e-12) return 0;
  return (a - b) / denominator;
}

export const ndvi = (nir: number, red: number): number => normalizedDifference(nir, red);
export const ndwi = (green: number, nir: number): number => normalizedDifference(green, nir);
export const ndmi = (nir: number, swir1: number): number => normalizedDifference(nir, swir1);
export const nbr = (nir: number, swir2: number): number => normalizedDifference(nir, swir2);

export function evi(nir: number, red: number, blue: number, gain = 2.5, c1 = 6, c2 = 7.5, l = 1): number {
  const denominator = nir + c1 * red - c2 * blue + l;
  if (Math.abs(denominator) < 1e-12) return 0;
  return gain * (nir - red) / denominator;
}

export function savi(nir: number, red: number, l = 0.5): number {
  const denominator = nir + red + l;
  if (Math.abs(denominator) < 1e-12) return 0;
  return ((nir - red) / denominator) * (1 + l);
}

export function indexSet(sample: Required<Pick<SpectralSample, "red" | "green" | "blue" | "nir" | "swir1" | "swir2">>): Record<string, number> {
  return {
    ndvi: ndvi(sample.nir, sample.red),
    ndwi: ndwi(sample.green, sample.nir),
    ndmi: ndmi(sample.nir, sample.swir1),
    nbr: nbr(sample.nir, sample.swir2),
    evi: evi(sample.nir, sample.red, sample.blue),
    savi: savi(sample.nir, sample.red),
  };
}
