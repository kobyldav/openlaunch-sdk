import { OpenLaunch, ommToOrbitalElements } from "../src/index.js";

const sdk = new OpenLaunch();
const records = await sdk.celestrak.byCatalogNumber(25544);
const iss = records[0];

if (iss) {
  console.log(iss.OBJECT_NAME, iss.NORAD_CAT_ID, iss.EPOCH);
  console.log(ommToOrbitalElements(iss));
}
