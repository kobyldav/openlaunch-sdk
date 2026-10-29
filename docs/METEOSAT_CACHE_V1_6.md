# OpenLaunch v1.6 — Meteosat image cache

**Development branch:** `feature/meteosat-image-cache-v1.6.0`. Not yet npm published or merged into main.

## Purpose

Previous v1.5 `meteosatPlayback()` verifies individual WMS images, but repeats upstream downloads when a user replays the same timestamps. This release adds an SDK-owned in-memory cache for **validated binary image bytes**, not a browser-only response metadata cache.

```ts
import { SpaceMapClient } from "@openlaunchsdk/earth";
const maps = new SpaceMapClient({meteosatCache:{
  ttlMs:300_000, maxEntries:24, maxBytes:32*1024*1024
}});
const image = await maps.meteosatImage({
  layer:"<current official WMS layer>",bounds3857:[1300000,6200000,1900000,6900000],
  width:256,height:256,time:"2026-10-19T10:00:00Z"
});
console.log(image.cacheState, image.contentType, image.image.byteLength);
console.log(maps.meteosatCacheStats());
```

- `meteosatImage` retrieves the actual `Uint8Array`, content type, request descriptor and `cacheState`: miss, hit, coalesced or bypass.
- `meteosatPlayback` and `probeImage` reuse the same cache within one `SpaceMapClient` instance.
- Explicit TIME is required for retention. Dynamic default WMS time is always fetched.
- A five-minute TTL, max 24 entries, max 32 MiB total are defaults; options have strict upper bounds.
- Two simultaneous equivalent WMS URL requests share one network request, reducing avoidable upstream load.
- Least-recently-used entries are evicted to stay under configured memory limits.
- Errors, HTTP 404/410 and incorrect binary signatures are not cached.
- Buffer copies prevent mutation of returned data corrupting future requests.
- `clearMeteosatCache()` invalidates existing entries without letting pending requests repopulate that cache.

## Known limitations

This cache is memory-local per SDK client instance; it is NOT persistent, shared across server replicas, nor a disk/CDN cache. It does not make the EUMETView WMS service more up to date and a received image **never proves real satellite acquisition time**. The SDK does not create a Cloudflare Worker route, UI player or long-term archive. A production site should reuse a single SDK instance when appropriate and secure its image-serving endpoint with quotas. Always respect provider terms and attribution.

## Offline smoke on Fedora

```bash
git fetch origin
git switch feature/meteosat-image-cache-v1.6.0
git pull --ff-only origin feature/meteosat-image-cache-v1.6.0
npm ci
npm run example:meteosat-cache
```

Expected: `PASS OpenLaunch v1.6 Meteosat image cache`; first playback: 3 provider image requests; second playback: 3 cache hits; `Acquisition time verified: false`. Uses deterministic WMS mock responses, so it does not prove current EUMETSAT availability.
