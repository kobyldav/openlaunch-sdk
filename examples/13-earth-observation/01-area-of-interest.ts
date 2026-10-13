/**
 * Build a reusable geospatial area of interest.
 * Uses: circle, bbox, centerOf, areaKm2Approx
 * Network: no
 */
import { areaKm2Approx, centerOf, circle } from "../../src/index.js";

const rotterdamTerminal = circle([4.1453, 51.9475], 5);
console.log({
  bbox: rotterdamTerminal.bbox,
  center: centerOf(rotterdamTerminal),
  approximateAreaKm2: areaKm2Approx(rotterdamTerminal),
  geojson: rotterdamTerminal.geometry,
});
