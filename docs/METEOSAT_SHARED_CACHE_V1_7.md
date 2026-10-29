# OpenLaunch v1.7 — shared satellite image cache

**Status:** development branch, PR awaiting CI and Fedora smoke. This extends v1.6's local LRU with optional shared persistence.

## Use in a Cloudflare Worker

```ts
import { SpaceMapClient, MeteosatCloudflareKvStore } from "@openlaunchsdk/earth";

// Configure a KV namespace binding called SPACE_IMAGES in Wrangler.
const sharedStore = new MeteosatCloudflareKvStore(env.SPACE_IMAGES, {
  prefix: "openlaunch:meteosat:v1"
});
const maps = new SpaceMapClient({
  meteosatCache: { ttlMs: 300_000, maxEntries: 24, maxBytes: 32*1024*1024,
                   sharedStore }
});
const frame = await maps.meteosatImage({
  layer:"<actual EUMETView layer>",bounds3857:[1300000,6200000,1900000,6900000],
  width:256,height:256,time:"2026-10-19T10:00:00Z"
});
console.log(frame.cacheState, frame.image.byteLength);
```

KV binding is provided by the hosting application. No credentials, routes or hardcoded namespaces are in SDK. Custom storage can implement `MeteosatSharedImageStore` via its `get(url)` and `put(url, {image,contentType,expiresAt})` methods.

## Safety and consistency

- Only canonical official EUMETView WMS `GetMap` URLs with explicit `TIME` are accepted for KV keys.
- SHA-256 via Web Crypto makes stable, short KV keys; record is a versioned binary blob with MIME and absolute expiration. Cloudflare supplies global Web Crypto. For Node 18 host tests without global crypto, pass `digest: buffer => webcrypto.subtle.digest("SHA-256", buffer)` from `node:crypto` as an adapter option.
- Read data is never considered valid unless in-date, within local byte budget, correct MIME and matching PNG/JPEG signature.
- Failed read/write operations do not prevent the SDK from fetching images from the official provider.
- Local LRU, same-process in-flight deduplication and isolated byte copies remain intact.
- KV expiration has minimum 60 seconds; absolute record expiry is checked independently to enforce shorter logical TTL.
- Cloudflare KV is eventually consistent and **cannot atomically deduplicate across all locations**; simultaneous cold misses may still repeat provider requests.
- `clearMeteosatCache()` clears **local** memory only; the shared KV retains data until TTL. To invalidate all regions, rotate the namespace prefix or delete objects externally.
- This is an image transport cache, **not a long-term observation archive** and does not prove satellite acquisition times or publish a live camera.
- Respect provider licenses, acceptable use and attribution; expose these data only through an authenticated or throttled backend route.

## Offline Fedora test

```bash
git fetch origin
git switch feature/meteosat-shared-cache-v1.7.0
git pull --ff-only origin feature/meteosat-shared-cache-v1.7.0
npm ci
npm run example:meteosat-shared-cache
```

Expected: `PASS OpenLaunch v1.7 shared Meteosat cache`, `Provider downloads: 1`, `Second SDK cache state: shared-hit`. This is mocked KV/WMS; it does not assert real provider availability.
