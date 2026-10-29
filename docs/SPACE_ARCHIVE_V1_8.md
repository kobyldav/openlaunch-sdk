# OpenLaunch SDK v1.8 — Space Archive & Playback

**State:** Development PR. No npm publication or production service verification implied.

## Goal
A map website should consume space-data APIs of the OpenLaunch SDK instead of implementing provider integrations itself. This version unifies provider-specific map history into a single typed format.

## NASA GIBS daily archive

```ts
import { SpaceMapClient } from "@openlaunchsdk/earth";
const sdk = new SpaceMapClient();
const timeline = await sdk.archivePlayback({
  source:"nasa-gibs",
  layer:"MODIS_Terra_CorrectedReflectance_TrueColor",
  from:"2026-10-01",to:"2026-10-05",maxFrames:5,
  verifyLast:2,sampleTile:{z:2,x:1,y:1}
});
```

Frames carry `mapKind:"wmts-xyz"`, NASA attribution, `mapUrl` with `{z}/{y}/{x}`, requested **day**, `observedAt:null`, and a delivery state. A `sample-available` check verifies just ONE chosen tile, **not** an entire NASA scene. NASA GIBS may have partial spatial coverage or delayed products. Without `verifyLast` no network image probes are performed.

## Meteosat archive

```ts
const timeline = await sdk.archivePlayback({
  source:"meteosat",layer:"<actual ID from meteosatCapabilities()>",
  bounds3857:[1300000,6200000,1900000,6900000],
  width:512,height:512,maxFrames:12,verifyLast:3
});
```

Frames use `mapKind:"wms-image"` and the provider's actual advertised WMS time dimension; `image-available` means a valid JPEG/PNG response was downloaded by SDK (via existing v1.6/v1.7 caches). **Not** proof of capture timestamp. Unsupported/missing TIME dimensions return zero frames with explicit `timelineStatus`. Each requested verification is bounded, sequential and backend-oriented.

Both provider variants report `delivery` (`unchecked`, `sample-available`, `image-available`, `unavailable`, `error`), `checkedAt`, `verifiedScope`, `fullImageReady`, `verifiedFrames`, and `verifiedAcquisition:false`. This allows a frontend to render a time slider with correct provenance.

## Limits
- This is a map timeline API, **not** a persistent local archive or a video encoder.
- Does not cache NASA GIBS tiles between checks; Meteosat checks benefit from the existing image caches.
- API rate and storage limits of NASA and EUMETSAT apply. The caller must throttle and cache backend HTTP responses.
- Dataset attribution/licensing remains with NASA/EUMETSAT.
- Actual sensor acquisition is not independently established from the request date or advertised WMS TIME.
- Tests use mocked official APIs, so no actual provider uptime is asserted.

## Quick Fedora smoke
```bash
git fetch origin
git switch feature/space-archive-playback-v1.8.0
git pull --ff-only origin feature/space-archive-playback-v1.8.0
npm ci
npm run example:space-archive
```
Expected: `PASS OpenLaunch v1.8 Space Archive & Playback`, three NASA days, three Meteosat WMS frames and four provider requests.
