# OpenLaunch v1.5 — Meteosat frame playback SDK

Status: **development**. Builds on the v1.4 Meteosat timeline already merged into `main` via PR #14.

**Parallel work:** PR #15 proposes a metadata-only frame availability checker with the same public method name `meteosatPlayback()`. PR #16 adds actual image bytes. These PRs are alternatives and must not both be merged unchanged. Select a single SDK contract before releasing v1.5.

## New SDK-only function

```ts
import { SpaceMapClient } from "@openlaunch/earth";
const client=new SpaceMapClient();
const caps=await client.meteosatCapabilities();
const layer=caps.layers.find(x=>x.timeDimension);
if(!layer)throw new Error("No Meteosat layer with time metadata");
const playback=await client.meteosatPlayback({
  layer:layer.id,
  bounds3857:[1300000,6200000,1900000,6900000],
  width:512,height:512,maxFrames:6,maxTotalBytes:12*1024*1024,
});
for(const frame of playback.frames){
  if(frame.status==="available"){
    // Expose frame.image via a backend endpoint after setting Content-Type.
    // Render it in Leaflet/MapLibre with the frame.request.coordinateBounds3857.
    console.log(frame.advertisedTime,frame.contentType,frame.byteLength);
  }
}
```

The SDK retrieves the WMS GetCapabilities response, extracts only provider-advertised exact times, then performs sequential GetMap requests. Each result reports `available`, `unavailable` (404/410), `error` or `skipped-budget`. Only validated PNG/JPEG magic signatures and image MIME count as successful image responses; content-type spoofing or WMS XML errors are rejected.

- `acquiredAt:null` and `verifiedAcquisition:false` **even after an image downloads**: GetMap might have selected a fallback/default snapshot; the requested TIME is *not* scientific provenance.
- No fabricated live streams, synthetic acquisition dates or replay FPS guarantee.
- At most 12 image GetMap requests, sequentially, per call; 32 MiB maximum retained frame data, default 12 MiB; each underlying request is already bounded by the EO HTTP reader (max 8 MiB).
- When budget is exceeded, current and subsequent frames are marked `skipped-budget` and image bytes are not retained.
- Render and cache frames in the consuming backend; the SDK does not ship a UI player and does not convert images to a map data product or embed video.
- Source imagery belongs to EUMETSAT, subject to applicable terms and attribution. Cloudflare Worker/storage caches must respect upstream limits.

## Fedora verification

```bash
git fetch origin
git switch feature/meteosat-playback-v1.5.0
git pull --ff-only origin feature/meteosat-playback-v1.5.0
npm ci
npm run example:meteosat-playback
```

Offline expected: `PASS OpenLaunch v1.5 Meteosat frame playback`, with 2 mock images, 1 404 and 1 rejected WMS exception, and `Verified satellite acquisition: false`.

Opt-in real provider check: `METEOSAT_LIVE=1 npm run example:meteosat-playback`. It will reach EUMETSAT without a secret and **may fail** if no compatible product is currently publicly served. Treat as diagnostics rather than provider uptime proof.

Tests run on Node.js 18/20/22 via GitHub CI, including isolated workspace package installs. This branch does not publish scoped packages to npm or modify `main`.
