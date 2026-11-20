# OpenLaunch SDK: real Prague Sentinel-2 tile

This demo fetches **real** Sentinel-2 Level 2A red, green and blue bands
through the OpenLaunch STAC client (Element84 Earth Search) and the SDK's
single-band, range-requested COG loader. It never downloads a whole Sentinel
scene. Location is central Prague, bounded by
[14.411 E, 50.083 N, 14.430 E, 50.094 N] (roughly 1.35 × 1.2 km).

**NOT stereoscopic 3D:** Sentinel-2 has 10 m RGB ground sampling distance
and is not designed for high-detail photogrammetric city reconstructions.
The output is a real RGB image using visually stretched native DN values,
not calibrated reflectance, survey elevations or synthetic buildings.

Windows CMD:

~~~cmd
cd /d "%USERPROFILE%\Desktop\openlaunch-terrain"
git pull --ff-only origin feature/terrain-reconstruction
npm run example:terrain-prague
start "" "test-results\terrain-prague-sentinel2\index.html"
~~~

Default data search: June–September 2025, 35% scene cloud limit.
Override with \`--from 2026-05-01 --to 2026-09-30 --max-cloud 50\`.
The scene date actually selected is shown in the report and viewer.
Add \`--refresh\` to repeat STAC discovery and download. A valid PNG and
matching date parameters are cached between local runs.

Outputs: \`prague-sentinel2-rgb.png\`, \`report.json\`, \`index.html\`.
The report records exact scene, acquisition, asset URLs, native resolution,
valid RGB pixels, contrast stretch and explicit "no height model" provenance.
If STAC/COG access fails, the script creates a diagnostic HTML without
presenting fake data.

For actual detailed Prague 3D, a separate licensed calibrated overlapping
**aerial stereo image pair** and/or clearly identified independent DSM is
needed; a single ortho image or a Sentinel-2 RGB tile is not enough.
