/**
 * Pixel math operates on already-decoded image samples.
 * OpenLaunch does not implicitly fetch COG tiles, resample bands or parse GeoTIFF.
 */
export interface SurfaceTemperature {
  kelvin: number;
  celsius: number;
  source: "landsat-c2-l2-st-b10";
  physicalQuantity: "land-surface-temperature";
}
export interface PixelMaskSummary {
  total: number;
  usable: number;
  cloudy: number;
  clear: number;
  noData: number;
  cloudPercentOfUsable: number | null;
  clearPercentOfUsable: number | null;
  source: "sentinel-2-scl";
}

/**
 * USGS Landsat Collection 2 Level-2 ST_B10 calibration:
 * Kelvin = DN * 0.00341802 + 149.0. This is land surface temperature,
 * not 2 m air temperature. Only valid for an actual ST_B10 pixel with QA.
 */
export function landsatC2SurfaceTemperature(dn: number, isValid = true): SurfaceTemperature | null {
  if (!isValid || !Number.isInteger(dn) || dn <= 0 || dn > 65535) return null;
  const kelvin = dn * 0.00341802 + 149.0;
  return { kelvin, celsius: kelvin - 273.15, source: "landsat-c2-l2-st-b10", physicalQuantity: "land-surface-temperature" };
}

/** ST_QA uncertainty for Landsat Collection 2 Level-2, standard scaling in kelvin. */
export function landsatC2StUncertaintyKelvin(dn: number): number | null {
  return Number.isInteger(dn) && dn > 0 && dn <= 32767 ? dn * 0.01 : null;
}

/** Sentinel-2 L2A SCL scene-classification codes; not a cloud mask for other sensors. */
export function sentinel2SclClass(code: number): "clear" | "cloud" | "no-data" | "shadow" | "snow" | "unclassified" {
  if (!Number.isInteger(code) || code < 0 || code > 11) return "no-data";
  if (code === 0 || code === 1) return "no-data";
  if (code === 3) return "shadow";
  if (code === 8 || code === 9 || code === 10) return "cloud";
  if (code === 11) return "snow";
  if (code === 7 || code === 2) return "unclassified";
  return "clear"; // SCL: vegetation (4), bare soils (5), water (6)
}

/**
 * Summarize a caller-provided, already-clipped/resampled SCL raster.
 * If it is not clipped to the AOI, these percentages are NOT AOI cloud cover.
 */
export function summarizeSentinel2Scl(codes: readonly number[]): PixelMaskSummary {
  if (!codes.length) return {
    total: 0, usable: 0, cloudy: 0, clear: 0, noData: 0,
    cloudPercentOfUsable: null, clearPercentOfUsable: null, source: "sentinel-2-scl",
  };
  let clear = 0, cloudy = 0, noData = 0;
  for (const code of codes) {
    const kind = sentinel2SclClass(code);
    if (kind === "clear") clear++;
    else if (kind === "cloud") cloudy++;
    else if (kind === "no-data") noData++;
  }
  // All valid SCL categories are counted in the denominator:
  // shadows/snow/unclassified do not become fictitious clear pixels.
  const usable = codes.length - noData;
  return {
    total: codes.length, usable, cloudy, clear, noData,
    cloudPercentOfUsable: usable ? 100 * cloudy / usable : null,
    clearPercentOfUsable: usable ? 100 * clear / usable : null,
    source: "sentinel-2-scl",
  };
}
