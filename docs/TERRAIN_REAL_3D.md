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

## High-resolution Czech DMP OK elevation source (2026)

The new, officially published **ČÚZK DMP OK** supersedes the older DMP 1G.
ČÚZK's photogrammetric surface raster has a native **0.5m pixel size**
and contains roofs, vegetation and terrain. The SDK downloads raw
single-band **F32 TIFF elevation**, not hillshade imagery, from:

- Service: https://ags.cuzk.gov.cz/arcgis2/rest/services/dmp/ImageServer
- Metadata: https://geoportal.gov.cz/php/micka/en/record/basic/CZ-CUZK-DMPOK
- Copyright and licence: **© ČÚZK, CC BY 4.0**
  (https://creativecommons.org/licenses/by/4.0/)
- Height datum: **Bpv (Baltic 1957)**, not EGM2008. No height mixing.

**Run detail mode from Windows CMD:**

```cmd
cd /d "%USERPROFILE%\Desktop\openlaunch-terrain"
git switch feature/terrain-prague-real-dem
git pull --ff-only origin feature/terrain-prague-real-dem
npm run example:terrain-prague-detail
start "" "test-results\terrain-prague-detail\index.html"
```

Default AOI: `[14.416, 50.086, 14.422, 50.090]` Prague.
The resulting **2 m mesh** has 47,945 actual sampled vertices and
95,016 triangles. Source height pixels are native **0.5m**, but 2m grid
is used for manageable browser performance. Unlike simulated upsampling
of the GLO-30 30m DSM, the height source genuinely contains finer detail.
The RGB still comes from native **10m Sentinel-2**, so geometry is
sharper than image texture; future work can add real ČÚZK orthophoto.

SDK usage:

```ts
const map=await new OpenLaunch().terrain.load({
  area:bbox(14.416,50.086,14.422,50.090),
  elevationProvider:"cuzk-dmpok",resolutionM:2,
  startDate:"2025-06-01",endDate:"2025-09-30"
});
console.log(map.metadata.verticalDatum); // Bpv (Baltic 1957)
```

Bounded to max 9 km² AOI and 50,000 mesh vertices. Choose a sufficiently
small region at resolution >=0.5m. Service errors or NoData fail explicitly:
no synthetic interpolation or undisclosed global-DEM fallback. The height
sample grid is resampled from an actual 0.5m raster; this does not imply
0.5m precision in the rendered 2m model. Facade meshes are not reconstructed.

## Stage 5: actual Czech high-resolution ortho textured on real DMP OK

ČÚZK publishes its Ortofoto ČR product at **native source 0.125 m**.
We use the official `ORTOFOTO_WM/MapServer/export` Web Mercator map
service in PNG32 mode, explicitly requesting a bounded **0.5m output
texture**. Do not confuse output sampling with the native source grid.

Source: https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer
Product: https://geoportal.gov.cz/php/micka/record/basic/CZ-CUZK-ORTOFOTO-R
Licence: **© ČÚZK, CC BY 4.0**. The orthophoto map service does not
provide a per-pixel acquisition date, so the SDK records it as unknown
instead of inventing a date.

For Windows CMD run:

```cmd
cd /d "%USERPROFILE%\Desktop\openlaunch-terrain"
git switch feature/terrain-prague-real-dem
git pull --ff-only origin feature/terrain-prague-real-dem
npm run example:terrain-prague-ortho
start "" "test-results\terrain-prague-ortho\index.html"
```

The existing global Copernicus + Sentinel, or Czech DMP OK + Sentinel
demos are **unchanged**. In TypeScript:

```ts
const map=await new OpenLaunch().terrain.load({
  area:bbox(14.416,50.086,14.422,50.090),
  elevationProvider:"cuzk-dmpok",resolutionM:2,
  imageryProvider:"cuzk-ortofoto",orthophotoResolutionM:.5
});
console.log(map.metadata.imagerySource,map.metadata.verticalDatum);
```

Source 0.125m ortho is exported at 0.5m ground spacing to remain within
1024x1024 texture pixels and 50k DEM mesh vertices. It retains actual
colours and records both image and height attribution.
The backend **fails closed** for HTTP errors, unknown PNG formats,
invalid PNG checksums, unexpectedly small imagery, or a malformed
spatial extent. No fabricated texture or height data are substituted.

The 2m 2.5D surface still has roofs and foliage but does not recreate
walls, actual facade geometry or sub-2m 3D detail. Orthophoto mosaics may
have varied dates and building lean, meaning some pixels do not align
perfectly to individual roof edges. This is not a certified surveying
or photogrammetric reconstruction.

## Stage 6 — on-demand 4 km Prague, real-tile streaming + LOD

The previous `example:terrain-prague-ortho` still builds **one standalone
HTML** for a single 2m surface. For a *larger Prague area*, use a separate
on-demand mode backed by **the same public ČÚZK DMP OK and Ortofoto SDK**.

From Windows Command Prompt:

```cmd
cd /d "%USERPROFILE%\Desktop\openlaunch-terrain"
git switch feature/terrain-prague-real-dem
git pull --ff-only origin feature/terrain-prague-real-dem
npm run example:terrain-prague-stream
```

The command builds the SDK and starts a local HTTP server at
`http://127.0.0.1:8765/`, opening a browser automatically on Windows.
Keep the terminal **open** while using the browser; Ctrl+C stops the server.
For another port use:

```cmd
node scripts/terrain-prague-stream.mjs --port 8766 --no-open
```

**Actual region:** bounds `[14.400, 50.076, 14.454, 50.112]` (around
3.9 km east-west by 4.0 km north-south), centred on Prague.

| Level | Geographic grid | DEM output spacing | Ortho output spacing |
| --- | --- | --- | --- |
| Overview | 6 × 6 tiles | 12 m | 2 m |
| Fine | 12 × 12 tiles | 2 m | 0.5 m |

The **source raster** spacing is 0.5 m DMP OK and 0.125 m Ortofoto ČR.
Each requested tile is re-sampled from the *real Czech source*, **not**
generated by enlarging a lower-detail model. Small tile AOIs keep each
actual DMP OK mesh below the SDK limit of 50k vertices.

**How loading works:** the browser selects nearby overview tiles based on
camera position/distance. When zoomed in, it requests all four measured
fine tiles for at most two close overview areas, then atomically replaces
the overview geometry with the fine group (avoids overlapping LOD faces).
Unseen or distant fine tiles are not loaded on startup. Three browser
requests may run concurrently and the browser drops old GPU buffers /
textures when its 32-tile LRU cache becomes full.

The small local Node server binds to **127.0.0.1 only**, restricts
requests to predefined bounded tile paths, caps simultaneous source
downloads at two, queues at most 12, and writes obtained real data into
`test-results/terrain-prague-stream-cache/` as paired `.json` mesh and
`.png` texture files. Already downloaded tiles are reused on future
visits without downloading from ČÚZK again. Delete this directory if
you need to reclaim disk space. No credentials or external online
website are required; source downloads do require Internet access.

**Controls:** left mouse drag rotates; right drag or Shift-drag pans;
mouse wheel zooms; arrow keys/WASD move; one finger rotates and two
fingers pinch; 'Detail' toggles the on-demand 2m model; vertical scale
slider adjusts presentation only.

**Limitations / risks:** the first visit to an uncached location has a
network-dependent delay; ČÚZK can reject or delay some requests,
which are exposed as errors rather than replaced with fake data.
Distance-based tile selection is an approximation to the view footprint,
not a full camera-frustum visibility proof. Very large zoom transitions
can reveal gaps at neighbouring tile borders or a difference in mesh
resolution; stitching and proper geomorphing are future work.
Disk cache can grow as the user explores. The server is local,
**not** a deployable public multi-tenant API. No facade reconstruction,
photogrammetric buildings, or certified survey accuracy is claimed.

**Verification:** `node --test tests/terrain-prague-stream.test.mjs`,
`node scripts/terrain-webgl-link-smoke.mjs scripts/terrain-prague-stream-viewer.html`
(Windows Edge), and `node scripts/terrain-prague-stream-smoke.mjs`
(real ČÚZK HTTP tile, mesh provenance, texture PNG and disk cache).

## Stage 7 — frustum visibility, LOD hysteresis and crack-concealment

The streamed viewer now uses the actual **yaw, pitch, camera target,
distance and viewport aspect ratio** to conservatively cull terrain tiles
outside the camera view. The conservative projected bounding sphere includes
room for tall roof/terrain surfaces, so it may fetch a few extra tiles rather
than hide visible terrain. Up to 28 coarse tiles and 8 fine tiles may be
selected; the resident GPU cache is capped at 40 tiles.

**LOD hysteresis** enables fine source tiles on zoom-in at 1,250 m and
disables them only after zoom-out at 1,750 m. The selected groups also have
a positional hysteresis margin to avoid downloading different four-tile
blocks on tiny camera movements. When all four real fine tiles are loaded,
a 480 ms 4×4 ordered-dither screen-door transition swaps the group
progressively while maintaining true source-derived fine heights.
Only the presentation is mixed; the DMP OK elevations stay unchanged.

**Seam cover, not invented measurement:** independent source DSM grids
have pixel-centre locations a small distance inside each requested tile
boundary. A visual-only apron duplicates the *observed boundary height* out
to the shared geographic tile outline, and a vertical 18 m skirt extends
down from that outline to conceal small differences between neighbouring
LOD meshes. All measured positions, source DEM data and source triangles
are retained. The new vertices and skirt faces are marked explicitly as
**visualization-only** in the version-2 tile metadata. This is neither
additional measured terrain nor a geodetically precise edge interpolation.

The streamed viewer now fetches full render positions, explicit texture
coordinates and the seam-index buffer via the local tile server, with
WebGL1-safe 16-bit indices. Version-2 tiles are stored separately as
`v2-*.json` and `v2-*.png`, so the old cache is not misinterpreted.
Delete `test-results/terrain-prague-stream-cache/` when you no longer
need old tile caches; nothing outside this directory is affected.

**Known risks:** a steep discontinuity larger than the skirt depth or
missing observed pixels along a tile perimeter may still leave a visible
gap. Screen-door fading is a visual presentation technique that can show
a subtle stipple pattern during the brief transition. Frustum culling
uses conservative bounds rather than an occlusion or horizon renderer.
These methods improve interactive continuity but do **not** yield a
watertight survey-grade mesh or vertical building façades.

Tests: `node --test tests/terrain-prague-stream.test.mjs` verifies actual
camera-dependent visibility, hysteresis, shared boundaries and unchanged
measured elevations. The Windows workflow also compiles both streamed and
standalone GLSL shaders in Microsoft Edge and downloads a real v2 ČÚZK
height/orthophoto tile through localhost.


## Stage 8 — streamed real-terrain click inspection and Bpv A/B profile

Start with `npm run example:terrain-prague-stream` in the existing feature branch.
Enable **Měřit skutečný terén** in the toolbar, click a visible source-DSM
triangle as point A, then point B. Drag still orbits the camera; two clicks
without dragging add points. Clear them with **Vymazat body**.

The panel reports approximate WGS84 location, interpolated elevation
in **Bpv (Baltic 1957)** metres, local-metre A–B horizontal distance,
vertical difference, slope and a 32-sample height profile. Use
**Profil CSV** to export distance, longitude, latitude, and Bpv height
columns. Missing samples are **blank**, never invented or replaced by zero.

**Data meaning:** the actual Czech DMP OK source is native 0.5 m,
but streamed overview and fine triangles are generated from output
grids of 12 m or 2 m respectively. A picked value is an *exact
barycentric interpolation of those measured-source output triangles*,
not a directly surveyed observation at arbitrary clicked coordinates.
The displayed 1–5x vertical exaggeration does not change the returned
Bpv height. WGS84 positions are derived from a bounded Mercator local
approximation and are not surveying-grade coordinates.

Picking is restricted to the original **measuredTriangles** portion
of each SDK output index array. Extra visual-only edge aprons and
skirt triangles can never create fictitious measured point heights.
For performance, vertical profile queries use a cached tile grid mask
built from the actual measured triangle indices (near-constant work
per sample) rather than rescan the entire 2m mesh 32 times.

**Unloaded or NoData terrain:** no click result when actual triangles
are absent; profiles over partially loaded or missing regions include
null height samples and do not claim complete surface distance.
Pan/zoom to load source tiles before inspecting long paths.

**WebGL context loss:** the viewer handles browser context loss and
restoration; old in-flight GPU work is rejected after loss and the
shaders plus tiles are re-created from the locally cached real data.
Hardware/browser-specific rendering remains a user-device test.

Verification: `node --test tests/terrain-prague-stream-inspect.test.mjs`
(perspective ray, measured barycentric Bpv altitude, NoData gaps,
no picking on visual skirts, WGS84 orientation, nullable profile,
height exaggeration invariance) and a live ČÚZK tile HTTP integration
checking the original measured triangle's interpolated Bpv height.
