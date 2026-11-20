# Real Prague 3D: Sentinel-2 colour + Copernicus DEM GLO-30

This feature deliberately **does not use stereo matching**. It combines real
Sentinel-2 Level-2A bands (Element84 Earth Search public STAC/COG) with actual
Copernicus DEM GLO-30 public AWS Cloud Optimized GeoTIFF elevation tiles.
There are **no synthetic heights, fabricated buildings or fallback screenshots**.

## One command on Windows CMD

From branch `feature/terrain-prague-real-dem`:

```cmd
cd /d "%USERPROFILE%\Desktop\openlaunch-terrain"
git fetch origin
git switch feature/terrain-prague-real-dem
npm ci
npm run example:terrain-prague-3d
start "" "test-results\terrain-prague-3d\index.html"
```

The script makes real HTTPS requests; on provider failure, it writes a
diagnostic HTML/report and exits nonzero. To choose a different AOI or dates:

```cmd
npm run example:terrain-prague-3d -- --bounds 14.411 50.083 14.430 50.094 --from 2025-06-01 --to 2025-09-30 --max-cloud 35 --resolution 30
```

Outputs:
- `index.html` — self-contained mouse/touch 3D viewer with RGB/elevation switch, rotation, zoom and exaggeration slider (1x = physical scale).
- `terrain.obj` — local east/height/north positions in metres, height datum EGM2008.
- `report.json` — precise provider, scene ID, date, DEM tile URLs, height coverage, and geometry metadata.

## SDK usage

```ts
import { OpenLaunch, bbox } from "openlaunch-sdk";
const space = new OpenLaunch();
const result = await space.terrain.load({
  area: bbox(14.411, 50.083, 14.430, 50.094),
  startDate: "2025-06-01",
  endDate: "2025-09-30",
  resolutionM: 30
});
console.log(result.mesh.positions, result.mesh.triangles, result.vertexRgb);
console.log(result.metadata.demTileUrls, result.metadata.sceneId);
```

Copernicus DEM comes directly from the public AWS GLO-30 COG bucket
(no Planetary Computer SAS key needed). The SDK reads only COG byte ranges
and supports up to four intersecting 1-degree tiles for a bounded AOI
of 9 km². Both source families are already handled by SDK raster helpers.

**Limits:** GLO-30 is a ~30m **digital surface model**, not a building
model. Heights reference EGM2008, *not* WGS84 ellipsoidal elevations.
No vertical datum conversion is implied. Sentinel-2 RGB is ~10m native,
but displayed colours are sampled at 30m mesh vertices (not full 10m
texture mapping). Scene-wide cloud cover is not a pixel cloud mask.
No live stereophotogrammetry, sub-metre detail, rooftop vector extraction,
facades, or accuracy certification.

The 3D mesh's horizontal positions are local ground metres corrected
for Web Mercator magnification at the AOI centre. Larger AOIs need a
different geodetic approach; do not use this approximation for flight safety.

The project keeps the original 3D stereo experimental code on its
own API. **No changes to the repository's main branch are required.**
