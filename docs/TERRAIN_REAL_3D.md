# Real Prague 3D: native Sentinel-2 texture + Copernicus GLO-30 heights

Real Sentinel-2 L2A RGB imagery is fetched from public Element84 Earth Search STAC/COG
and independently georeferenced onto real Copernicus DEM GLO-30 public AWS height tiles.
This is **DEM-based 2.5D**: no fictional elevations or fake high-resolution buildings.

## Windows CMD

From an existing checkout:

```cmd
cd /d "%USERPROFILE%\Desktop\openlaunch-terrain"
git switch feature/terrain-prague-real-dem
git pull --ff-only origin feature/terrain-prague-real-dem
npm run example:terrain-prague-3d
start "" "test-results\terrain-prague-3d\index.html"
```

For another small region (<=9 km²), date range, or output sampling:

```cmd
npm run example:terrain-prague-3d -- --bounds 14.411 50.083 14.430 50.094 --from 2025-06-01 --to 2025-09-30 --max-cloud 35 --resolution 30
```

## Outputs

- `index.html`: self-contained offline WebGL viewer (GPU orbit, zoom, top view, 1–6x height exaggeration, satellite texture, elevation shading, wireframe). Includes 2D vertex-color fallback when WebGL unavailable.
- `terrain.obj`: triangulated local east / EGM2008 height / north geometry with 0..1 UV coordinates.
- `terrain.mtl`: OBJ material pointing to the real RGB PNG.
- `terrain-texture.png`: true Sentinel-2 RGB RGBA texture with NoData alpha, independent of DEM mesh spacing.
- `report.json`: satellite scene and acquisition date, image and DEM source, spatial resolution, texture dimensions, exact height coverage.

**Keep OBJ, MTL and PNG in the same folder** when importing the model into Blender or another 3D tool.

## SDK

```ts
import {OpenLaunch,bbox} from "openlaunch-sdk";

const map=await new OpenLaunch().terrain.load({
  area:bbox(14.411,50.083,14.430,50.094),
  startDate:"2025-06-01",endDate:"2025-09-30",
  resolutionM:30
});
console.log(map.mesh.positions,map.mesh.triangles);
console.log(map.imageryTexture.width,map.imageryTexture.height);
console.log(map.imageryTexture.rgba); // actual sampled Sentinel-2 texture bytes
console.log(map.metadata.demTileUrls);
```

## Correct interpretation and constraints

- Sentinel-2 images are native ~10m RGB observations; output texture is reprojected
  to the local target grid at native nominal ground spacing, with no fabricated pixel samples.
  Interpolation/reprojection does not add observed information.
- The 3D geometry is from Copernicus GLO-30 ~30m digital **surface** heights.
  Selecting 20m output spacing does not create higher precision DEM measurements.
- Height datum EGM2008 geoid; no ellipsoidal correction. The local display uses
  an approximation to correct Web Mercator scale at the AOI latitude.
- Full-scene cloud fraction is not a per-pixel cloud mask.
- No real facades, sub-metre imagery, fine building models, or certified precision.
- Max 9 km², max four 1-degree height tiles, max 50k mesh vertices and 262,144
  image texels. Provider HTTP errors cause explicit failure, never synthetic fallback.
- WebGL visualization is a browser capability; the Python/Node/CI process verifies
  data, geometry, embedded JavaScript syntax, texture PNG and UVs, but does not
  certify visual rendering in every GPU/browser combination.


## Stage 3: 3D point inspection and terrain profiles

Turn on **"Měřit na mapě"** in the standalone offline HTML viewer,
then click A and B on the rendered real DEM surface. Use ordinary drag to
orbit, and avoid dragging when selecting the measurement points.

The viewer reports WGS84 longitude/latitude and EGM2008 surface elevations,
approximate horizontal great-circle distance, difference B−A, average grade,
and a profile chart. The profile is interpolated between source DEM mesh
triangles, *not* independently surveyed or higher-resolution measurement.
Missing DEM pixels appear as **gaps**, not fabricated elevations.

Download:
- `praha-elevation-profile.csv` with distance, WGS84 location, and EGM2008 elevation (blank for missing data).
- `praha-elevation-profile.geojson` with selected endpoints and a 2D WGS84 LineString. Sample elevations including NoData are preserved in feature properties, rather than an invalid GeoJSON coordinate.

API:

```ts
import {sampleRealTerrain,profileRealTerrain} from "openlaunch-sdk";
const point=sampleRealTerrain(map,14.420,50.088); // null when no real DEM height
const profile=profileRealTerrain(map,[14.416,50.088],[14.426,50.088],{samples:64});
console.log(point?.elevationM,profile.horizontalDistanceM,profile.samples);
```

The demo output report includes a genuine center-point height and a
32-sample east-west profile as integration diagnostics. Surface-distance
estimates are approximate and only returned when the full profile has valid
DEM samples. The displayed 1–6x exaggeration **does not change measured heights**.
These are 30m Copernicus *surface* observations, not engineering-grade
survey measurements.
