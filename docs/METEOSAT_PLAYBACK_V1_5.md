# OpenLaunch v1.5 — Meteosat frame verification

Backend service example:

```ts
import { SpaceMapClient } from "@openlaunch/earth";
const client = new SpaceMapClient();
const result = await client.meteosatPlayback({
  layer:"<layer advertised by Meteosat capabilities>",
  bounds3857:[1300000,6200000,1900000,6900000],
  width:256,height:256,maxFrames:6,maxChecks:4
});
console.log(result.playableFrames,result.frames);
```

The API selects at most 12 advertised frames and fetches their images **sequentially**. It reports image delivery (and 404/410), image URLs and timestamps from WMS capabilities. It does not prove a satellite's true acquisition timestamp or validate pixel geography. Invalid images produce `error`; frames without delivered imagery are not marked playable. Provider quotas and copyrights apply.

Local Fedora smoke: `git switch feature/meteosat-frame-verification-v1.5.0 && git pull --ff-only origin feature/meteosat-frame-verification-v1.5.0 && npm ci && npm run example:meteosat-playback`.

Expected: `PASS OpenLaunch v1.5 Meteosat frame verification`, 2 playable frames / 3 checked. Offline fixture, not a live-provider guarantee. This API does not download all map imagery for the browser or provide a video player. Cache WMS results and throttle public requests server-side.
