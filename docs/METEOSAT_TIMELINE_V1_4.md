# OpenLaunch v1.4 — Meteosat WMS Time timeline

**Development branch** `feature/meteosat-timeline-v1.4.0`. This changes real provider metadata handling, not satellite sensor hardware or video streaming.

## Usage

```ts
import { SpaceMapClient } from "@openlaunchsdk/earth";
const client = new SpaceMapClient();
const capability = await client.meteosatCapabilities();
const selected = capability.layers.find(l => l.timeDimension);
if (!selected) throw new Error("No time-aware WMS layer found");
const timeline = await client.meteosatTimeline({
  layer: selected.id,
  bounds3857: [1300000,6200000,1900000,6900000],
  width: 512, height: 512, maxFrames: 12
});
console.log(timeline.status, timeline.frames);
```

Each frame carries `advertisedTime` from EUMETView WMS GetCapabilities, a `request.url` with explicit TIME and georeferenced EPSG:3857 bounds, `acquiredAt:null`, `verifiedAvailable:false`. Metadata may describe frames that have not been published or no longer exist. Use `client.probeImage({source:"meteosat",map:{layer:...,time:...,bounds3857,width,height}})` to test a *specific frame image* (with backend caching/rate limits); even success is not independently verified time of acquisition.

The time parser supports comma-separated absolute ISO timestamps and start/end/period intervals with fixed PnD/PTnH/PTnM/PTnS durations. Values such as `current`, month-dependent periods, unknown named temporal tokens and malformed ranges are ignored instead of invented. Intervals are expanded from the end for at most 48 latest entries and future times after capabilities retrieval are excluded.

WMS capabilities parser tracks nested layers, name/title/time and inheritance, bounded to 4 MiB. It rejects DOCTYPE/ENTITY input and fails on malformed nesting. This is a bounded WMS metadata reader, **not a general-purpose XML processor**.

## Fedora smoke

```bash
git switch feature/meteosat-timeline-v1.4.0
git pull --ff-only origin feature/meteosat-timeline-v1.4.0
npm ci
npm run example:meteosat-timeline
```

Expected: `PASS OpenLaunch v1.4 Meteosat provider-time timeline`, three requested mock frames, `Verified satellite capture: false`. No keys/network needed after npm dependencies are installed.

To also query **real** EUMETView (optional): `METEOSAT_LIVE=1 npm run example:meteosat-timeline`. Live availability is subject to EUMETSAT quotas, server metadata structure and deployed products. The smoke does not force a GetMap download or assert actual acquisition.

## Limits

- Not yet a complete video player or geospatial animation renderer.
- WMS Time dimensions can be absent or use a grammar not supported by this parser; SDK explicitly returns zero frames/status.
- Stale provider GetCapabilities and image product lifecycle can make advertised frames unavailable. API clients should independently cache and throttle requests.
- ISO8601 month/year intervals intentionally unsupported (variable duration).
- Source and imagery credits remain EUMETSAT's; SDK is the integration/analysis infrastructure.
