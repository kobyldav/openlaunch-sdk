/**
 * Compute common remote-sensing indices from already calibrated reflectance samples.
 * Uses: ndvi, ndwi, ndmi, nbr, evi, savi
 * Network: no
 */
import { evi, nbr, ndmi, ndvi, ndwi, savi } from "../../src/index.js";

const red = 0.18;
const green = 0.24;
const blue = 0.12;
const nir = 0.62;
const swir1 = 0.31;
const swir2 = 0.20;

console.log({
  ndvi: ndvi(nir, red),
  ndwi: ndwi(green, nir),
  ndmi: ndmi(nir, swir1),
  nbr: nbr(nir, swir2),
  evi: evi(nir, red, blue),
  savi: savi(nir, red),
});
