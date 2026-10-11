/**
 * Render a server-side Sentinel-2 true-color image with Sentinel Hub Process API.
 * Requires Copernicus Data Space OAuth credentials in environment variables.
 * Uses: OpenLaunch, bbox, copernicus.trueColor
 * Network: yes
 */
import { OpenLaunch, bbox } from "../../src/index.js";

const clientId = process.env.COPERNICUS_CLIENT_ID;
const clientSecret = process.env.COPERNICUS_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.log("Set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET before running this example.");
} else {
  const space = new OpenLaunch({ copernicusClientId: clientId, copernicusClientSecret: clientSecret });
  const image = await space.copernicus.trueColor(
    bbox(4.05, 51.88, 4.25, 52.02),
    "2026-10-01T00:00:00Z",
    "2026-10-11T23:59:59Z",
    { width: 1024, height: 1024, maxCloudCoverage: 20, format: "image/png" },
  );
  console.log({ bytes: image.data.byteLength, contentType: image.contentType });
}
