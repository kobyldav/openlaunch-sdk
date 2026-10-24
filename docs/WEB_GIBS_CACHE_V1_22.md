# OpenLaunch SDK v1.22 — NASA GIBS Tile Cache & Batch

**Status:** feature branch, not published or deployed. v1.21 remains in main.

## New API

```ts
import {SpaceMapClient} from "@openlaunch/earth";
const maps=new SpaceMapClient({
 webMapTileCache:{ttlMs:300_000,maxEntries:32,maxTotalBytes:8*1024*1024},
 webMapTileMaxBytes:512*1024,
 webMapTileTimeoutMs:8_000,
});
const tile={layer:"nasa-modis-terra",date:"2026-10-17",z:5,x:17,y:11};
const single=await maps.webMapDailyTileCached(tile);
const batch=await maps.webMapDailyTilesBatch({
 tiles:[tile,{...tile,x:18}],
 concurrency:2,
});
maps.webMapTileCacheStats();
maps.clearWebMapTileCache();
```

The existing `webMapDailyTile()` remains an uncached one-off request for callers who need one fresh verification. `webMapDailyTileCached()` marks requests with `cacheStatus:"fetched" | "hit" | "shared"`. `webMapDailyTilesBatch()` returns the input-order `results` array plus counts by tile status, cache hits and in-flight sharing. Other existing OpenLaunch methods are unchanged.

## Bounded resource behavior

| Resource | Default | Hard limit |
|---|---:|---:|
| Tiles per batch | caller-selected | 16 |
| Batch concurrent workers | 3 | 4 |
| Cache time to live | 300 s | 3,600 s |
| Cache entries | 32 | 128 |
| Cache total image bytes | 8 MiB | 32 MiB |
| One NASA tile download | 512 KiB | 2 MiB |
| One NASA tile request | 8 s | 30 s |

Only bytes actually verified as PNG or JPEG according to `webMapDailyTile()` are retained. Missing tiles, provider errors, timeouts, oversized responses and invalid MIME/signature are never stored. Hit and shared results get copied Uint8Array bytes; a browser consumer cannot change previously cached bytes. LRU evicts least recently used entries if memory/count cap would be exceeded. The entire batch is prevalidated before initiating any network access; malformed XYZ or unsupported layer fails the batch rather than partially fetching tiles.

An entire batch can still hold up to 16 distinct image bodies in caller memory even though the persistent cache has its own cap. The SDK never asserts acquisition timestamps or Earth pixel coverage. Binary delivery evidence is **not** proof that a tile contains the requested day's sensor acquisition, because NASA daily composites can include placeholders or delayed data.

## Cloudflare runtime

The cache is a normal JavaScript Map bound to one `SpaceMapClient` instance. Construct the client once at module scope for meaningful reuse inside a Cloudflare Worker isolate, but do not assume the isolate survives or shares cache across regions. Durable cache/Cloudflare KV, account-wide quotas, outbound budgets and Web API endpoint authorization belong to deployment architecture and are not implemented in v1.22. Invalidating the cache only affects that instance.

No real NASA upstream connection or Cloudflare production deployment is claimed by the offline deterministic tests.

## Fedora check

```bash
git fetch origin
git switch feature/gibs-tile-cache-batch-v1.22.0
git pull --ff-only origin feature/gibs-tile-cache-batch-v1.22.0
npm ci
npm run example:web-map-tile-cache
npm test
```

Expected smoke starts `PASS OpenLaunch v1.22 GIBS Tile Cache & Batch`, reports three requested tiles but two unique provider fetches, followed by three hits on a second identical batch. GitHub Actions separately checks Node.js 18, 20, 22 and the independent OpenJPEG/WASM integration.
